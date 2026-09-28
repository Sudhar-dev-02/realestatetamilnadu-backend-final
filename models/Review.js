const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Reviewer name is required'],
      trim: true,
    },
    role: {
      type: String,
      default: 'Property Buyer',
      trim: true,
    },
    quote: {
      type: String,
      required: [true, 'Review quote/message is required'],
      trim: true,
    },
    avatar: {
      type: String,
      default: '/images/avatar/avt-png1.png',
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 5,
    },
    featured: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Review', ReviewSchema);
