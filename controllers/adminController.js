const { User, ROLES } = require('../models/User');
const { Property } = require('../models/Property');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const SubscriptionTransaction = require('../models/SubscriptionTransaction');
const Review = require('../models/Review');
const ContactEntry = require('../models/ContactEntry');
const Client = require('../models/Client');
const Blog = require('../models/Blog');
const FAQ = require('../models/FAQ');
const PromotionRequest = require('../models/PromotionRequest');
const PromotionSetting = require('../models/PromotionSetting');
const PropertyEnquiry = require('../models/PropertyEnquiry');
const { sendSuccess, sendError, sendPaginated } = require('../utils/apiResponse');

// ============================================================================
// 1. DASHBOARD OVERVIEW
// ============================================================================

/**
 * @desc    Get Platform Statistics for Super Admin Dashboard
 * @route   GET /api/admin/stats
 * @access  Private (SUPER_ADMIN)
 */
const getAdminStats = async (req, res, next) => {
  try {
    const [
      totalMediators,
      totalSellers,
      totalProperties,
      totalSubscriptionTransactions,
      totalVerifiedMediators,
      unassignedSellers,
      availableProperties,
      soldProperties,
      totalRevenueResult,
      unreadContactsCount,
    ] = await Promise.all([
      User.countDocuments({ role: ROLES.MEDIATOR }),
      User.countDocuments({ role: ROLES.SELLER }),
      Property.countDocuments(),
      SubscriptionTransaction.countDocuments(),
      User.countDocuments({ role: ROLES.MEDIATOR, isVerified: true }),
      User.countDocuments({
        role: ROLES.SELLER,
        $or: [{ referredBy: null }, { referredBy: { $exists: false } }],
      }),
      Property.countDocuments({ status: 'available' }),
      Property.countDocuments({ status: 'sold' }),
      SubscriptionTransaction.aggregate([
        { $match: { transactionStatus: 'success' } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ]),
      ContactEntry.countDocuments({ status: 'unread' }),
    ]);

    const totalRevenue = totalRevenueResult[0]?.total || 0;
    const assignedSellers = totalSellers - unassignedSellers;

    return sendSuccess(res, 'Admin stats retrieved successfully', {
      totalMediators,
      totalSellers,
      totalProperties,
      totalPropertyListings: totalProperties,
      totalSubscriptionTransactions,
      totalVerifiedMediators,
      assignedSellers,
      unassignedSellers,
      availableProperties,
      soldProperties,
      totalRevenue,
      unreadContactsCount,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// 2. MEDIATORS MANAGEMENT
// ============================================================================

/**
 * @desc    Get All Mediators with Verification Status & Referral Counts
 * @route   GET /api/admin/mediators
 * @access  Private (SUPER_ADMIN)
 */
const getAllMediators = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const query = { role: ROLES.MEDIATOR };
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { referralCode: searchRegex },
        { phone: searchRegex },
      ];
    }
    if (req.query.isVerified !== undefined) {
      query.isVerified = req.query.isVerified === 'true';
    }
    if (req.query.verificationStatus) {
      query.verificationStatus = req.query.verificationStatus;
    }

    const total = await User.countDocuments(query);
    const mediators = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const mediatorIds = mediators.map((m) => m._id);
    const [sellerCounts, propertyCounts] = await Promise.all([
      User.aggregate([
        { $match: { role: ROLES.SELLER, referredBy: { $in: mediatorIds } } },
        { $group: { _id: '$referredBy', count: { $sum: 1 } } },
      ]),
      Property.aggregate([
        { $match: { mediator: { $in: mediatorIds } } },
        { $group: { _id: '$mediator', count: { $sum: 1 } } },
      ]),
    ]);

    const sellerMap = {};
    sellerCounts.forEach((sc) => {
      sellerMap[sc._id.toString()] = sc.count;
    });

    const propertyMap = {};
    propertyCounts.forEach((pc) => {
      propertyMap[pc._id.toString()] = pc.count;
    });

    const populatedMediators = mediators.map((m) => {
      const doc = m.toObject();
      doc.referredSellersCount = sellerMap[m._id.toString()] || 0;
      doc.propertyListingsCount = propertyMap[m._id.toString()] || 0;
      return doc;
    });

    return sendPaginated(
      res,
      'Mediators retrieved successfully',
      populatedMediators,
      total,
      page,
      limit
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Specific Mediator by ID with Full 3-Section Details (Profile, Properties, Sellers)
 * @route   GET /api/admin/mediators/:id
 * @access  Private (SUPER_ADMIN)
 */
const getMediatorById = async (req, res, next) => {
  try {
    const mediator = await User.findOne({
      _id: req.params.id,
      role: ROLES.MEDIATOR,
    }).select('-password');

    if (!mediator) {
      return sendError(res, 'Mediator not found', 404);
    }

    const [sellers, properties] = await Promise.all([
      User.find({ role: ROLES.SELLER, referredBy: mediator._id })
        .select('-password')
        .sort({ createdAt: -1 }),
      Property.find({ mediator: mediator._id })
        .populate('seller', 'name email phone')
        .sort({ createdAt: -1 }),
    ]);

    return sendSuccess(res, 'Mediator details retrieved', {
      mediator,
      properties,
      referredSellers: sellers,
      stats: {
        totalSellers: sellers.length,
        totalProperties: properties.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Mediator Details / Active Status
 * @route   PUT /api/admin/mediators/:id
 * @access  Private (SUPER_ADMIN)
 */
const updateMediator = async (req, res, next) => {
  try {
    const { name, phone, isActive, profile } = req.body;

    const mediator = await User.findOne({
      _id: req.params.id,
      role: ROLES.MEDIATOR,
    });

    if (!mediator) {
      return sendError(res, 'Mediator not found', 404);
    }

    if (name) mediator.name = name.trim();
    if (phone !== undefined) mediator.phone = phone.trim();
    if (isActive !== undefined) mediator.isActive = Boolean(isActive);
    if (profile) mediator.profile = { ...mediator.profile, ...profile };

    await mediator.save();

    return sendSuccess(res, 'Mediator updated successfully', mediator);
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// 3. SELLERS MANAGEMENT
// ============================================================================

/**
 * @desc    Get All Sellers (with Referred Mediator info or Super Admin managed note)
 * @route   GET /api/admin/sellers
 * @access  Private (SUPER_ADMIN)
 */
const getAllSellers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const query = { role: ROLES.SELLER };

    if (req.query.assignment === 'unassigned') {
      query.$or = [{ referredBy: null }, { referredBy: { $exists: false } }];
    } else if (req.query.assignment === 'assigned') {
      query.referredBy = { $ne: null, $exists: true };
    }

    if (req.query.mediatorId) {
      query.referredBy = req.query.mediatorId;
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }];
    }

    const total = await User.countDocuments(query);
    const sellers = await User.find(query)
      .select('-password')
      .populate('referredBy', 'name email phone referralCode profile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

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
      const doc = s.toObject();
      doc.propertyCount = propertyMap[s._id.toString()] || 0;
      doc.isUnassigned = !s.referredBy;
      doc.managementLabel = s.referredBy
        ? `Referred Mediator: ${s.referredBy.name} (${s.referredBy.referralCode || 'N/A'})`
        : 'Directly managed by Super Admin';
      return doc;
    });

    return sendPaginated(
      res,
      'Sellers retrieved successfully',
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
 * @desc    Get Specific Seller by ID with Full Details & Properties
 * @route   GET /api/admin/sellers/:id
 * @access  Private (SUPER_ADMIN)
 */
const getSellerById = async (req, res, next) => {
  try {
    const seller = await User.findOne({
      _id: req.params.id,
      role: ROLES.SELLER,
    })
      .select('-password')
      .populate('referredBy', 'name email phone referralCode profile isVerified');

    if (!seller) {
      return sendError(res, 'Seller not found', 404);
    }

    const properties = await Property.find({ seller: seller._id }).sort({ createdAt: -1 });

    const sellerData = seller.toObject();
    sellerData.isDirectlyManagedBySuperAdmin = !seller.referredBy;
    sellerData.managementStatus = seller.referredBy
      ? `Referred by Mediator: ${seller.referredBy.name}`
      : 'Directly managed by Super Admin';

    return sendSuccess(res, 'Seller details retrieved', {
      seller: sellerData,
      properties,
      totalProperties: properties.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get All Unassigned Sellers
 * @route   GET /api/admin/sellers/unassigned
 * @access  Private (SUPER_ADMIN)
 */
const getUnassignedSellers = async (req, res, next) => {
  try {
    const unassigned = await User.find({
      role: ROLES.SELLER,
      $or: [{ referredBy: null }, { referredBy: { $exists: false } }],
    })
      .select('-password')
      .sort({ createdAt: -1 });

    return sendSuccess(res, 'Unassigned sellers retrieved successfully', {
      count: unassigned.length,
      sellers: unassigned,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Assign or Reassign a Seller to a Mediator (or Unassign to Super Admin)
 * @route   PUT /api/admin/sellers/:id/assign
 * @access  Private (SUPER_ADMIN)
 */
const assignSeller = async (req, res, next) => {
  try {
    const { mediatorId } = req.body;

    const seller = await User.findOne({
      _id: req.params.id,
      role: ROLES.SELLER,
    });

    if (!seller) {
      return sendError(res, 'Seller not found', 404);
    }

    if (mediatorId) {
      const mediator = await User.findOne({
        _id: mediatorId,
        role: ROLES.MEDIATOR,
      });

      if (!mediator) {
        return sendError(res, 'Target Mediator not found', 404);
      }

      seller.referredBy = mediator._id;
      await seller.save();

      await Property.updateMany(
        { seller: seller._id },
        { $set: { mediator: mediator._id } }
      );

      return sendSuccess(res, `Seller assigned to Mediator ${mediator.name} successfully`, {
        seller,
        mediator: {
          id: mediator._id,
          name: mediator.name,
          referralCode: mediator.referralCode,
        },
      });
    } else {
      seller.referredBy = null;
      await seller.save();

      await Property.updateMany(
        { seller: seller._id },
        { $set: { mediator: null } }
      );

      return sendSuccess(
        res,
        'Seller unassigned from Mediator. Now directly managed by Super Admin.',
        { seller }
      );
    }
  } catch (error) {
    next(error);
  }
};

const updateSeller = async (req, res, next) => {
  try {
    const { name, phone, isActive, profile, sellerPlan } = req.body;

    const seller = await User.findOne({
      _id: req.params.id,
      role: ROLES.SELLER,
    });

    if (!seller) {
      return sendError(res, 'Seller not found', 404);
    }

    if (name) seller.name = name.trim();
    if (phone !== undefined) seller.phone = phone.trim();
    if (isActive !== undefined) seller.isActive = Boolean(isActive);
    if (profile) seller.profile = { ...seller.profile, ...profile };

    if (sellerPlan && ['free', 'premium'].includes(sellerPlan)) {
      seller.sellerPlan = sellerPlan;
      if (sellerPlan === 'premium') {
        seller.subscription = {
          planId: 'seller_premium_99',
          planName: 'Seller Direct Lead Pass (Premium)',
          billingCycle: 'monthly',
          status: 'active',
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          amountPaid: 99,
          transactionId: seller.subscription?.transactionId || `ADMIN-GRANT-${Date.now()}`,
          notes: 'Activated by Super Admin',
        };
      } else {
        if (seller.subscription) {
          seller.subscription.status = 'inactive';
        }
      }
    }

    await seller.save();

    return sendSuccess(res, 'Seller updated successfully', seller);
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// 4. SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * @desc    Get All Subscription Plans
 * @route   GET /api/admin/subscriptions/plans
 * @access  Private (SUPER_ADMIN)
 */
const getSubscriptionPlans = async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ order: 1 });
    return sendSuccess(res, 'Subscription plans retrieved', plans);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Subscription Plan (Price, Name, Features)
 * @route   PUT /api/admin/subscriptions/plans/:id
 * @access  Private (SUPER_ADMIN)
 */
const updateSubscriptionPlan = async (req, res, next) => {
  try {
    const { name, desc, monthlyPrice, annualPrice, popular, features, isActive } = req.body;

    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) {
      return sendError(res, 'Subscription plan not found', 404);
    }

    if (name !== undefined) plan.name = name.trim();
    if (desc !== undefined) plan.desc = desc.trim();
    if (monthlyPrice !== undefined) plan.monthlyPrice = Number(monthlyPrice);
    if (annualPrice !== undefined) plan.annualPrice = Number(annualPrice);
    if (popular !== undefined) plan.popular = Boolean(popular);
    if (features !== undefined) plan.features = features;
    if (isActive !== undefined) plan.isActive = Boolean(isActive);

    await plan.save();

    return sendSuccess(res, 'Subscription plan updated successfully. Updated prices will reflect on frontend pricing page.', plan);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get All Subscription Transactions
 * @route   GET /api/admin/subscriptions/transactions
 * @access  Private (SUPER_ADMIN)
 */
const getSubscriptionTransactions = async (req, res, next) => {
  try {
    // Auto-sync any paid property listings into transactions if not yet recorded
    try {
      const Property = require('../models/Property');
      const paidProperties = await Property.find({ 'listingPayment.isPaid': true })
        .populate('seller', 'name email role')
        .lean();

      for (const prop of paidProperties) {
        const txnId = prop.listingPayment?.transactionId || `LST-${prop._id}`;
        if (txnId) {
          const existing = await SubscriptionTransaction.findOne({ transactionId: txnId });
          if (!existing) {
            await SubscriptionTransaction.create({
              user: prop.seller?._id || prop.seller,
              userName: prop.seller?.name || prop.ownerName || 'Property Seller',
              userRole: 'SELLER',
              userEmail: prop.seller?.email || '',
              planName: `Pay-Per-Listing Fee (₹${prop.listingPayment?.amountPaid || 99})`,
              billingCycle: 'pay_per_listing',
              amountPaid: prop.listingPayment?.amountPaid || 99,
              currency: 'INR',
              transactionStatus: 'success',
              paymentMethod: 'Cashfree Online / UPI',
              transactionId: txnId,
              property: prop._id,
              propertyTitle: prop.title || prop.plotName || 'Property Listing',
              propertyCity: prop.city || prop.district || 'Tamil Nadu',
              propertyType: prop.propertyType || 'Property',
              purchaseDate: prop.listingPayment?.paymentDate || prop.createdAt || new Date(),
            });
          } else if (!existing.propertyTitle && prop.title) {
            existing.property = prop._id;
            existing.propertyTitle = prop.title || prop.plotName;
            existing.propertyCity = prop.city || prop.district;
            existing.propertyType = prop.propertyType;
            await existing.save();
          }
        }
      }
    } catch (syncErr) {
      console.warn('Paid properties transaction sync notice:', syncErr.message);
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) query.transactionStatus = req.query.status;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { userName: searchRegex },
        { userEmail: searchRegex },
        { planName: searchRegex },
        { propertyTitle: searchRegex },
        { transactionId: searchRegex },
      ];
    }

    const total = await SubscriptionTransaction.countDocuments(query);
    const transactions = await SubscriptionTransaction.find(query)
      .populate('user', 'name email role subscription queuedSubscription')
      .populate('property', 'title price city district propertyType images')
      .sort({ purchaseDate: -1 })
      .skip(skip)
      .limit(limit);

    return sendPaginated(
      res,
      'Subscription transactions retrieved',
      transactions,
      total,
      page,
      limit
    );
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// 5. VERIFICATION MANAGEMENT (Specifically for Mediators)
// ============================================================================

/**
 * @desc    Get Mediators Verification Requests & Statuses
 * @route   GET /api/admin/verifications
 * @access  Private (SUPER_ADMIN)
 */
const getMediatorVerifications = async (req, res, next) => {
  try {
    const query = { role: ROLES.MEDIATOR };
    if (req.query.status) {
      if (req.query.status === 'verified') {
        query.isVerified = true;
      } else if (req.query.status === 'pending') {
        query.verificationStatus = 'pending';
      } else if (req.query.status === 'rejected') {
        query.verificationStatus = 'rejected';
      } else if (req.query.status === 'unverified') {
        query.isVerified = false;
        query.verificationStatus = { $in: ['unverified', 'pending', 'rejected'] };
      }
    }

    const mediators = await User.find(query)
      .select('name email phone referralCode isVerified verificationStatus verificationDate verificationNotes profile createdAt')
      .sort({ updatedAt: -1 });

    return sendSuccess(res, 'Verification list retrieved', mediators);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve Mediator Verification (Assign Verified Badge)
 * @route   PUT /api/admin/verifications/:id/approve
 * @access  Private (SUPER_ADMIN)
 */
const approveMediatorVerification = async (req, res, next) => {
  try {
    const mediator = await User.findOne({
      _id: req.params.id,
      role: ROLES.MEDIATOR,
    });

    if (!mediator) {
      return sendError(res, 'Mediator not found', 404);
    }

    mediator.isVerified = true;
    mediator.verificationStatus = 'verified';
    mediator.verificationDate = new Date();
    mediator.verificationNotes = req.body.notes || 'Approved by Super Admin';

    await mediator.save();

    return sendSuccess(res, `Verification approved! Mediator ${mediator.name} has been awarded a verified badge.`, mediator);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reject Mediator Verification
 * @route   PUT /api/admin/verifications/:id/reject
 * @access  Private (SUPER_ADMIN)
 */
const rejectMediatorVerification = async (req, res, next) => {
  try {
    const mediator = await User.findOne({
      _id: req.params.id,
      role: ROLES.MEDIATOR,
    });

    if (!mediator) {
      return sendError(res, 'Mediator not found', 404);
    }

    mediator.isVerified = false;
    mediator.verificationStatus = 'rejected';
    mediator.verificationNotes = req.body.notes || 'Verification request rejected by Super Admin';

    await mediator.save();

    return sendSuccess(res, `Verification rejected for Mediator ${mediator.name}.`, mediator);
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// 6. SETTINGS MANAGEMENT (Reviews, Contacts, Clients, Blogs, FAQs)
// ============================================================================

// --- A. Reviews ---
const getReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find().sort({ order: 1, createdAt: -1 });
    return sendSuccess(res, 'Reviews retrieved', reviews);
  } catch (err) {
    next(err);
  }
};

const createReview = async (req, res, next) => {
  try {
    const { name, role, quote, avatar, rating, featured, order } = req.body;
    const review = await Review.create({
      name,
      role: role || 'Property Buyer',
      quote,
      avatar: avatar || '/images/avatar/avt-png1.png',
      rating: rating || 5,
      featured: featured !== undefined ? featured : true,
      order: order || 0,
    });
    return sendSuccess(res, 'Review added successfully. Now visible on landing page.', review, 201);
  } catch (err) {
    next(err);
  }
};

const updateReview = async (req, res, next) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!review) return sendError(res, 'Review not found', 404);
    return sendSuccess(res, 'Review updated successfully', review);
  } catch (err) {
    next(err);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return sendError(res, 'Review not found', 404);
    return sendSuccess(res, 'Review deleted successfully');
  } catch (err) {
    next(err);
  }
};

// --- B. Contact Us Form Entries ---
const getContactEntries = async (req, res, next) => {
  try {
    const contacts = await ContactEntry.find().sort({ createdAt: -1 });
    return sendSuccess(res, 'Contact form entries retrieved', contacts);
  } catch (err) {
    next(err);
  }
};

const updateContactStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const contact = await ContactEntry.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!contact) return sendError(res, 'Contact entry not found', 404);
    return sendSuccess(res, 'Contact status updated', contact);
  } catch (err) {
    next(err);
  }
};

const deleteContactEntry = async (req, res, next) => {
  try {
    const contact = await ContactEntry.findByIdAndDelete(req.params.id);
    if (!contact) return sendError(res, 'Contact entry not found', 404);
    return sendSuccess(res, 'Contact entry deleted successfully');
  } catch (err) {
    next(err);
  }
};

// --- C. Clients ---
const getClients = async (req, res, next) => {
  try {
    const clients = await Client.find().sort({ order: 1, createdAt: -1 });
    return sendSuccess(res, 'Clients retrieved', clients);
  } catch (err) {
    next(err);
  }
};

const createClient = async (req, res, next) => {
  try {
    const { name, logo, website, order, isActive } = req.body;
    const client = await Client.create({
      name,
      logo: logo || '',
      website: website || '',
      order: order || 0,
      isActive: isActive !== undefined ? isActive : true,
    });
    return sendSuccess(res, 'Client partner created successfully', client, 201);
  } catch (err) {
    next(err);
  }
};

const updateClient = async (req, res, next) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!client) return sendError(res, 'Client not found', 404);
    return sendSuccess(res, 'Client updated successfully', client);
  } catch (err) {
    next(err);
  }
};

const deleteClient = async (req, res, next) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return sendError(res, 'Client not found', 404);
    return sendSuccess(res, 'Client deleted successfully');
  } catch (err) {
    next(err);
  }
};

// --- D. Blogs ---
const getBlogs = async (req, res, next) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    return sendSuccess(res, 'Blogs retrieved', blogs);
  } catch (err) {
    next(err);
  }
};

const createBlog = async (req, res, next) => {
  try {
    const { title, desc, content, author, category, date, image, featured } = req.body;
    const blog = await Blog.create({
      title,
      desc,
      content: content || '',
      author: author || 'Admin Specialist',
      category: category || 'Property',
      date: date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      image: image || '/images/blog/blog-1.jpg',
      featured: featured || false,
    });
    return sendSuccess(res, 'Blog post published successfully', blog, 201);
  } catch (err) {
    next(err);
  }
};

const updateBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!blog) return sendError(res, 'Blog not found', 404);
    return sendSuccess(res, 'Blog updated successfully', blog);
  } catch (err) {
    next(err);
  }
};

const deleteBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);
    if (!blog) return sendError(res, 'Blog not found', 404);
    return sendSuccess(res, 'Blog deleted successfully');
  } catch (err) {
    next(err);
  }
};

// --- E. FAQ Questions ---
const getFAQs = async (req, res, next) => {
  try {
    const faqs = await FAQ.find().sort({ order: 1, createdAt: -1 });
    return sendSuccess(res, 'FAQs retrieved', faqs);
  } catch (err) {
    next(err);
  }
};

const createFAQ = async (req, res, next) => {
  try {
    const { question, answer, category, order, isActive } = req.body;
    const faq = await FAQ.create({
      question,
      answer,
      category: category || 'General',
      order: order || 0,
      isActive: isActive !== undefined ? isActive : true,
    });
    return sendSuccess(res, 'FAQ created successfully', faq, 201);
  } catch (err) {
    next(err);
  }
};

const updateFAQ = async (req, res, next) => {
  try {
    const faq = await FAQ.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!faq) return sendError(res, 'FAQ not found', 404);
    return sendSuccess(res, 'FAQ updated successfully', faq);
  } catch (err) {
    next(err);
  }
};

const deleteFAQ = async (req, res, next) => {
  try {
    const faq = await FAQ.findByIdAndDelete(req.params.id);
    if (!faq) return sendError(res, 'FAQ not found', 404);
    return sendSuccess(res, 'FAQ deleted successfully');
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// 7. SUPER ADMIN PROFILE (Name, Email, Phone, Password)
// ============================================================================

/**
 * @desc    Get Current Super Admin Profile
 * @route   GET /api/admin/profile
 * @access  Private (SUPER_ADMIN)
 */
const getAdminProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    return sendSuccess(res, 'Super Admin profile retrieved', user);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Super Admin Profile (Name, Email, Phone, Password)
 * @route   PUT /api/admin/profile
 * @access  Private (SUPER_ADMIN)
 */
const updateAdminProfile = async (req, res, next) => {
  try {
    const { name, email, phone, currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();

    if (email && email.toLowerCase().trim() !== user.email) {
      const emailExists = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: user._id },
      });
      if (emailExists) {
        return sendError(res, 'Email is already taken by another account', 400);
      }
      user.email = email.toLowerCase().trim();
    }

    // Secure Password Change Logic
    if (newPassword) {
      if (!currentPassword) {
        return sendError(res, 'Current password is required to change password', 400);
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return sendError(res, 'Current password is incorrect', 400);
      }
      if (newPassword.length < 6) {
        return sendError(res, 'New password must be at least 6 characters long', 400);
      }
      user.password = newPassword; // Will be hashed by pre-save hook
    }

    await user.save();

    const safeUser = user.toJSON();
    return sendSuccess(res, 'Super Admin profile updated successfully', safeUser);
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// PROPERTY MANAGEMENT (Platform-wide)
// ============================================================================

const mongoose = require('mongoose');

const getAllProperties = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status && req.query.status !== 'all') query.status = req.query.status;
    if (req.query.mediatorId) query.mediator = req.query.mediatorId;
    if (req.query.sellerId) query.seller = req.query.sellerId;

    if (req.query.referralType === 'mediator') {
      query.mediator = { $ne: null };
    } else if (req.query.referralType === 'unreferred') {
      query.mediator = null;
    }

    if (req.query.propertyId) {
      query.propertyId = new RegExp(req.query.propertyId.trim(), 'i');
    }

    if (req.query.search && String(req.query.search).trim()) {
      const searchStr = String(req.query.search).trim();
      const searchRegex = new RegExp(searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const orConditions = [
        { propertyId: searchRegex },
        { title: searchRegex },
        { address: searchRegex },
        { city: searchRegex },
        { propertyType: searchRegex },
      ];
      if (mongoose.Types.ObjectId.isValid(searchStr)) {
        orConditions.push({ _id: searchStr });
      }
      query.$or = orConditions;
    }

    const total = await Property.countDocuments(query);
    const properties = await Property.find(query)
      .populate('seller', 'name email phone role referralCode isVerified profile')
      .populate('mediator', 'name email phone referralCode isVerified profile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Ensure all properties have a valid propertyId
    const formattedProperties = properties.map((prop) => {
      const p = prop.toObject();
      if (!p.propertyId || p.propertyId.startsWith('RTN-PROP-')) {
        p.propertyId = `RETN-PROP-${p._id.toString().slice(-6).toUpperCase()}`;
      }
      return p;
    });

    return sendPaginated(
      res,
      'All platform properties retrieved',
      formattedProperties,
      total,
      page,
      limit
    );
  } catch (error) {
    next(error);
  }
};

const deleteProperty = async (req, res, next) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);
    if (!property) {
      return sendError(res, 'Property listing not found', 404);
    }
    return sendSuccess(res, 'Property listing deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get All Promotion Requests (Mediator and Seller)
 * @route   GET /api/admin/promotions
 * @access  Private (SUPER_ADMIN)
 */
const getAllPromotionRequests = async (req, res, next) => {
  try {
    const requests = await PromotionRequest.find()
      .populate('mediator', 'name email phone role')
      .populate('property')
      .sort({ createdAt: -1 });

    return sendSuccess(res, 'Promotion requests retrieved successfully', requests);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve/Reject Promotion Request
 * @route   PUT /api/admin/promotions/:id/status
 * @access  Private (SUPER_ADMIN)
 */
const updatePromotionRequestStatus = async (req, res, next) => {
  try {
    const { status, adminNotes } = req.body;

    const validStatuses = ['approved', 'rejected', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return sendError(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const request = await PromotionRequest.findById(req.params.id).populate('property');
    if (!request) {
      return sendError(res, 'Promotion request not found', 404);
    }

    request.status = status;
    if (adminNotes !== undefined) {
      request.adminNotes = adminNotes;
    }

    // If approved and category is TOP_LISTING (or legacy TOP_LIST_LANDING)
    if (status === 'approved') {
      const isTopListing = request.promotionCategory === 'TOP_LISTING' || request.promotionType === 'TOP_LIST_LANDING';
      const days = request.durationDays || (request.durationPlan === '1_month' ? 30 : 7);
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

      request.startDate = startDate;
      request.endDate = endDate;

      if (isTopListing && request.property) {
        await Property.findByIdAndUpdate(request.property._id || request.property, {
          featured: true,
          topListing: {
            isActive: true,
            scope: request.topListingScope || 'district_wise',
            district: request.selectedDistrict || '',
            startDate,
            endDate,
          },
        });
      }
    } else if (status === 'rejected') {
      // If rejected, deactivate top listing if associated
      if (request.property) {
        await Property.findByIdAndUpdate(request.property._id || request.property, {
          'topListing.isActive': false,
        });
      }
    }

    await request.save();

    const populated = await PromotionRequest.findById(request._id)
      .populate('mediator', 'name email phone role')
      .populate('property');

    return sendSuccess(res, `Promotion request status updated to ${status}`, populated);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Promotion Settings (QR Scanner, Prices, Active Days, Description, Plans)
 * @route   GET /api/admin/promotion-settings
 * @access  Private (SUPER_ADMIN)
 */
const getPromotionSettings = async (req, res, next) => {
  try {
    let settings = await PromotionSetting.findOne();
    if (!settings) {
      settings = await PromotionSetting.create({});
    }
    return sendSuccess(res, 'Promotion settings retrieved successfully', settings);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Promotion Settings
 * @route   PUT /api/admin/promotion-settings
 * @access  Private (SUPER_ADMIN)
 */
const updatePromotionSettings = async (req, res, next) => {
  try {
    const {
      qrCodeImage,
      sellerListingSettings,
      topListingPricing,
      sellerPlanPricing,
      socialMediaPlans,
      topListPrice,
      topListActiveDays,
      socialMediaPrice,
      socialMediaDescription,
    } = req.body;

    let settings = await PromotionSetting.findOne();
    if (!settings) {
      settings = new PromotionSetting({});
    }

    if (qrCodeImage !== undefined) settings.qrCodeImage = qrCodeImage;
    if (sellerListingSettings !== undefined) {
      settings.sellerListingSettings = {
        freeListingLimit: Math.max(0, parseInt(sellerListingSettings.freeListingLimit, 10) || 0),
        freeListingValidityDays: Math.max(1, parseInt(sellerListingSettings.freeListingValidityDays, 10) || 30),
        paidListingFee: Math.max(0, parseInt(sellerListingSettings.paidListingFee, 10) || 0),
      };
    }
    if (topListingPricing !== undefined) settings.topListingPricing = topListingPricing;
    if (sellerPlanPricing !== undefined) {
      settings.sellerPlanPricing = {
        monthly: Number(sellerPlanPricing.monthly) || 99,
        annual: Number(sellerPlanPricing.annual) || 999,
      };
    }
    if (socialMediaPlans !== undefined && Array.isArray(socialMediaPlans)) settings.socialMediaPlans = socialMediaPlans;
    if (topListPrice !== undefined) settings.topListPrice = Number(topListPrice);
    if (topListActiveDays !== undefined) settings.topListActiveDays = Number(topListActiveDays);
    if (socialMediaPrice !== undefined) settings.socialMediaPrice = Number(socialMediaPrice);
    if (socialMediaDescription !== undefined) settings.socialMediaDescription = socialMediaDescription;

    await settings.save();

    return sendSuccess(res, 'Settings and pricing updated successfully', settings);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // 1. Dashboard
  getAdminStats,

  // 2. Mediators
  getAllMediators,
  getMediatorById,
  updateMediator,

  // 3. Sellers
  getAllSellers,
  getSellerById,
  getUnassignedSellers,
  assignSeller,
  updateSeller,

  // 4. Subscriptions
  getSubscriptionPlans,
  updateSubscriptionPlan,
  getSubscriptionTransactions,

  // 5. Verifications
  getMediatorVerifications,
  approveMediatorVerification,
  rejectMediatorVerification,

  // 6. Settings
  getReviews,
  createReview,
  updateReview,
  deleteReview,

  getContactEntries,
  updateContactStatus,
  deleteContactEntry,

  getClients,
  createClient,
  updateClient,
  deleteClient,

  getBlogs,
  createBlog,
  updateBlog,
  deleteBlog,

  getFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,

  // 7. Profile
  getAdminProfile,
  updateAdminProfile,

  // Properties & Promotions
  getAllProperties,
  deleteProperty,
  getAllPromotionRequests,
  updatePromotionRequestStatus,
  getPromotionSettings,
  updatePromotionSettings,
  updateMediatorSubscription,
  getPendingSubscriptionPayments,
  approveMediatorSubscriptionPayment,
  rejectMediatorSubscriptionPayment,

  // Buyer Enquiries & Leads
  getAllEnquiries,
  updateAdminEnquiryStatus,
  deleteAdminEnquiry,

  // 8. Analytics
  getAdminAnalytics,
};

/**
 * @desc    Admin Enable/Update Mediator Subscription Status
 * @route   PUT /api/admin/mediators/:id/subscription
 * @access  Private (SUPER_ADMIN)
 */
async function updateMediatorSubscription(req, res, next) {
  try {
    const {
      status = 'active',
      planId = 'pro_mediator',
      planName = 'Pro Mediator Plan',
      billingCycle = 'monthly',
      amountPaid = 2499,
    } = req.body;

    const mediator = await User.findById(req.params.id);
    if (!mediator || mediator.role !== ROLES.MEDIATOR) {
      return sendError(res, 'Mediator not found', 404);
    }

    const startDate = new Date();
    const endDate = new Date();
    const isAnnual = billingCycle === 'annual' || billingCycle === 'yearly';
    if (isAnnual) {
      endDate.setDate(endDate.getDate() + 365);
    } else {
      endDate.setDate(endDate.getDate() + 30);
    }

    mediator.subscription = {
      planId,
      planName,
      billingCycle: isAnnual ? 'annual' : 'monthly',
      status,
      startDate: status === 'active' ? startDate : mediator.subscription?.startDate,
      endDate: status === 'active' ? endDate : mediator.subscription?.endDate,
      amountPaid: Number(amountPaid) || (isAnnual ? 24990 : 2499),
    };

    await mediator.save();

    return sendSuccess(res, `Mediator subscription status updated to ${status}`, mediator);
  } catch (error) {
    next(error);
  }
}

/**
 * @desc    Get All Pending Subscription Payment Verification Submissions
 * @route   GET /api/admin/subscriptions/pending
 * @access  Private (SUPER_ADMIN)
 */
async function getPendingSubscriptionPayments(req, res, next) {
  try {
    const pendingUsers = await User.find({
      'subscription.status': 'pending_verification',
    }).select('-password').sort({ 'subscription.submittedAt': -1 });

    return sendSuccess(res, 'Fetched pending subscription payment submissions', pendingUsers);
  } catch (error) {
    next(error);
  }
}

/**
 * @desc    Approve User Subscription Payment (Mediator or Seller) & Unlock Access
 * @route   PUT /api/admin/subscriptions/mediator/:id/approve
 * @access  Private (SUPER_ADMIN)
 */
async function approveMediatorSubscriptionPayment(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    const isAnnual = user.subscription?.billingCycle === 'annual' || user.subscription?.billingCycle === 'yearly';
    const durationDays = isAnnual ? 365 : 30;

    // RENEWAL EXTENSION: If endDate is in the future, extend from existing endDate!
    let baseDate = new Date();
    if (user.subscription?.endDate && new Date(user.subscription.endDate) > baseDate) {
      baseDate = new Date(user.subscription.endDate);
    }
    const endDate = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const startDate = user.subscription?.startDate || new Date();

    user.subscription = {
      ...user.subscription.toObject(),
      status: 'active',
      startDate,
      endDate,
    };

    if (user.role === ROLES.SELLER) {
      user.sellerPlan = 'premium';
    }

    await user.save();

    // Create Subscription Transaction audit record
    try {
      await SubscriptionTransaction.create({
        user: user._id,
        userName: user.name,
        userRole: user.role,
        userEmail: user.email,
        planName: user.subscription.planName || (user.role === ROLES.SELLER ? 'Seller Premium Plan' : 'Pro Mediator Plan'),
        billingCycle: isAnnual ? 'annual' : 'monthly',
        amountPaid: user.subscription.amountPaid || (user.role === ROLES.SELLER ? 99 : (isAnnual ? 24990 : 2499)),
        currency: 'INR',
        transactionStatus: 'success',
        paymentMethod: 'UPI QR Scanner',
        transactionId: user.subscription.transactionId || `TXN-${Date.now()}`,
        purchaseDate: new Date(),
      });
    } catch (txnErr) {
      console.error('Non-critical audit error creating SubscriptionTransaction:', txnErr);
    }

    return sendSuccess(res, `Subscription payment approved for ${user.name}. Account features unlocked.`, user);
  } catch (error) {
    next(error);
  }
}

/**
 * @desc    Reject User Subscription Payment
 * @route   PUT /api/admin/subscriptions/mediator/:id/reject
 * @access  Private (SUPER_ADMIN)
 */
async function rejectMediatorSubscriptionPayment(req, res, next) {
  try {
    const { notes = 'Invalid or unverified transaction ID / receipt' } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    user.subscription = {
      ...user.subscription.toObject(),
      status: 'rejected',
      notes,
    };

    if (user.role === ROLES.SELLER && user.sellerPlan === 'premium') {
      user.sellerPlan = 'free';
    }

    await user.save();

    return sendSuccess(res, `Subscription payment submission rejected for ${user.name}`, user);
  } catch (error) {
    next(error);
  }
}

/**
 * @desc    Get All Buyer Enquiries & Leads for Super Admin
 * @route   GET /api/admin/enquiries
 * @access  Private (SUPER_ADMIN)
 */
async function getAllEnquiries(req, res, next) {
  try {
    const { scope = 'all', status = 'all', search = '' } = req.query;

    const query = {};

    if (scope === 'unassigned') {
      // Unassigned Free Seller leads managed directly by Super Admin
      query.mediator = null;
    } else if (scope === 'assigned') {
      // Leads assigned to Mediators
      query.mediator = { $ne: null };
    }

    if (status !== 'all') {
      query.status = status;
    }

    let enquiries = await PropertyEnquiry.find(query)
      .populate({
        path: 'property',
        select: 'title price priceFormatted propertyType propertyId address city images image purpose status',
      })
      .populate({
        path: 'seller',
        select: 'name email phone role sellerPlan referralCode referredBy',
        populate: {
          path: 'referredBy',
          select: 'name email phone referralCode',
        },
      })
      .populate({
        path: 'mediator',
        select: 'name email phone referralCode agencyName',
      })
      .sort({ createdAt: -1 });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      enquiries = enquiries.filter((e) => {
        const matchBuyer =
          (e.buyerName && e.buyerName.toLowerCase().includes(q)) ||
          (e.buyerPhone && e.buyerPhone.toLowerCase().includes(q)) ||
          (e.buyerEmail && e.buyerEmail.toLowerCase().includes(q)) ||
          (e.message && e.message.toLowerCase().includes(q));
        const matchProp =
          e.property &&
          ((e.property.title && e.property.title.toLowerCase().includes(q)) ||
            (e.property.city && e.property.city.toLowerCase().includes(q)) ||
            (e.property.address && e.property.address.toLowerCase().includes(q)));
        const matchSeller = e.seller && e.seller.name && e.seller.name.toLowerCase().includes(q);
        const matchMediator = e.mediator && e.mediator.name && e.mediator.name.toLowerCase().includes(q);
        return matchBuyer || matchProp || matchSeller || matchMediator;
      });
    }

    const [totalCount, unassignedCount, assignedCount, newCount, contactedCount, closedCount] = await Promise.all([
      PropertyEnquiry.countDocuments(),
      PropertyEnquiry.countDocuments({ mediator: null }),
      PropertyEnquiry.countDocuments({ mediator: { $ne: null } }),
      PropertyEnquiry.countDocuments({ status: 'NEW' }),
      PropertyEnquiry.countDocuments({ status: 'CONTACTED' }),
      PropertyEnquiry.countDocuments({ status: 'CLOSED' }),
    ]);

    return sendSuccess(res, 'Buyer enquiries retrieved successfully', {
      enquiries,
      stats: {
        total: totalCount,
        unassigned: unassignedCount,
        assigned: assignedCount,
        newCount,
        contactedCount,
        closedCount,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @desc    Update Buyer Enquiry Status by Super Admin
 * @route   PUT /api/admin/enquiries/:id/status
 * @access  Private (SUPER_ADMIN)
 */
async function updateAdminEnquiryStatus(req, res, next) {
  try {
    const { status, adminNotes } = req.body;
    const enquiry = await PropertyEnquiry.findById(req.params.id);
    if (!enquiry) {
      return sendError(res, 'Enquiry not found', 404);
    }

    if (status) enquiry.status = status;
    if (adminNotes !== undefined) enquiry.adminNotes = adminNotes;
    await enquiry.save();

    return sendSuccess(res, `Enquiry status updated to ${status}`, enquiry);
  } catch (error) {
    next(error);
  }
}

/**
 * @desc    Delete Enquiry by Super Admin
 * @route   DELETE /api/admin/enquiries/:id
 * @access  Private (SUPER_ADMIN)
 */
async function deleteAdminEnquiry(req, res, next) {
  try {
    const enquiry = await PropertyEnquiry.findByIdAndDelete(req.params.id);
    if (!enquiry) {
      return sendError(res, 'Enquiry not found', 404);
    }
    return sendSuccess(res, 'Enquiry deleted successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * @desc    Get Platform Analytics for Super Admin (Date-wise & Aggregate)
 * @route   GET /api/admin/analytics
 * @access  Private (SUPER_ADMIN)
 */
async function getAdminAnalytics(req, res, next) {
  try {
    const {
      range = '30days', // 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'all' | 'custom'
      startDate,
      endDate,
      groupBy: userGroupBy,
    } = req.query;

    // Helper to get current IST Date components
    const getISTDateString = (d = new Date()) => {
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // 'YYYY-MM-DD'
    };

    const todayIST = getISTDateString();
    let start = new Date(`${todayIST}T00:00:00.000+05:30`);
    let end = new Date(`${todayIST}T23:59:59.999+05:30`);

    if (range === 'today') {
      start = new Date(`${todayIST}T00:00:00.000+05:30`);
      end = new Date(`${todayIST}T23:59:59.999+05:30`);
    } else if (range === 'yesterday') {
      const yDate = new Date(Date.now() - 86400000);
      const yIST = getISTDateString(yDate);
      start = new Date(`${yIST}T00:00:00.000+05:30`);
      end = new Date(`${yIST}T23:59:59.999+05:30`);
    } else if (range === '7days') {
      const sDate = new Date(Date.now() - 6 * 86400000);
      const sIST = getISTDateString(sDate);
      start = new Date(`${sIST}T00:00:00.000+05:30`);
      end = new Date(`${todayIST}T23:59:59.999+05:30`);
    } else if (range === '30days') {
      const sDate = new Date(Date.now() - 29 * 86400000);
      const sIST = getISTDateString(sDate);
      start = new Date(`${sIST}T00:00:00.000+05:30`);
      end = new Date(`${todayIST}T23:59:59.999+05:30`);
    } else if (range === 'thisMonth') {
      const [yyyy, mm] = todayIST.split('-');
      start = new Date(`${yyyy}-${mm}-01T00:00:00.000+05:30`);
      end = new Date(`${todayIST}T23:59:59.999+05:30`);
    } else if (range === 'lastMonth') {
      const curYear = parseInt(todayIST.split('-')[0], 10);
      const curMonth = parseInt(todayIST.split('-')[1], 10);
      const lastMonthYear = curMonth === 1 ? curYear - 1 : curYear;
      const lastMonthNum = curMonth === 1 ? 12 : curMonth - 1;
      const lastMonthStr = String(lastMonthNum).padStart(2, '0');
      const lastDayOfLastMonth = new Date(lastMonthYear, lastMonthNum, 0).getDate();
      start = new Date(`${lastMonthYear}-${lastMonthStr}-01T00:00:00.000+05:30`);
      end = new Date(`${lastMonthYear}-${lastMonthStr}-${String(lastDayOfLastMonth).padStart(2, '0')}T23:59:59.999+05:30`);
    } else if (range === 'thisYear') {
      const yyyy = todayIST.split('-')[0];
      start = new Date(`${yyyy}-01-01T00:00:00.000+05:30`);
      end = new Date(`${todayIST}T23:59:59.999+05:30`);
    } else if (range === 'all') {
      start = new Date('2020-01-01T00:00:00.000+05:30');
      end = new Date(`${todayIST}T23:59:59.999+05:30`);
    } else if (range === 'custom') {
      if (startDate) {
        start = new Date(`${startDate}T00:00:00.000+05:30`);
      } else {
        const sDate = new Date(Date.now() - 29 * 86400000);
        start = new Date(`${getISTDateString(sDate)}T00:00:00.000+05:30`);
      }
      if (endDate) {
        end = new Date(`${endDate}T23:59:59.999+05:30`);
      } else {
        end = new Date(`${todayIST}T23:59:59.999+05:30`);
      }
    } else {
      const sDate = new Date(Date.now() - 29 * 86400000);
      start = new Date(`${getISTDateString(sDate)}T00:00:00.000+05:30`);
      end = new Date(`${todayIST}T23:59:59.999+05:30`);
    }

    const durationDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    const groupBy = userGroupBy || (durationDays > 90 ? 'month' : 'day');

    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - (end.getTime() - start.getTime()));

    // 1. Lifetime Totals
    const [
      lifetimeMembers,
      lifetimeMediators,
      lifetimeSellers,
      lifetimeProperties,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: ROLES.MEDIATOR }),
      User.countDocuments({ role: ROLES.SELLER }),
      Property.countDocuments(),
    ]);

    // 2. Selected Range Totals
    const [
      rangeMembers,
      rangeMediators,
      rangeSellers,
      rangeProperties,
      prevRangeMembers,
      prevRangeMediators,
      prevRangeSellers,
      prevRangeProperties,
    ] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      User.countDocuments({ role: ROLES.MEDIATOR, createdAt: { $gte: start, $lte: end } }),
      User.countDocuments({ role: ROLES.SELLER, createdAt: { $gte: start, $lte: end } }),
      Property.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      User.countDocuments({ createdAt: { $gte: prevStart, $lte: prevEnd } }),
      User.countDocuments({ role: ROLES.MEDIATOR, createdAt: { $gte: prevStart, $lte: prevEnd } }),
      User.countDocuments({ role: ROLES.SELLER, createdAt: { $gte: prevStart, $lte: prevEnd } }),
      Property.countDocuments({ createdAt: { $gte: prevStart, $lte: prevEnd } }),
    ]);

    const calcGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    // 3. Grouped Date-Wise Aggregations
    const datePattern = groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';

    const [userTimelineAgg, propTimelineAgg] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: datePattern, date: '$createdAt', timezone: '+05:30' } },
              role: '$role',
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Property.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: datePattern, date: '$createdAt', timezone: '+05:30' } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const dateDataMap = {};

    userTimelineAgg.forEach((item) => {
      const d = item._id.date;
      const role = item._id.role;
      if (!dateDataMap[d]) {
        dateDataMap[d] = { members: 0, mediators: 0, sellers: 0, properties: 0 };
      }
      dateDataMap[d].members += item.count;
      if (role === ROLES.MEDIATOR) {
        dateDataMap[d].mediators += item.count;
      } else if (role === ROLES.SELLER) {
        dateDataMap[d].sellers += item.count;
      }
    });

    propTimelineAgg.forEach((item) => {
      const d = item._id;
      if (!dateDataMap[d]) {
        dateDataMap[d] = { members: 0, mediators: 0, sellers: 0, properties: 0 };
      }
      dateDataMap[d].properties += item.count;
    });

    const timeline = [];
    if (groupBy === 'month') {
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const endLimit = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cur <= endLimit) {
        const yyyy = cur.getFullYear();
        const mm = String(cur.getMonth() + 1).padStart(2, '0');
        const dStr = `${yyyy}-${mm}`;
        const monthName = cur.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
        const existing = dateDataMap[dStr] || { members: 0, mediators: 0, sellers: 0, properties: 0 };
        timeline.push({
          date: dStr,
          label: monthName,
          fullDate: monthName,
          members: existing.members,
          mediators: existing.mediators,
          sellers: existing.sellers,
          properties: existing.properties,
          totalAdditions: existing.members + existing.properties,
        });
        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      const cur = new Date(start);
      while (cur <= end) {
        const yyyy = cur.getFullYear();
        const mm = String(cur.getMonth() + 1).padStart(2, '0');
        const dd = String(cur.getDate()).padStart(2, '0');
        const dStr = `${yyyy}-${mm}-${dd}`;
        const label = cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
        const dayOfWeek = cur.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' });
        const existing = dateDataMap[dStr] || { members: 0, mediators: 0, sellers: 0, properties: 0 };
        timeline.push({
          date: dStr,
          label: `${label}`,
          dayOfWeek,
          fullDate: cur.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
          members: existing.members,
          mediators: existing.mediators,
          sellers: existing.sellers,
          properties: existing.properties,
          totalAdditions: existing.members + existing.properties,
        });
        cur.setDate(cur.getDate() + 1);
      }
    }

    // 4. Breakdown distributions in range
    const [propertyTypeAgg, propertyPurposeAgg, mediatorVerifAgg] = await Promise.all([
      Property.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$propertyType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Property.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$purpose', count: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { role: ROLES.MEDIATOR, createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$verificationStatus', count: { $sum: 1 } } },
      ]),
    ]);

    // 5. Recent Items created in the range
    const [recentUsersRaw, recentPropertiesRaw] = await Promise.all([
      User.find({ createdAt: { $gte: start, $lte: end } })
        .select('name email phone role isVerified verificationStatus referralCode referredBy createdAt')
        .populate('referredBy', 'name email referralCode')
        .sort({ createdAt: -1 })
        .limit(1000)
        .lean(),
      Property.find({ createdAt: { $gte: start, $lte: end } })
        .select('title propertyId price priceFormatted propertyType purpose address city status createdAt images')
        .populate('seller', 'name email phone')
        .populate('mediator', 'name email referralCode')
        .sort({ createdAt: -1 })
        .limit(1000)
        .lean(),
    ]);

    const formatISTDateStr = (dateObj) => {
      if (!dateObj) return '';
      const d = new Date(dateObj);
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
    };

    const recentUsers = recentUsersRaw.map((u) => ({
      ...u,
      dateFormatted: formatISTDateStr(u.createdAt),
    }));

    const recentProperties = recentPropertiesRaw.map((p) => ({
      ...p,
      dateFormatted: formatISTDateStr(p.createdAt),
    }));

    return sendSuccess(res, 'Admin analytics retrieved successfully', {
      range,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      groupBy,
      summary: {
        lifetime: {
          members: lifetimeMembers,
          mediators: lifetimeMediators,
          sellers: lifetimeSellers,
          properties: lifetimeProperties,
        },
        range: {
          members: rangeMembers,
          mediators: rangeMediators,
          sellers: rangeSellers,
          properties: rangeProperties,
        },
        growth: {
          members: calcGrowth(rangeMembers, prevRangeMembers),
          mediators: calcGrowth(rangeMediators, prevRangeMediators),
          sellers: calcGrowth(rangeSellers, prevRangeSellers),
          properties: calcGrowth(rangeProperties, prevRangeProperties),
        },
      },
      timeline,
      distributions: {
        propertyTypes: propertyTypeAgg,
        propertyPurposes: propertyPurposeAgg,
        mediatorVerifications: mediatorVerifAgg,
      },
      recentItems: {
        users: recentUsers,
        properties: recentProperties,
      },
    });
  } catch (error) {
    next(error);
  }
}

