const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createCashfreeOrder,
  verifyCashfreePayment,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  recordFailedPayment,
  cashfreeWebhook,
} = require('../controllers/paymentController');

// Create Cashfree Order for Promotions
router.post('/create-order', protect, createCashfreeOrder);

// Verify Cashfree Payment & Auto Approve Promotion
router.post('/verify', protect, verifyCashfreePayment);

// Create Cashfree Order for Subscriptions
router.post('/create-subscription-order', protect, createSubscriptionOrder);

// Verify Cashfree Payment & Auto Activate Subscription
router.post('/verify-subscription', protect, verifySubscriptionPayment);

// Record Failed/Cancelled Payment
router.post('/record-failed', protect, recordFailedPayment);

// Webhook Callback
router.post('/webhook', cashfreeWebhook);

module.exports = router;
