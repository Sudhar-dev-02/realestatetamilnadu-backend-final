const mongoose = require('mongoose');

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      trim: true,
      unique: true,
    },
    desc: {
      type: String,
      default: 'Join us every month for a very reasonable price',
      trim: true,
    },
    monthlyPrice: {
      type: Number,
      required: [true, 'Monthly price is required'],
      min: 0,
    },
    annualPrice: {
      type: Number,
      required: [true, 'Annual price is required'],
      min: 0,
    },
    popular: {
      type: Boolean,
      default: false,
    },
    features: [
      {
        text: { type: String, required: true },
        included: { type: Boolean, default: true },
      },
    ],
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

module.exports = mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
