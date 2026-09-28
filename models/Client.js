const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Client/Partner name is required'],
      trim: true,
    },
    logo: {
      type: String,
      default: '',
    },
    website: {
      type: String,
      trim: true,
      default: '',
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Client', ClientSchema);
