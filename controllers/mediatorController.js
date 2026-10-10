const { User, ROLES } = require('../models/User');
const { Property } = require('../models/Property');
const PromotionRequest = require('../models/PromotionRequest');
const PropertyEnquiry = require('../models/PropertyEnquiry');
const { verifyPropertyHierarchyAccess } = require('../services/propertyService');
const { sendSuccess, sendError, sendPaginated } = require('../utils/apiResponse');

/**
 * @desc    Get Current Mediator's Referral Code & Invite Info
 * @route   GET /api/mediator/my-referral-code
 * @access  Private (MEDIATOR)
 */
const getMyReferralCode = async (req, res, next) => {
  try {
    const mediator = await User.findById(req.user._id).select('name email referralCode profile');
    const sellerCount = await User.countDocuments({
      role: ROLES.SELLER,
      referredBy: req.user._id,
    });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const referralLink = `${clientUrl}/register?referral=${mediator.referralCode}`;

    return sendSuccess(res, 'Referral information retrieved successfully', {
      referralCode: mediator.referralCode,
      referralLink,
      totalReferredSellers: sellerCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get List of Sellers Referred by Current Mediator
 * @route   GET /api/mediator/sellers
 * @access  Private (MEDIATOR)
 */
const getMySellers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Strict boundary: Only sellers referredBy current mediator
    const query = {
      role: ROLES.SELLER,
      referredBy: req.user._id,
    };

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }];
    }

    const total = await User.countDocuments(query);
    const sellers = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get listing count for each seller
    const sellerIds = sellers.map((s) => s._id);
    const propertyCounts = await Property.aggregate([
      { $match: { seller: { $in: sellerIds } } },
      { $group: { _id: '$seller', count: { $sum: 1 } } },
    ]);

    const propertyMap = {};
    propertyCounts.forEach((pc) => {
      propertyMap[pc._id.toString()] = pc.count;
    });

    const populatedSellers = sellers.map((s) => {
      const doc = typeof s.toObject === 'function' ? s.toObject() : { ...s };
      doc.propertyListingsCount = propertyMap[s._id.toString()] || 0;
      return doc;
    });

    return sendPaginated(
      res,
      'Referred sellers retrieved successfully',
      populatedSellers,
      total,
      page,
      limit
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Details of a Specific Assigned Seller
 * @route   GET /api/mediator/sellers/:id
 * @access  Private (MEDIATOR)
 */
const getAssignedSellerDetails = async (req, res, next) => {
  try {
    // Enforce strict mediator ownership: must match referredBy = req.user._id
    const seller = await User.findOne({
      _id: req.params.id,
      role: ROLES.SELLER,
      referredBy: req.user._id,
    }).select('-password');

    if (!seller) {
      return sendError(
        res,
        'Seller not found or not assigned to your mediator account.',
        404
      );
    }

    const properties = await Property.find({ seller: seller._id }).sort({ createdAt: -1 }).lean();

    return sendSuccess(res, 'Seller details retrieved successfully', {
      seller,
      properties,
      totalProperties: properties.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Details of an Assigned Seller
 * @route   PUT /api/mediator/sellers/:id
 * @access  Private (MEDIATOR)
 */
const updateAssignedSeller = async (req, res, next) => {
  try {
    const { name, phone, profile } = req.body;

    const seller = await User.findOne({
      _id: req.params.id,
      role: ROLES.SELLER,
      referredBy: req.user._id,
    });

    if (!seller) {
      return sendError(
        res,
        'Seller not found or not assigned to your mediator account.',
        404
      );
    }

    if (name) seller.name = name.trim();
    if (phone !== undefined) seller.phone = phone.trim();
    if (profile) seller.profile = { ...seller.profile, ...profile };

    await seller.save();

    return sendSuccess(res, 'Seller details updated successfully', seller);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get All Property Listings of Assigned Sellers
 * @route   GET /api/mediator/properties
 * @access  Private (MEDIATOR)
 */
const getAssignedSellersProperties = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Strict boundary: properties with mediator = req.user._id
    const query = {
      mediator: req.user._id,
    };

    if (req.query.sellerId) {
      // Verify seller is assigned to this mediator
      const assignedSeller = await User.findOne({
        _id: req.query.sellerId,
        referredBy: req.user._id,
      });
      if (!assignedSeller) {
        return sendError(res, 'Specified seller is not assigned to you.', 403);
      }
      query.seller = req.query.sellerId;
    }

    if (req.query.status) query.status = req.query.status;
    if (req.query.propertyType) query.propertyType = req.query.propertyType;

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [{ title: searchRegex }, { address: searchRegex }, { city: searchRegex }];
    }

    const total = await Property.countDocuments(query);
    const properties = await Property.find(query)
      .populate('seller', 'name email phone role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const PromotionSetting = require('../models/PromotionSetting');
    const promoSettings = await PromotionSetting.findOne() || {};
    const freeValidityDays = promoSettings.sellerListingSettings?.freeListingValidityDays ?? 30;
    const expiryThreshold = new Date();
    expiryThreshold.setDate(expiryThreshold.getDate() - freeValidityDays);

    const propertiesWithExpiry = properties.map((p) => {
      const isPaid = p.listingPayment?.isPaid === true;
      const isExpired = !isPaid && p.createdAt < expiryThreshold;
      
      let daysLeft = null;
      if (!isPaid) {
        const expiryDate = new Date(p.createdAt);
        expiryDate.setDate(expiryDate.getDate() + freeValidityDays);
        const diffTime = expiryDate - new Date();
        daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }

      return { ...p, isExpired, daysLeft };
    });

    return sendPaginated(
      res,
      'Properties of assigned sellers retrieved',
      propertiesWithExpiry,
      total,
      page,
      limit
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a Property Listing on Behalf of an Assigned Seller
 * @route   POST /api/mediator/sellers/:sellerId/properties
 * @access  Private (MEDIATOR)
 */
const createPropertyForSeller = async (req, res, next) => {
  try {
    const { sellerId } = req.params;

    // Plan enforcement: Mediators without active subscription can list only 1 property
    const isSubscribed = req.user.subscription?.status === 'active';
    if (!isSubscribed) {
      const existingPropertiesCount = await Property.countDocuments({ mediator: req.user._id });
      if (existingPropertiesCount >= 1) {
        return sendError(
          res,
          'Free plan limit reached: Mediators without an upgraded subscription plan can list only 1 property. Please upgrade your subscription plan to list more properties.',
          403
        );
      }
    }

    let seller;
    if (sellerId === req.user._id.toString()) {
      seller = req.user;
    } else {
      // Verify the seller is registered under this mediator
      seller = await User.findOne({
        _id: sellerId,
        role: ROLES.SELLER,
        referredBy: req.user._id,
      });
    }

    if (!seller) {
      return sendError(
        res,
        'Cannot create property: Seller not found under your referral code.',
        403
      );
    }

    const propertyData = {
      ...req.body,
      seller: seller._id,
      mediator: req.user._id,
    };

    const property = await Property.create(propertyData);

    return sendSuccess(res, 'Property created successfully on behalf of seller', property, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Property Listing Belonging to an Assigned Seller
 * @route   PUT /api/mediator/properties/:id
 * @access  Private (MEDIATOR)
 */
const updateProperty = async (req, res, next) => {
  try {
    // Enforce hierarchy permission check
    const property = await verifyPropertyHierarchyAccess(req.params.id, req.user);

    Object.assign(property, req.body);
    // Guarantee seller/mediator immutability from request body
    property.mediator = req.user._id;

    await property.save();

    return sendSuccess(res, 'Property listing updated successfully', property);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete Property Listing Belonging to an Assigned Seller
 * @route   DELETE /api/mediator/properties/:id
 * @access  Private (MEDIATOR)
 */
const deleteProperty = async (req, res, next) => {
  try {
    const property = await verifyPropertyHierarchyAccess(req.params.id, req.user);
    await Property.findByIdAndDelete(property._id);

    return sendSuccess(res, 'Property listing deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a Promotion Request
 * @route   POST /api/mediator/promotions
 * @access  Private (MEDIATOR)
 */
const createPromotionRequest = async (req, res, next) => {
  try {
    const {
      promotionCategory = 'TOP_LISTING',
      promotionType,
      propertyId,
      // Top listing fields
      topListingScope = 'district_wise',
      selectedDistrict = '',
      durationPlan = '1_week',
      // Social media fields
      socialMediaPlanId = '',
      socialMediaPlanName = '',
      socialMediaServices = [],
      // Payment details
      amountPaid = 0,
      paymentReceipt = '',
      transactionId = '',
    } = req.body;

    const actualCategory = promotionCategory || (promotionType === 'SOCIAL_MEDIA' ? 'SOCIAL_MEDIA' : 'TOP_LISTING');

    if (!propertyId) {
      return sendError(res, 'Please select a property for this promotion', 400);
    }

    if (actualCategory === 'TOP_LISTING') {
      const propCheck = await Property.findById(propertyId);
      if (propCheck && propCheck.topListing?.isActive) {
        if (!propCheck.topListing.endDate || new Date(propCheck.topListing.endDate) > new Date()) {
          return sendError(res, 'This property already has an active Top Listing promotion. You can promote it again after the current plan finishes.', 400);
        }
      }
    }

    if (!transactionId || !String(transactionId).trim()) {
      return sendError(res, 'Transaction ID / UPI reference is required', 400);
    }

    if (!paymentReceipt) {
      return sendError(res, 'Payment receipt screenshot is required', 400);
    }

    // Determine duration days for Top Listing
    let durationDays = 7;
    if (durationPlan === '1_month' || durationPlan === 'month') {
      durationDays = 30;
    }

    const newRequest = new PromotionRequest({
      mediator: req.user._id,
      promotionCategory: actualCategory,
      promotionType: actualCategory === 'SOCIAL_MEDIA' ? 'SOCIAL_MEDIA' : 'TOP_LIST_LANDING',
      topListingScope: actualCategory === 'TOP_LISTING' ? topListingScope : 'district_wise',
      selectedDistrict: actualCategory === 'TOP_LISTING' && topListingScope === 'district_wise' ? selectedDistrict : '',
      durationPlan: actualCategory === 'TOP_LISTING' ? durationPlan : '1_week',
      durationDays: actualCategory === 'TOP_LISTING' ? durationDays : 0,
      socialMediaPlanId: actualCategory === 'SOCIAL_MEDIA' ? socialMediaPlanId : '',
      socialMediaPlanName: actualCategory === 'SOCIAL_MEDIA' ? socialMediaPlanName : '',
      socialMediaServices: actualCategory === 'SOCIAL_MEDIA' && Array.isArray(socialMediaServices) ? socialMediaServices : [],
      property: propertyId,
      amountPaid: Number(amountPaid) || 0,
      paymentReceipt: paymentReceipt || '',
      transactionId: String(transactionId).trim(),
      status: 'pending',
    });

    await newRequest.save();

    const populated = await PromotionRequest.findById(newRequest._id).populate('property');

    return sendSuccess(res, 'Promotion request submitted successfully! Super Admin will review your payment receipt.', populated, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Current Mediator's Promotion Requests
 * @route   GET /api/mediator/promotions
 * @access  Private (MEDIATOR)
 */
const getMyPromotions = async (req, res, next) => {
  try {
    const requests = await PromotionRequest.find({ mediator: req.user._id })
      .populate('property')
      .sort({ createdAt: -1 });

    return sendSuccess(res, 'Promotion requests retrieved successfully', requests);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Current Mediator's Property Enquiries & Interested Leads
 * @route   GET /api/mediator/enquiries
 * @access  Private (MEDIATOR)
 */
const getMediatorEnquiries = async (req, res, next) => {
  try {
    const enquiries = await PropertyEnquiry.find({ mediator: req.user._id })
      .populate('property')
      .populate('seller', 'name email phone role')
      .sort({ createdAt: -1 });

    return sendSuccess(res, 'Buyer enquiries retrieved successfully', enquiries);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Buyer Enquiry Status by Mediator
 * @route   PUT /api/mediator/enquiries/:id/status
 * @access  Private (MEDIATOR)
 */
const updateMediatorEnquiryStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['NEW', 'CONTACTED', 'CLOSED'].includes(status)) {
      return sendError(res, 'Invalid status parameter', 400);
    }

    const enquiry = await PropertyEnquiry.findOne({ _id: req.params.id, mediator: req.user._id });
    if (!enquiry) {
      return sendError(res, 'Enquiry not found or access denied', 404);
    }

    enquiry.status = status;
    await enquiry.save();

    return sendSuccess(res, `Enquiry status updated to ${status}`, enquiry);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Enable/Subscribe to a Subscription Plan for Mediator
 * @route   POST /api/mediator/subscription/enable
 * @access  Private (MEDIATOR)
 */
const enableSubscriptionPlan = async (req, res, next) => {
  try {
    const {
      planId = 'basic_mediator',
      planName = 'Basic Mediator Plan',
      billingCycle = 'monthly',
      amountPaid = 999,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    const isAnnual = billingCycle === 'annual' || billingCycle === 'yearly';
    const durationDays = isAnnual ? 365 : 30;

    // RENEWAL EXTENSION: If endDate is in the future, extend from existing endDate!
    // If expired or new, start from now!
    let baseDate = new Date();
    if (user.subscription?.endDate && new Date(user.subscription.endDate) > baseDate) {
      baseDate = new Date(user.subscription.endDate);
    }
    const endDate = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const startDate = user.subscription?.startDate || new Date();

    user.subscription = {
      planId,
      planName,
      billingCycle: isAnnual ? 'annual' : 'monthly',
      status: 'active',
      startDate,
      endDate,
      amountPaid: Number(amountPaid) || (isAnnual ? (planId.includes('enterprise') ? 49990 : planId.includes('basic') ? 9990 : 24990) : (planId.includes('enterprise') ? 4999 : planId.includes('basic') ? 999 : 2499)),
    };

    await user.save();

    return sendSuccess(res, `Successfully enabled ${planName} (${isAnnual ? 'Yearly' : 'Monthly'})`, user);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Submit Mediator Payment Details & Receipt for Admin Verification
 * @route   POST /api/mediator/subscription/submit-payment
 * @access  Private (MEDIATOR)
 */
const submitSubscriptionPayment = async (req, res, next) => {
  try {
    const {
      planId,
      planName,
      billingCycle = 'monthly',
      amountPaid,
      transactionId,
      paymentReceipt,
    } = req.body;

    if (!transactionId) {
      return sendError(res, 'Transaction ID / UPI Reference Number is required', 400);
    }

    if (!paymentReceipt) {
      return sendError(res, 'Payment receipt screenshot is required', 400);
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    const isAnnual = billingCycle === 'annual' || billingCycle === 'yearly';

    user.subscription = {
      planId: planId || 'pro_mediator',
      planName: planName || 'Pro Mediator Plan',
      billingCycle: isAnnual ? 'annual' : 'monthly',
      amountPaid: Number(amountPaid) || (isAnnual ? 24990 : 2499),
      transactionId: String(transactionId).trim(),
      paymentReceipt: String(paymentReceipt),
      status: 'pending_verification',
      submittedAt: new Date(),
      startDate: user.subscription?.startDate || null,
      endDate: user.subscription?.endDate || null,
    };

    await user.save();

    return sendSuccess(
      res,
      'Payment details submitted successfully! Super Admin will review your payment receipt and verify your account shortly.',
      user
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyReferralCode,
  getMySellers,
  getAssignedSellerDetails,
  updateAssignedSeller,
  getAssignedSellersProperties,
  createPropertyForSeller,
  updateProperty,
  deleteProperty,
  createPromotionRequest,
  getMyPromotions,
  getMediatorEnquiries,
  updateMediatorEnquiryStatus,
  enableSubscriptionPlan,
  submitSubscriptionPayment,
};
