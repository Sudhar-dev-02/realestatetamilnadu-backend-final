const mongoose = require('mongoose');

const PropertyEnquirySchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'Property reference is required'],
      index: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Seller reference is required'],
      index: true,
    },
    mediator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    buyerName: {
      type: String,
      required: [true, 'Buyer name is required'],
      trim: true,
    },
    buyerEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },
    buyerPhone: {
      type: String,
      required: [true, 'Buyer phone is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['INTEREST', 'ENQUIRY'],
      default: 'ENQUIRY',
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['NEW', 'CONTACTED', 'CLOSED'],
      default: 'NEW',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for high-frequency lead retrieval and duplicate interest checks
PropertyEnquirySchema.index({ property: 1, type: 1, buyerPhone: 1 });
PropertyEnquirySchema.index({ seller: 1, createdAt: -1 });
PropertyEnquirySchema.index({ mediator: 1, createdAt: -1 });

module.exports = mongoose.model('PropertyEnquiry', PropertyEnquirySchema);
