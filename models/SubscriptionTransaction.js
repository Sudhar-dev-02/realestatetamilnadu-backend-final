const mongoose = require('mongoose');

const SubscriptionTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    userName: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
    },
    userRole: {
      type: String,
      enum: ['SUPER_ADMIN', 'MEDIATOR', 'SELLER', 'USER', 'seller', 'mediator'],
      default: 'MEDIATOR',
    },
    userEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    planName: {
      type: String,
      required: [true, 'Plan name is required'],
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'annual', 'one_time', 'pay_per_listing'],
      default: 'monthly',
    },
    amountPaid: {
      type: Number,
      required: [true, 'Amount paid is required'],
    },
    currency: {
      type: String,
      default: 'INR',
    },
    transactionStatus: {
      type: String,
      enum: ['success', 'pending', 'failed', 'refunded'],
      default: 'success',
    },
    paymentMethod: {
      type: String,
      default: 'Credit Card / UPI',
    },
    transactionId: {
      type: String,
      unique: true,
      required: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: false,
    },
    propertyTitle: {
      type: String,
      trim: true,
      default: '',
    },
    propertyCity: {
      type: String,
      trim: true,
      default: '',
    },
    propertyType: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookup by user, status, and creation date
SubscriptionTransactionSchema.index({ user: 1, createdAt: -1 });
SubscriptionTransactionSchema.index({ transactionStatus: 1 });
SubscriptionTransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SubscriptionTransaction', SubscriptionTransactionSchema);
