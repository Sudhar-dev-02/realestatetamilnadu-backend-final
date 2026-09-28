const mongoose = require('mongoose');

const PromotionRequestSchema = new mongoose.Schema(
  {
    mediator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Mediator reference is required'],
      index: true,
    },
    promotionCategory: {
      type: String,
      enum: ['TOP_LISTING', 'SOCIAL_MEDIA'],
      default: 'TOP_LISTING',
      index: true,
    },
    // Top Listing specific details
    topListingScope: {
      type: String,
      enum: ['district_wise', 'overall'],
      default: 'district_wise',
    },
    selectedDistrict: {
      type: String,
      trim: true,
      default: '',
    },
    durationPlan: {
      type: String,
      enum: ['1_week', '1_month'],
      default: '1_week',
    },
    durationDays: {
      type: Number,
      default: 7,
    },
    // Social Media specific details
    socialMediaPlanId: {
      type: String,
      default: '',
    },
    socialMediaPlanName: {
      type: String,
      default: '',
    },
    socialMediaServices: {
      type: [String],
      default: [],
    },
    // Property association
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
      index: true,
    },
    // Payment details
    amountPaid: {
      type: Number,
      default: 0,
    },
    paymentReceipt: {
      type: String,
      default: '',
    },
    transactionId: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'in_progress', 'completed', 'rejected', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
      index: true,
    },
    adminNotes: {
      type: String,
      default: '',
    },
    // Backward compatibility for existing records
    promotionType: {
      type: String,
      default: 'TOP_LIST_LANDING',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for user promotions and transaction lookups
PromotionRequestSchema.index({ mediator: 1, createdAt: -1 });
PromotionRequestSchema.index({ transactionId: 1 });
PromotionRequestSchema.index({ property: 1, status: 1 });

module.exports = mongoose.model('PromotionRequest', PromotionRequestSchema);
