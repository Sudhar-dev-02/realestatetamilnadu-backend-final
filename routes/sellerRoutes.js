const express = require('express');
const {
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
} = require('../controllers/sellerController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const { ROLES } = require('../models/User');

const router = express.Router();

// Apply authentication and restrict to SELLER on all routes in this file
router.use(protect);
router.use(authorizeRoles(ROLES.SELLER));

// Seller Profile & Mediator Info
router.get('/profile', getSellerProfile);
router.put('/profile', updateSellerProfile);
router.post('/upgrade-plan', upgradeSellerPlan);

// Seller's Own Properties
router.get('/properties', getMyProperties);
router.post('/properties', createProperty);
router.post('/properties/:id/renew', renewProperty);
router.put('/properties/:id', updateMyProperty);
router.delete('/properties/:id', deleteMyProperty);

// Seller Promotions
router.get('/promotions', getMyPromotions);
router.post('/promotions', createPromotionRequest);

// Seller Enquiries & Interested Leads
router.get('/enquiries', getSellerEnquiries);
router.put('/enquiries/:id/status', updateSellerEnquiryStatus);

module.exports = router;
