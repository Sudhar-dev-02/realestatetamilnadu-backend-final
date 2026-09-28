const mongoose = require('mongoose');

const OtpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  otp: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['FORGOT_PASSWORD', 'VERIFICATION'],
    default: 'FORGOT_PASSWORD',
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // MongoDB TTL Index: auto expires after 10 minutes (600 seconds)
  },
});

module.exports = mongoose.model('Otp', OtpSchema);
