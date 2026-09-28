const express = require('express');
const {
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
  updateMediatorSubscription,
  getPendingSubscriptionPayments,
  approveMediatorSubscriptionPayment,
  rejectMediatorSubscriptionPayment,

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

  getAllProperties,
  deleteProperty,
  getAllPromotionRequests,
  updatePromotionRequestStatus,
  getPromotionSettings,
  updatePromotionSettings,

  // Buyer Enquiries
  getAllEnquiries,
  updateAdminEnquiryStatus,
  deleteAdminEnquiry,

  // Analytics
  getAdminAnalytics,
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const { ROLES } = require('../models/User');

const router = express.Router();

// Apply authentication and restrict to SUPER_ADMIN on all routes
router.use(protect);
router.use(authorizeRoles(ROLES.SUPER_ADMIN));

// 1. Dashboard Overview Stats & Analytics
router.get('/stats', getAdminStats);
router.get('/analytics', getAdminAnalytics);

// 2. Mediators Management
router.get('/mediators', getAllMediators);
router.get('/mediators/:id', getMediatorById);
router.put('/mediators/:id', updateMediator);

// 3. Sellers Management
router.get('/sellers', getAllSellers);
router.get('/sellers/unassigned', getUnassignedSellers);
router.get('/sellers/:id', getSellerById);
router.put('/sellers/:id/assign', assignSeller);
router.put('/sellers/:id', updateSeller);

// 4. Subscription Management
router.get('/subscriptions/plans', getSubscriptionPlans);
router.put('/subscriptions/plans/:id', updateSubscriptionPlan);
router.get('/subscriptions/transactions', getSubscriptionTransactions);
router.put('/subscriptions/mediator/:id', updateMediatorSubscription);
router.get('/subscriptions/pending', getPendingSubscriptionPayments);
router.put('/subscriptions/mediator/:id/approve', approveMediatorSubscriptionPayment);
router.put('/subscriptions/mediator/:id/reject', rejectMediatorSubscriptionPayment);

// 5. Verification Management
router.get('/verifications', getMediatorVerifications);
router.put('/verifications/:id/approve', approveMediatorVerification);
router.put('/verifications/:id/reject', rejectMediatorVerification);

// 6. Settings Management
// 6A. Reviews
router.get('/settings/reviews', getReviews);
router.post('/settings/reviews', createReview);
router.put('/settings/reviews/:id', updateReview);
router.delete('/settings/reviews/:id', deleteReview);

// 6B. Contact Us Form Entries
router.get('/settings/contacts', getContactEntries);
router.put('/settings/contacts/:id/status', updateContactStatus);
router.delete('/settings/contacts/:id', deleteContactEntry);

// 6C. Clients
router.get('/settings/clients', getClients);
router.post('/settings/clients', createClient);
router.put('/settings/clients/:id', updateClient);
router.delete('/settings/clients/:id', deleteClient);

// 6D. Blogs
router.get('/settings/blogs', getBlogs);
router.post('/settings/blogs', createBlog);
router.put('/settings/blogs/:id', updateBlog);
router.delete('/settings/blogs/:id', deleteBlog);

// 6E. FAQ Questions
router.get('/settings/faqs', getFAQs);
router.post('/settings/faqs', createFAQ);
router.put('/settings/faqs/:id', updateFAQ);
router.delete('/settings/faqs/:id', deleteFAQ);

// 7. Super Admin Profile
router.get('/profile', getAdminProfile);
router.put('/profile', updateAdminProfile);

// Properties (View and delete)
router.get('/properties', getAllProperties);
router.delete('/properties/:id', deleteProperty);

// Promotions Management
router.get('/promotions', getAllPromotionRequests);
router.put('/promotions/:id/status', updatePromotionRequestStatus);
router.get('/promotion-settings', getPromotionSettings);
router.put('/promotion-settings', updatePromotionSettings);

// 8. Buyer Enquiries & Leads Management (Unassigned & Platform-wide)
router.get('/enquiries', getAllEnquiries);
router.put('/enquiries/:id/status', updateAdminEnquiryStatus);
router.delete('/enquiries/:id', deleteAdminEnquiry);

module.exports = router;
