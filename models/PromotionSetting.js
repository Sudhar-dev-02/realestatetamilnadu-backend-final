const mongoose = require('mongoose');

const SocialMediaPlanSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  badge: { type: String, default: '' },
  services: { type: [String], default: [] },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
});

const PromotionSettingSchema = new mongoose.Schema(
  {
    qrCodeImage: {
      type: String,
      default: '',
    },
    // Top Listing Pricing Matrix
    topListingPricing: {
      districtWise: {
        oneWeek: { type: Number, default: 299 },
        oneMonth: { type: Number, default: 999 },
      },
      overall: {
        oneWeek: { type: Number, default: 599 },
        oneMonth: { type: Number, default: 1999 },
      },
    },
    // Seller Property Listing Quota & Pricing Settings (Pay-Per-Listing Model)
    sellerListingSettings: {
      freeListingLimit: { type: Number, default: 1 }, // Number of properties a seller can list for FREE
      paidListingFee: { type: Number, default: 99 },   // Price in INR charged for each additional property listing
    },
    // Seller Premium Plan Pricing (Legacy)
    sellerPlanPricing: {
      monthly: { type: Number, default: 99 },
      annual: { type: Number, default: 999 },
    },
    // Social Media Plans
    socialMediaPlans: {
      type: [SocialMediaPlanSchema],
      default: [
        {
          id: 'starter_social',
          name: 'Starter Social Boost',
          price: 999,
          badge: 'Popular',
          services: [
            'Dedicated Instagram Reel & Story Showcase',
            'Facebook Real Estate Group Distribution (10+ Active Groups)',
            'Targeted WhatsApp Broadcast to 2,500+ Buyers',
            'Professional Property Promo Poster Design',
            'Direct Campaign Guidance Call by Admin Team',
          ],
          description: 'Quick local buyer outreach and visual marketing for your property.',
          active: true,
        },
        {
          id: 'pro_social',
          name: 'Pro Viral Multi-Channel Blast',
          price: 2499,
          badge: 'Best Value',
          services: [
            'High-Engagement Instagram Reel + Collaborative Brand Tag',
            'Meta Sponsored Ads (Targeted to High-Net-Worth Buyers & Investors)',
            'Direct WhatsApp Broadcast to 10,000+ Tamil Nadu Buyers',
            'YouTube Shorts & Community Showcase',
            'Full HD Video Editing with Voiceover',
            '1-on-1 Strategy Call & Dedicated Campaign Manager from Admin',
          ],
          description: 'Multi-channel sponsored Meta ads and video campaign for maximum lead generation.',
          active: true,
        },
        {
          id: 'elite_social',
          name: 'Elite HNI & NRI Investor Campaign',
          price: 4999,
          badge: 'Maximum Reach',
          services: [
            'Sponsored Meta Ads running for 14 Days with District Demographic Targeting',
            'Direct NRI & HNI Investor Group Outreach',
            'Cinematic Property Walkthrough Reel & Drone Shots Integration',
            'Cross-Platform Coverage (Instagram, Facebook, YouTube, Telegram)',
            'Daily Performance Analytics & Direct WhatsApp Buyer Leads Forwarding',
            'VIP Priority Phone Consultation & Custom Campaign Management by Admin',
          ],
          description: 'Premium omni-channel promotion for luxury homes, commercial sites, and prime layouts.',
          active: true,
        },
      ],
    },
    // Legacy fields for backward compatibility
    topListPrice: {
      type: Number,
      default: 299,
    },
    topListActiveDays: {
      type: Number,
      default: 7,
    },
    socialMediaPrice: {
      type: Number,
      default: 999,
    },
    socialMediaDescription: {
      type: String,
      default: 'Admin marketing team will personally call and guide you to launch tailored social media ads and reel promotions for your property.',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('PromotionSetting', PromotionSettingSchema);
