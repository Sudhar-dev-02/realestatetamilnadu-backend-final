const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MEDIATOR: 'MEDIATOR',
  SELLER: 'SELLER',
};

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name/username'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email address'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: [ROLES.SUPER_ADMIN, ROLES.MEDIATOR, ROLES.SELLER],
        message: '{VALUE} is not a valid role. Allowed roles: SUPER_ADMIN, MEDIATOR, SELLER',
      },
      required: [true, 'Please specify a user role'],
      default: ROLES.SELLER,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Verification for Mediators
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified',
    },
    verificationDate: {
      type: Date,
      default: null,
    },
    verificationNotes: {
      type: String,
      default: '',
    },
    // For MEDIATOR role: Unique referral code used by sellers to register under this mediator
    referralCode: {
      type: String,
      uppercase: true,
      trim: true,
      unique: true,
      sparse: true, // Only enforces uniqueness for documents where field exists
      index: true,
    },
    // For SELLER role: Reference to the Mediator who referred this seller.
    // If null, the seller is unassigned and directly managed by SUPER_ADMIN
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    profile: {
      agencyName: { type: String, trim: true, default: '' },
      licenseNumber: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: 'Tamil Nadu' },
      state: { type: String, trim: true, default: 'Tamil Nadu' },
      bio: { type: String, trim: true, default: '' },
      avatar: { type: String, default: '/images/avatar/default-user.jpg' },
      upiId: { type: String, trim: true, default: '' },
      propertyTypes: { type: [String], default: [] },
      whatsappReach: { type: String, trim: true, default: '' },
      socialReach: { type: String, trim: true, default: '' },
      socialChatSupport: { type: String, trim: true, default: '' },
      promotionalPosters: { type: [String], default: [] },
      promotionalVideo: { type: String, trim: true, default: '' },
      // New Profile Fields for Target Profile Design
      dob: { type: String, default: '' },
      gender: { type: String, default: '' },
      languages: { type: [String], default: [] },
      experienceYears: { type: String, default: '' },
      professionType: { type: String, default: '' },
      reraNumber: { type: String, trim: true, default: '' },
      propertySpecializations: { type: [String], default: [] },
      primaryDistrict: { type: String, trim: true, default: '' },
      serviceTaluks: { type: [String], default: [] },
      socialLinks: {
        facebook: { type: String, trim: true, default: '' },
        instagram: { type: String, trim: true, default: '' },
        youtube: { type: String, trim: true, default: '' },
        linkedin: { type: String, trim: true, default: '' },
        twitter: { type: String, trim: true, default: '' },
        website: { type: String, trim: true, default: '' },
      },
    },
    // Seller Subscription Plan: 'free' (default) | 'premium' (₹99/month direct buyer enquiries & unlocked contacts)
    sellerPlan: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free',
      index: true,
    },
    subscription: {
      planId: { type: String, default: null },
      planName: { type: String, default: 'No Active Subscription' },
      billingCycle: {
        type: String,
        enum: ['monthly', 'annual'],
        default: 'monthly',
      },
      status: {
        type: String,
        enum: ['inactive', 'pending_verification', 'active', 'expired', 'rejected', 'cancelled'],
        default: 'inactive',
      },
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
      amountPaid: { type: Number, default: 0 },
      transactionId: { type: String, trim: true, default: '' },
      paymentReceipt: { type: String, default: '' },
      submittedAt: { type: Date, default: null },
      notes: { type: String, default: '' },
    },
    queuedSubscription: {
      planId: { type: String, default: null },
      planName: { type: String, default: null },
      billingCycle: {
        type: String,
        enum: ['monthly', 'annual'],
        default: 'monthly',
      },
      status: {
        type: String,
        enum: ['queued', 'inactive'],
        default: 'inactive',
      },
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
      amountPaid: { type: Number, default: 0 },
      transactionId: { type: String, trim: true, default: '' },
      notes: { type: String, default: '' },
    },
    subscriptionHistory: [
      {
        planId: String,
        planName: String,
        billingCycle: String,
        amountPaid: Number,
        startDate: Date,
        endDate: Date,
        transactionId: String,
        paymentStatus: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Encrypt password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password in DB
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT Auth Token
UserSchema.methods.getSignedJwtToken = function () {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured in environment variables.');
  }
  return jwt.sign(
    {
      id: this._id,
      role: this.role,
      email: this.email,
      name: this.name,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '7d',
    }
  );
};

// Custom JSON output to omit sensitive data
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = {
  User: mongoose.model('User', UserSchema),
  ROLES,
};
