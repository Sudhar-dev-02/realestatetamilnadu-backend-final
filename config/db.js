const mongoose = require('mongoose');

// Disable Mongoose indefinite command buffering so queries fail fast when disconnected
mongoose.set('bufferCommands', false);

// Connection event listeners for robust operational monitoring
mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB Disconnected]: Database connection lost. Awaiting reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('[MongoDB Reconnected]: Database connection re-established.');
});

mongoose.connection.on('error', (err) => {
  console.error('[MongoDB Error]:', err.message);
});

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/realestate_tamilnadu';

  try {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB Connected]: ${conn.connection.host} / Database: ${conn.connection.name}`);

    // Asynchronously backfill legacy property IDs in the background without blocking boot
    setImmediate(async () => {
      try {
        const { Property } = require('../models/Property');
        const missingProperties = await Property.find({
          $or: [{ propertyId: null }, { propertyId: { $exists: false } }, { propertyId: '' }],
        }).limit(100);

        if (missingProperties.length > 0) {
          console.log(`[Property Backfill]: Assigning unique propertyId to ${missingProperties.length} properties...`);
          for (const prop of missingProperties) {
            prop.propertyId = `RETN-PROP-${prop._id.toString().slice(-6).toUpperCase()}`;
            await prop.save();
          }
          console.log(`[Property Backfill]: Batch updated with unique IDs.`);
        }
      } catch (backfillErr) {
        console.warn('[Property Backfill Warning]:', backfillErr.message);
      }
    });

    return conn;
  } catch (error) {
    console.error(`[MongoDB Connection Error]: ${error.message}`);
    console.warn(`Tip: Ensure MongoDB is running locally on port 27017 or update MONGO_URI in backend/.env`);
    throw error;
  }
};

module.exports = connectDB;

