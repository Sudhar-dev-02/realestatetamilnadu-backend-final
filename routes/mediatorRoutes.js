const express = require('express');
const {
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
} = require('../controllers/mediatorController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const { requireActiveSubscription } = require('../middleware/subscriptionMiddleware');
const { ROLES } = require('../models/User');

const router = express.Router();

// Apply authentication and restrict to MEDIATOR on all routes in this file
router.use(protect);
router.use(authorizeRoles(ROLES.MEDIATOR));

// Subscription Management (Always accessible so mediator can subscribe or renew)
router.post('/subscription/enable', enableSubscriptionPlan);
router.post('/subscription/submit-payment', submitSubscriptionPayment);

// Referral Code & Link (Accessible so mediator can view their code/profile)
router.get('/my-referral-code', getMyReferralCode);

// Operational Mediator Features (Require Active, Non-Expired Subscription)
// If subscription date has finished, access to these routes is cut.
router.use(requireActiveSubscription);

// Assigned Sellers Management
router.get('/sellers', getMySellers);
router.get('/sellers/:id', getAssignedSellerDetails);
router.put('/sellers/:id', updateAssignedSeller);

// Properties of Assigned Sellers
router.get('/properties', getAssignedSellersProperties);
router.post('/sellers/:sellerId/properties', createPropertyForSeller);
router.put('/properties/:id', updateProperty);
router.delete('/properties/:id', deleteProperty);

// Promotions Management
router.post('/promotions', createPromotionRequest);
router.get('/promotions', getMyPromotions);

// Buyer Enquiries & Interested Leads
router.get('/enquiries', getMediatorEnquiries);
router.put('/enquiries/:id/status', updateMediatorEnquiryStatus);

module.exports = router;
