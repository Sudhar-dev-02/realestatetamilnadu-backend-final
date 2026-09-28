const express = require('express');
const { body } = require('express-validator');
const {
  registerMediator,
  registerSeller,
  login,
  getMe,
  validateReferralCode,
  updateProfile,
  googleAuth,
  googleRegister,
  sendForgotPasswordOtp,
  resendForgotPasswordOtp,
  resetPasswordWithOtp,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');

const router = express.Router();

// Validation Rules
const mediatorValidation = [
  body('name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  validate,
];

const sellerValidation = [
  body('name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  // referralCode is OPTIONAL - no required rule
  validate,
];

const loginValidation = [
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

const sendOtpValidation = [
  body('email').isEmail().withMessage('Please provide a valid email address'),
  validate,
];

const resetPasswordValidation = [
  body('email').isEmail().withMessage('Please provide a valid email address'),
  body('otp').trim().notEmpty().withMessage('OTP is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long'),
  validate,
];

// Routes
router.post('/register/mediator', mediatorValidation, registerMediator);
router.post('/register/seller', sellerValidation, registerSeller);
router.post('/login', loginValidation, login);
router.post('/google-auth', googleAuth);
router.post('/google-register', googleRegister);

// Forgot Password with OTP Routes
router.post('/forgot-password/send-otp', sendOtpValidation, sendForgotPasswordOtp);
router.post('/forgot-password/resend-otp', sendOtpValidation, resendForgotPasswordOtp);
router.post('/forgot-password/reset-password', resetPasswordValidation, resetPasswordWithOtp);

router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.get('/validate-referral/:code', validateReferralCode);

module.exports = router;


