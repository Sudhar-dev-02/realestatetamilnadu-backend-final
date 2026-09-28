const { sendError } = require('../utils/apiResponse');

/**
 * Handle 404 Route Not Found
 */
const notFound = (req, res, next) => {
  return sendError(res, `Endpoint not found - ${req.originalUrl}`, 404);
};

/**
 * Global centralized error handler
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  // Mongoose bad ObjectId (CastError)
  if (err.name === 'CastError') {
    message = `Resource not found with ID: ${err.value}`;
    statusCode = 404;
  }

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    message = `Duplicate field value entered for "${field}": "${value}". Please use another value.`;
    statusCode = 409;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    message = 'Validation Error';
    statusCode = 422;
    errors = Object.values(err.errors).map((val) => ({
      field: val.path,
      message: val.message,
    }));
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    message = 'Invalid authentication token';
    statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    message = 'Authentication token expired';
    statusCode = 401;
  }

  // Log non-operational errors in development
  if (process.env.NODE_ENV === 'development' && statusCode === 500) {
    console.error('[Unhandled Server Error]:', err);
  }

  return sendError(res, message, statusCode, errors);
};

module.exports = {
  notFound,
  errorHandler,
};
