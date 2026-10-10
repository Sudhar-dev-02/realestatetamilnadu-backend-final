const { User } = require('../models/User');
const { Property } = require('../models/Property');
const PromotionRequest = require('../models/PromotionRequest');
const PromotionSetting = require('../models/PromotionSetting');
const PropertyEnquiry = require('../models/PropertyEnquiry');
const SubscriptionTransaction = require('../models/SubscriptionTransaction');
const { verifyPropertyHierarchyAccess } = require('../services/propertyService');
const { sendSuccess, sendError, sendPaginated } = require('../utils/apiResponse');
const { cashfreeApiRequest } = require('./paymentController');

/**
 * @desc    Get Seller's Own Profile & Hierarchy Management Status
 * @route   GET /api/seller/profile
 * @access  Private (SELLER)
 */
const getSellerProfile = async (req, res, next) => {
  try {
    const seller = await User.findById(req.user._id)
      .select('-password')
      .populate('referredBy', 'name email phone referralCode profile');

    if (!seller) {
      return sendError(res, 'Seller user profile not found', 404);
    }

    const isAssigned = !!(seller.referredBy && seller.referredBy._id);
    const managementInfo = isAssigned
      ? {
        status: 'ASSIGNED_TO_MEDIATOR',
        mediator: {
          id: seller.referredBy._id,
          name: seller.referredBy.name || 'Assigned Mediator',
          email: seller.referredBy.email || '',
          phone: seller.referredBy.phone || '',
          referralCode: seller.referredBy.referralCode || '',
          agencyName: seller.referredBy.profile?.agencyName || '',
        },
      }
      : {
        status: 'MANAGED_BY_SUPER_ADMIN',
        message: 'Directly managed by Super Admin (Registered without referral code)',
      };

    let settings = await PromotionSetting.findOne();
    if (!settings) {
      settings = await PromotionSetting.create({});
    }

    const freeLimit =
      settings.sellerListingSettings?.freeListingLimit !== undefined
        ? settings.sellerListingSettings.freeListingLimit
        : 1;
    const paidFee =
      settings.sellerListingSettings?.paidListingFee !== undefined
        ? settings.sellerListingSettings.paidListingFee
        : 99;

    const propertyCount = await Property.countDocuments({ seller: seller._id });

    return sendSuccess(res, 'Seller profile retrieved', {
      seller,
      managementInfo,
      listingQuota: {
        currentCount: propertyCount,
        freeLimit,
        remainingFree: Math.max(0, freeLimit - propertyCount),
        paidFee,
        isPaymentRequired: propertyCount >= freeLimit,
      },
      planInfo: {
        currentPlan: 'unlocked',
        isPremium: true,
        monthlyPrice: 0,
        subscription: seller.subscription,
        features: {
          directBuyerEnquiries: true,
          unlockedPublicContacts: true,
          unlockedSocialLinks: true,
          prioritySearchPlacement: true,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upgrade Seller Plan to Premium (₹99/Month)
 * @route   POST /api/seller/upgrade-plan
 * @access  Private (SELLER)
 */
const upgradeSellerPlan = async (req, res, next) => {
  try {
    const { transactionId, paymentReceipt, amountPaid = 99, durationMonths = 1, notes = '', autoActivate = false } = req.body;

    const seller = await User.findById(req.user._id);
    if (!seller) {
      return sendError(res, 'Seller not found', 404);
    }

    if (!autoActivate && (!transactionId || !String(transactionId).trim())) {
      return sendError(res, 'Transaction ID / UPI Reference number is required', 400);
    }

    const months = Number(durationMonths) || 1;
    const durationDays = months === 12 ? 365 : (months * 30 || 30);
    const txId = transactionId ? String(transactionId).trim() : `TXN-SEL-${Date.now()}`;
    const status = autoActivate ? 'active' : 'pending_verification';

    seller.subscription = {
      planId: months === 12 ? 'seller_premium_annual' : 'seller_premium_monthly',
      planName: months === 12 ? 'Seller Direct Lead Pass (1 Year)' : 'Seller Direct Lead Pass (1 Month)',
      billingCycle: months === 12 ? 'annual' : 'monthly',
      status,
      startDate: autoActivate ? new Date() : null,
      endDate: autoActivate ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null,
      amountPaid: Number(amountPaid) || (months === 12 ? 999 : 99),
      transactionId: txId,
      paymentReceipt: paymentReceipt || '',
      submittedAt: new Date(),
      notes: notes || `Seller upgraded to ${months === 12 ? 'Annual (365 Days)' : 'Monthly (30 Days)'} Premium Plan`,
    };

    if (autoActivate) {
      seller.sellerPlan = 'premium';
    }

    await seller.save();

    // Create Subscription Transaction Record
    const SubscriptionTransaction = require('../models/SubscriptionTransaction');
    try {
      await SubscriptionTransaction.create({
        user: seller._id,
        userName: seller.name,
        userRole: 'SELLER',
        userEmail: seller.email,
        planName: 'Seller Direct Lead Pass (Premium)',
        billingCycle: 'monthly',
        amountPaid: Number(amountPaid) || 99,
        currency: 'INR',
        transactionStatus: autoActivate ? 'success' : 'pending',
        paymentMethod: 'UPI / QR Code',
        transactionId: txId,
        purchaseDate: new Date(),
      });
    } catch (txErr) {
      console.warn('Transaction record warning:', txErr.message);
    }

    const msg = autoActivate
      ? 'Congratulations! Your Premium Plan (₹99/mo) is now ACTIVE. Direct buyer enquiries and public contact details are unlocked!'
      : 'Subscription request submitted successfully! Super Admin will verify your payment receipt and activate your Premium Plan shortly.';

    return sendSuccess(res, msg, {
      sellerPlan: seller.sellerPlan,
      subscription: seller.subscription,
      isPremium: seller.sellerPlan === 'premium',
    }, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Seller's Own Profile
 * @route   PUT /api/seller/profile
 * @access  Private (SELLER)
 */
const updateSellerProfile = async (req, res, next) => {
  try {
    const { name, phone, profile } = req.body;

    const seller = await User.findById(req.user._id);
    if (!seller) {
      return sendError(res, 'Seller profile not found', 404);
    }

    if (name) seller.name = name.trim();
    if (phone !== undefined) seller.phone = phone.trim();
    if (profile) seller.profile = { ...seller.profile, ...profile };

    await seller.save();

    return sendSuccess(res, 'Profile updated successfully', seller);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Seller's Own Property Listings
 * @route   GET /api/seller/properties
 * @access  Private (SELLER)
 */
const getMyProperties = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const query = { seller: req.user._id };

    if (req.query.status) query.status = req.query.status;
    if (req.query.propertyType) query.propertyType = req.query.propertyType;

    const total = await Property.countDocuments(query);
    const properties = await Property.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const propIds = properties.map((p) => p._id);
    const interestCounts = await PropertyEnquiry.aggregate([
      { $match: { property: { $in: propIds }, type: 'INTEREST' } },
      { $group: { _id: '$property', count: { $sum: 1 } } },
    ]);

    const countMap = {};
    interestCounts.forEach((c) => {
      if (c._id) countMap[c._id.toString()] = c.count;
    });

    const promoSettings = await PromotionSetting.findOne() || {};
    const freeValidityDays = promoSettings.sellerListingSettings?.freeListingValidityDays ?? 30;
    const expiryThreshold = new Date();
    expiryThreshold.setDate(expiryThreshold.getDate() - freeValidityDays);

    const propertiesWithCounts = properties.map((p) => {
      const isPaid = p.listingPayment?.isPaid === true;
      const isExpired = !isPaid && p.createdAt < expiryThreshold;
      
      let daysLeft = null;
      if (!isPaid) {
        const expiryDate = new Date(p.createdAt);
        expiryDate.setDate(expiryDate.getDate() + freeValidityDays);
        const diffTime = expiryDate - new Date();
        daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }

      return {
        ...p,
        isExpired,
        daysLeft,
        interestCount: countMap[p._id.toString()] || 0,
      };
    });

    return sendPaginated(
      res,
      'My property listings retrieved successfully',
      propertiesWithCounts,
      total,
      page,
      limit
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a New Property/Land Listing by Seller
 * @route   POST /api/seller/properties
 * @access  Private (SELLER)
 */
const createProperty = async (req, res, next) => {
  try {
    const seller = await User.findById(req.user._id).select('referredBy');
    let promoSettings = await PromotionSetting.findOne();
    if (!promoSettings) {
      promoSettings = await PromotionSetting.create({});
    }
    const freeListingLimit = promoSettings.sellerListingSettings?.freeListingLimit ?? 1;
    const paidListingFee = promoSettings.sellerListingSettings?.paidListingFee ?? 99;

    const existingCount = await Property.countDocuments({ seller: req.user._id });
    const isPaymentRequired = existingCount >= freeListingLimit;

    let listingPayment = {
      isPaid: false,
      amountPaid: 0,
      transactionId: null,
      paymentDate: null,
    };
    let txnId = null;
    let paymentMethod = 'UPI / Manual QR';
    let paymentProof = null;

    if (isPaymentRequired) {
      const { paymentDetails } = req.body;
      if (!paymentDetails || (!paymentDetails.transactionId && !paymentDetails.orderId)) {
        return sendError(
          res,
          `You have reached your free listing limit (${freeListingLimit} ${freeListingLimit === 1 ? 'property' : 'properties'}). Additional property listings require a one-time fee of ₹${paidListingFee}.`,
          402,
          {
            paymentRequired: true,
            fee: paidListingFee,
            qrCodeImage: promoSettings.qrCodeImage,
            upiId: promoSettings.upiId,
          }
        );
      }

      txnId = (paymentDetails.transactionId || paymentDetails.orderId || '').trim();
      paymentProof = paymentDetails.receipt || null;

      // If online Cashfree payment gateway was used, verify directly with Cashfree server
      if (paymentDetails.gateway === 'cashfree' || paymentDetails.orderId) {
        const orderId = (paymentDetails.orderId || paymentDetails.transactionId).trim();
        try {
          const orderDetails = await cashfreeApiRequest(`/pg/orders/${orderId}`, 'GET');
          if (orderDetails.order_status !== 'PAID') {
            return sendError(res, `Payment is not completed. Status: ${orderDetails.order_status}`, 400);
          }
          txnId = orderId;
          try {
            const paymentsList = await cashfreeApiRequest(`/pg/orders/${orderId}/payments`, 'GET');
            if (Array.isArray(paymentsList) && paymentsList.length > 0) {
              const successPayment = paymentsList.find((p) => p.payment_status === 'SUCCESS') || paymentsList[0];
              if (successPayment && (successPayment.cf_payment_id || successPayment.payment_id)) {
                txnId = String(successPayment.cf_payment_id || successPayment.payment_id);
              }
            }
          } catch (err) {
            console.warn('Could not fetch Cashfree payment ID, using orderId:', err.message);
          }
          paymentMethod = 'Cashfree Online Gateway';
          paymentProof = 'CASHFREE_ONLINE_PAYMENT';
        } catch (cfErr) {
          console.error('Cashfree order verification failed:', cfErr.message);
          return sendError(res, `Payment gateway verification failed: ${cfErr.message}`, 400);
        }
      }

      listingPayment = {
        isPaid: true,
        amountPaid: paidListingFee,
        transactionId: txnId,
        paymentDate: new Date(),
      };
    }

      const propertyData = {
        ...req.body,
        seller: req.user._id,
        mediator: seller?.referredBy || null, // Auto-links to mediator if seller was referred
        listingPayment,
      };

      const property = await Property.create(propertyData);

      if (isPaymentRequired && txnId) {
        try {
          await SubscriptionTransaction.create({
            user: req.user._id,
            userName: req.user.name || 'Property Seller',
            userRole: 'SELLER',
            userEmail: req.user.email || '',
            planName: `Pay-Per-Listing Fee (₹${paidListingFee})`,
            billingCycle: 'pay_per_listing',
            amountPaid: paidListingFee,
            currency: 'INR',
            transactionStatus: 'success',
            paymentMethod: paymentMethod || 'Cashfree Online / UPI',
            transactionId: txnId,
            property: property._id,
            propertyTitle: property.title || property.plotName || 'Property Listing',
            propertyCity: property.city || property.district || 'Tamil Nadu',
            propertyType: property.propertyType || 'Property',
            purchaseDate: new Date(),
          });
        } catch (txErr) {
          console.warn('Listing fee transaction record warning:', txErr.message);
        }
      }

      return sendSuccess(
        res,
        isPaymentRequired
          ? `Property listed successfully with payment verification (₹${paidListingFee})!`
          : 'Free property listing created successfully!',
        property,
        201
      );
    } catch (error) {
      next(error);
    }
  };

  /**
   * @desc    Update Seller's Own Property Listing
   * @route   PUT /api/seller/properties/:id
   * @access  Private (SELLER)
   */
  const updateMyProperty = async (req, res, next) => {
    try {
      const property = await verifyPropertyHierarchyAccess(req.params.id, req.user);

      // Prevent changing seller or mediator references
      delete req.body.seller;
      delete req.body.mediator;

      Object.assign(property, req.body);
      await property.save();

      return sendSuccess(res, 'Property listing updated successfully', property);
    } catch (error) {
      next(error);
    }
  };

  /**
   * @desc    Delete Seller's Own Property Listing
   * @route   DELETE /api/seller/properties/:id
   * @access  Private (SELLER)
   */
  const deleteMyProperty = async (req, res, next) => {
    try {
      const property = await verifyPropertyHierarchyAccess(req.params.id, req.user);
      await Property.findByIdAndDelete(property._id);

      return sendSuccess(res, 'Property listing deleted successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * @desc    Create a Promotion Request by Seller (Top Listing Only)
   * @route   POST /api/seller/promotions
   * @access  Private (SELLER)
   */
  const createPromotionRequest = async (req, res, next) => {
    try {
      const {
        propertyId,
        topListingScope = 'district_wise',
        selectedDistrict = '',
        durationPlan = '1_week',
        amountPaid = 0,
        paymentReceipt = '',
        transactionId = '',
      } = req.body;

      if (!propertyId) {
        return sendError(res, 'Please select a property for top listing', 400);
      }

      const property = await Property.findOne({ _id: propertyId, seller: req.user._id });
      if (!property) {
        return sendError(res, 'Property not found or does not belong to you', 403);
      }

      if (property.topListing?.isActive) {
        if (!property.topListing.endDate || new Date(property.topListing.endDate) > new Date()) {
          return sendError(res, 'This property already has an active Top Listing plan. You can promote it again after the current plan finishes.', 400);
        }
      }

      if (!transactionId || !String(transactionId).trim()) {
        return sendError(res, 'Transaction ID / UPI reference is required', 400);
      }

      if (!paymentReceipt) {
        return sendError(res, 'Payment receipt screenshot is required', 400);
      }

      let durationDays = 7;
      if (durationPlan === '1_month' || durationPlan === 'month') {
        durationDays = 30;
      }

      const newRequest = new PromotionRequest({
        mediator: req.user._id, // User applicant
        promotionCategory: 'TOP_LISTING',
        promotionType: 'TOP_LIST_LANDING',
        topListingScope: topListingScope === 'overall' ? 'overall' : 'district_wise',
        selectedDistrict: topListingScope === 'overall' ? '' : (selectedDistrict || property.city || ''),
        durationPlan: durationPlan === '1_month' ? '1_month' : '1_week',
        durationDays,
        property: propertyId,
        amountPaid: Number(amountPaid) || 0,
        paymentReceipt: paymentReceipt || '',
        transactionId: String(transactionId).trim(),
        status: 'pending',
      });

      await newRequest.save();

      const populated = await PromotionRequest.findById(newRequest._id).populate('property');

      return sendSuccess(res, 'Top listing promotion request submitted successfully! Super Admin will review your payment receipt.', populated, 201);
    } catch (error) {
      next(error);
    }
  };

  /**
   * @desc    Get Current Seller's Promotion Requests
   * @route   GET /api/seller/promotions
   * @access  Private (SELLER)
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
   * @desc    Get Current Seller's Property Enquiries & Interested Leads
   * @route   GET /api/seller/enquiries
   * @access  Private (SELLER)
   */
  const getSellerEnquiries = async (req, res, next) => {
    try {
      const enquiries = await PropertyEnquiry.find({ seller: req.user._id })
        .populate('property')
        .populate('mediator', 'name email phone')
        .sort({ createdAt: -1 });

      return sendSuccess(res, 'Buyer enquiries retrieved successfully', enquiries);
    } catch (error) {
      next(error);
    }
  };

  /**
   * @desc    Update Buyer Enquiry Status by Seller
   * @route   PUT /api/seller/enquiries/:id/status
   * @access  Private (SELLER)
   */
  const updateSellerEnquiryStatus = async (req, res, next) => {
    try {
      const { status } = req.body;
      if (!['NEW', 'CONTACTED', 'CLOSED'].includes(status)) {
        return sendError(res, 'Invalid status parameter', 400);
      }

      const enquiry = await PropertyEnquiry.findOne({ _id: req.params.id, seller: req.user._id });
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

  const renewProperty = async (req, res, next) => {
    try {
      const { paymentDetails } = req.body;
      const property = await Property.findOne({ _id: req.params.id, seller: req.user._id });
      if (!property) return sendError(res, 'Property not found', 404);

      const promoSettings = await PromotionSetting.findOne() || {};
      const paidListingFee = promoSettings.sellerListingSettings?.paidListingFee ?? 99;

      if (!paymentDetails || (!paymentDetails.transactionId && !paymentDetails.orderId)) {
        return sendError(res, 'Payment details are required to renew property.', 400);
      }

      let txnId = (paymentDetails.transactionId || paymentDetails.orderId || '').trim();
      let paymentMethod = 'UPI / Manual QR';

      if (paymentDetails.gateway === 'cashfree' || paymentDetails.orderId) {
        const orderId = (paymentDetails.orderId || paymentDetails.transactionId).trim();
        try {
          const orderDetails = await cashfreeApiRequest(`/pg/orders/${orderId}`, 'GET');
          if (orderDetails.order_status !== 'PAID') {
            return sendError(res, `Payment is not completed. Status: ${orderDetails.order_status}`, 400);
          }
          txnId = orderId;
          paymentMethod = 'Cashfree Online Gateway';
        } catch (cfErr) {
          return sendError(res, `Payment gateway verification failed: ${cfErr.message}`, 400);
        }
      }

      property.listingPayment = {
        isPaid: true,
        amountPaid: paidListingFee,
        transactionId: txnId,
        paymentDate: new Date(),
      };

      await property.save();

      await SubscriptionTransaction.create({
        seller: req.user._id,
        planName: `Property Renewal Fee (₹${paidListingFee})`,
        billingCycle: 'pay_per_listing',
        amountPaid: paidListingFee,
        currency: 'INR',
        paymentMethod: paymentMethod,
        transactionId: txnId,
        property: property._id,
      });

      return sendSuccess(res, 'Property renewed and unlocked successfully!', property);
    } catch (error) {
      next(error);
    }
  };

  module.exports = {
    getSellerProfile,
    updateSellerProfile,
    upgradeSellerPlan,
    getMyProperties,
    createProperty,
    renewProperty,
    updateMyProperty,
    deleteMyProperty,
    createPromotionRequest,
    getMyPromotions,
    getSellerEnquiries,
    updateSellerEnquiryStatus,
  };
