const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

// Ensure JWT_SECRET is explicitly configured
if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY WARNING]: JWT_SECRET is not configured in backend/.env!');
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL]: Cannot run in production without a secure JWT_SECRET.');
    process.exit(1);
  }
}

// Database Connection
const connectDB = require('./config/db');

// Route Handlers
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const mediatorRoutes = require('./routes/mediatorRoutes');
const sellerRoutes = require('./routes/sellerRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const publicSettingsRoutes = require('./routes/publicSettingsRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const shareRoutes = require('./routes/shareRoutes');

// Middleware Handlers
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { sendSuccess } = require('./utils/apiResponse');

// Initialize Express
const app = express();

// Ensure local uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded media statically
app.use('/uploads', express.static(uploadsDir));

// Security and Utility Middlewares
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate Limiters to protect against brute-force and DoS
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again after a few minutes.',
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login/registration attempts. Please try again after 15 minutes.',
  },
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again after an hour.',
  },
});

app.use('/api', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password/send-otp', otpLimiter);
app.use('/api/auth/forgot-password/resend-otp', otpLimiter);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  return sendSuccess(res, 'Real Estate Tamil Nadu Backend API is healthy and operational', {
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

// API Routes
app.use('/api/public', publicSettingsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/mediator', mediatorRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/payment', paymentRoutes);

// Dynamic Social OG Metadata Sharing Routes (/property/:id, /p/:id)
app.use(shareRoutes);

// Centralized Error Handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

let server;
if (require.main === module) {
  // Await database connection before opening HTTP server port
  connectDB()
    .then(() => {
      server = app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(` Real Estate Tamil Nadu - Backend API Server`);
        console.log(` Mode: ${process.env.NODE_ENV || 'development'}`);
        console.log(` Port: ${PORT}`);
        console.log(` Health Check: http://localhost:${PORT}/api/health`);
        console.log(`=======================================================`);

        // Periodic background maintenance for expired top listings (every 30 minutes)
        try {
          const { Property } = require('./models/Property');
          setInterval(async () => {
            try {
              const now = new Date();
              await Property.updateMany(
                { 'topListing.isActive': true, 'topListing.endDate': { $lt: now } },
                { $set: { 'topListing.isActive': false } }
              );
            } catch (maintenanceErr) {
              console.warn('[Maintenance] TopListing cleanup warning:', maintenanceErr.message);
            }
          }, 30 * 60 * 1000);
        } catch (e) {
          // Ignore
        }
      });
    })
    .catch((err) => {
      console.error(`[FATAL]: Server failed to connect to database: ${err.message}`);
      server = app.listen(PORT, () => {
        console.warn(`[WARN] Server listening on port ${PORT} with DB disconnected.`);
      });
    });
}

// Handle unhandled promise rejections gracefully
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
});

module.exports = app;

