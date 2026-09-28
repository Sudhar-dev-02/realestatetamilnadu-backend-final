const mongoose = require('mongoose');

const PROPERTY_TYPES = [
  'House',
  'Apartment',
  'Villa',
  'Townhouse',
  'Land',
  'Plot',
  'Commercial',
  'Office',
  'Studio',
  'Other',
];

const PROPERTY_STATUS = ['available', 'under_offer', 'sold', 'rented', 'inactive'];
const PROPERTY_PURPOSE = ['forSale', 'forRent'];
const LAND_UNITS = ['sqft', 'cent', 'acre', 'ground'];

const PropertySchema = new mongoose.Schema(
  {
    propertyId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Please provide a property title'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    propertyType: {
      type: String,
      required: [true, 'Please specify property type'],
      enum: {
        values: PROPERTY_TYPES,
        message: '{VALUE} is not a valid property type',
      },
      default: 'House',
      index: true,
    },
    purpose: {
      type: String,
      enum: PROPERTY_PURPOSE,
      default: 'forSale',
      index: true,
    },
    price: {
      type: Number,
      required: [true, 'Please provide property price'],
      min: [0, 'Price cannot be negative'],
      index: true,
    },
    priceFormatted: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Please provide property address/location'],
      trim: true,
    },
    city: {
      type: String,
      trim: true,
      default: 'Tamil Nadu',
      index: true,
    },
    state: {
      type: String,
      trim: true,
      default: 'Tamil Nadu',
    },
    pincode: {
      type: String,
      trim: true,
      default: '',
    },
    beds: {
      type: Number,
      default: 0,
      min: 0,
    },
    baths: {
      type: Number,
      default: 0,
      min: 0,
    },
    sqft: {
      type: Number,
      default: 0,
      min: 0,
    },
    landArea: {
      type: Number,
      default: 0,
      min: 0,
    },
    landUnit: {
      type: String,
      enum: LAND_UNITS,
      default: 'sqft',
    },
    amenities: {
      type: [String],
      default: [],
    },
    images: {
      type: [String],
      required: [true, 'Please upload at least one property photo.'],
      validate: [
        function (val) {
          return val && val.length > 0 && val[0] && val[0].trim() !== '';
        },
        'Please upload at least one property photo.',
      ],
    },
    status: {
      type: String,
      enum: PROPERTY_STATUS,
      default: 'available',
      index: true,
    },
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    listingPayment: {
      isPaid: { type: Boolean, default: false },
      amountPaid: { type: Number, default: 0 },
      transactionId: { type: String, default: '' },
      paymentDate: { type: Date },
    },
    // Top Listing Promotion Details
    topListing: {
      isActive: {
        type: Boolean,
        default: false,
        index: true,
      },
      scope: {
        type: String,
        enum: ['district_wise', 'overall', ''],
        default: '',
      },
      district: {
        type: String,
        trim: true,
        default: '',
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
    },
    // The Seller who owns / listed this property
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Property must be associated with a Seller'],
      index: true,
    },
    // The Mediator who referred the Seller (if any)
    // Facilitates fast indexed lookup for Mediators managing their Sellers' properties
    mediator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    // Optional Video URL or Base64 uploaded video file
    videoUrl: {
      type: String,
      default: '',
    },
    // Optional Floor Plan Image URL or Base64 uploaded image file
    floorPlanUrl: {
      type: String,
      default: '',
    },
    // Conditional Visibility Settings
    showMap: {
      type: Boolean,
      default: true,
    },
    showCalculator: {
      type: Boolean,
      default: true,
    },
    // Property-specific reviews
    reviews: {
      type: [
        {
          name: { type: String, required: true },
          rating: { type: Number, required: true, min: 1, max: 5 },
          comment: { type: String, required: true },
          avatar: { type: String, default: '/images/avatar/avt-png1.png' },
          date: { type: Date, default: Date.now }
        }
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Format price string if not explicitly set
PropertySchema.pre('save', async function (next) {
  if (this.price !== undefined && (!this.priceFormatted || this.isModified('price'))) {
    if (this.purpose === 'forRent') {
      this.priceFormatted = `₹${this.price.toLocaleString('en-IN')}/month`;
    } else {
      this.priceFormatted = `₹${this.price.toLocaleString('en-IN')}`;
    }
  }

  // Automatically populate mediator reference from seller if not populated
  if (this.isNew || this.isModified('seller')) {
    if (!this.mediator && this.seller) {
      try {
        const User = mongoose.model('User');
        const sellerDoc = await User.findById(this.seller).select('referredBy');
        if (sellerDoc && sellerDoc.referredBy) {
          this.mediator = sellerDoc.referredBy;
        }
      } catch (err) {
        // Continue if lookup fails, mediator remains null
      }
    }
  }

  // Auto-generate unique human-readable propertyId if not set (e.g. RETN-PROP-104928)
  if (!this.propertyId) {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    this.propertyId = `RETN-PROP-${randomNum}`;
  }

  next();
});

// Database Indexes for High-Performance Filtering, Sorting, and Search
PropertySchema.index({ status: 1, purpose: 1, propertyType: 1, price: 1 });
PropertySchema.index({ 'topListing.isActive': -1, 'topListing.scope': -1, createdAt: -1 });
PropertySchema.index({ city: 1, status: 1 });
PropertySchema.index({ seller: 1, createdAt: -1 });
PropertySchema.index({ mediator: 1, createdAt: -1 });

module.exports = {
  Property: mongoose.model('Property', PropertySchema),
  PROPERTY_TYPES,
  PROPERTY_STATUS,
  PROPERTY_PURPOSE,
  LAND_UNITS,
};
