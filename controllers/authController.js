const authService = require('../services/authService');
const referralService = require('../services/referralService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * @desc    Register a new Mediator
 * @route   POST /api/auth/register/mediator
 * @access  Public
 */
const registerMediator = async (req, res, next) => {
  try {
    const { name, email, password, phone, profile } = req.body;
    const result = await authService.registerMediator({
      name,
      email,
      password,
      phone,
      profile,
    });

    return sendSuccess(
      res,
      'Mediator registered successfully. A unique referral code has been generated.',
      {
        user: result.user,
        referralCode: result.user.referralCode,
        token: result.token,
      },
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Register a new Seller (Referral Code is OPTIONAL)
 * @route   POST /api/auth/register/seller
 * @access  Public
 */
const registerSeller = async (req, res, next) => {
  try {
    const { name, email, password, phone, referralCode, profile } = req.body;

    const result = await authService.registerSeller({
      name,
      email,
      password,
      phone,
      referralCode,
      profile,
    });

    const isAssigned = !!result.mediatorInfo;
    const message = isAssigned
      ? `Seller registered successfully and linked to Mediator (${result.mediatorInfo.name}).`
      : 'Seller registered successfully without referral code. Managed directly by Super Admin.';

    return sendSuccess(
      res,
      message,
      {
        user: result.user,
        isAssignedToMediator: isAssigned,
        mediator: result.mediatorInfo,
        token: result.token,
      },
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Login User (Super Admin / Mediator / Seller)
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, username, password } = req.body;
    const identifier = email || username;

    if (!identifier || !password) {
      return sendError(res, 'Please provide email/username and password', 400);
    }

    const result = await authService.loginUser(identifier, password);

    return sendSuccess(
      res,
      `Welcome back, ${result.user.name}!`,
      {
        user: result.user,
        role: result.user.role,
        token: result.token,
      },
      200
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Current Logged-in User Profile
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res, next) => {
  try {
    const user = req.user;
    let hierarchyData = {};

    if (user.role === 'SELLER') {
      if (user.referredBy) {
        hierarchyData = {
          managementType: 'MEDIATOR_MANAGED',
          mediator: user.referredBy,
        };
      } else {
        hierarchyData = {
          managementType: 'SUPER_ADMIN_MANAGED',
          message: 'Directly managed by Super Admin',
        };
      }
    } else if (user.role === 'MEDIATOR') {
      const sellers = await referralService.getSellersByMediator(user._id);
      hierarchyData = {
        referralCode: user.referralCode,
        referredSellersCount: sellers.length,
      };
    }

    return sendSuccess(res, 'Profile retrieved successfully', {
      user,
      hierarchy: hierarchyData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Validate a Mediator Referral Code (Pre-check for UI)
 * @route   GET /api/auth/validate-referral/:code
 * @access  Public
 */
const validateReferralCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const result = await referralService.validateReferralCode(code);

    if (!result.isValid) {
      return sendError(res, result.message, 400, { isValid: false });
    }

    return sendSuccess(res, result.message, {
      isValid: true,
      mediator: {
        id: result.mediator._id,
        name: result.mediator.name,
        referralCode: result.mediator.referralCode,
        agencyName: result.mediator.profile?.agencyName || '',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Logged-in User Profile
 * @route   PUT /api/auth/profile
 * @access  Private
 */
const updateProfile = async (req, res, next) => {
  try {
    const user = req.user;
    const { name, email, phone, profile, currentPassword, newPassword } = req.body;

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;

    if (profile && typeof profile === 'object') {
      const existingProfile = user.profile ? (typeof user.profile.toObject === 'function' ? user.profile.toObject() : user.profile) : {};
      user.profile = {
        ...existingProfile,
        ...profile
      };
      user.markModified('profile');
    }

    if (newPassword) {
      if (!currentPassword) {
        return sendError(res, 'Current password is required to set a new password', 400);
      }
      
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return sendError(res, 'Incorrect current password', 401);
      }

      if (newPassword.length < 6) {
        return sendError(res, 'New password must be at least 6 characters', 400);
      }

      user.password = newPassword;
    }

    await user.save();

    const updatedUser = user.toObject();
    delete updatedUser.password;

    return sendSuccess(res, 'Profile updated successfully', { user: updatedUser });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Google Auth (Login or new user detection)
 * @route   POST /api/auth/google-auth
 * @access  Public
 */
const googleAuth = async (req, res, next) => {
  try {
    const { token, accessToken, idToken, email, name, avatar, googleId } = req.body;
    if (!token && !accessToken && !idToken && !email) {
      return sendError(res, 'Google authentication token is required', 400);
    }

    const result = await authService.googleAuth({ token, accessToken, idToken, email, name, avatar, googleId });

    if (result.isNewUser) {
      return sendSuccess(
        res,
        'Google account verified. Please complete your registration details.',
        {
          isNewUser: true,
          email: result.email,
          name: result.name,
          avatar: result.avatar,
          googleId: result.googleId,
          googleAuthToken: result.googleAuthToken,
        },
        200
      );
    }

    return sendSuccess(
      res,
      `Welcome back, ${result.user.name}!`,
      {
        isNewUser: false,
        user: result.user,
        role: result.user.role,
        token: result.token,
      },
      200
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Google Register (Complete details for Mediator or Seller)
 * @route   POST /api/auth/google-register
 * @access  Public
 */
const googleRegister = async (req, res, next) => {
  try {
    const { name, email, role, phone, agencyName, referralCode, avatar, googleId, googleAuthToken, token, accessToken, idToken } = req.body;

    if (!name || !role) {
      return sendError(res, 'Name and role are required', 400);
    }

    const result = await authService.googleRegister({
      name,
      email,
      role,
      phone,
      agencyName,
      referralCode,
      avatar,
      googleId,
      googleAuthToken,
      token,
      accessToken,
      idToken,
    });

    const isMediator = result.user.role === 'MEDIATOR';
    const message = isMediator
      ? `Mediator registered successfully with Google. Your Referral Code is "${result.referralCode || result.user.referralCode}".`
      : 'Seller registered successfully with Google.';

    return sendSuccess(
      res,
      message,
      {
        user: result.user,
        role: result.user.role,
        token: result.token,
        mediator: result.mediatorInfo || null,
      },
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send OTP to email for password reset
 * @route   POST /api/auth/forgot-password/send-otp
 * @access  Public
 */
const sendForgotPasswordOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return sendError(res, 'Please provide an email address', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    const { User } = require('../models/User');
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return sendError(res, 'No account found with this email address.', 404);
    }

    if (!user.isActive) {
      return sendError(res, 'This account is deactivated. Please contact support.', 403);
    }

    const Otp = require('../models/Otp');
    const { sendPasswordResetOtpEmail } = require('../services/emailService');

    // Generate 6-digit random numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Remove any previous OTP for this email
    await Otp.deleteMany({ email: cleanEmail, type: 'FORGOT_PASSWORD' });

    // Store new OTP with 10-minute expiry
    await Otp.create({
      email: cleanEmail,
      otp,
      type: 'FORGOT_PASSWORD',
    });

    // Send email
    await sendPasswordResetOtpEmail(cleanEmail, otp, user.name);

    return sendSuccess(
      res,
      `A 6-digit OTP has been sent to ${cleanEmail}. It is valid for 10 minutes.`,
      {
        email: cleanEmail,
      },
      200
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resend OTP for password reset
 * @route   POST /api/auth/forgot-password/resend-otp
 * @access  Public
 */
const resendForgotPasswordOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return sendError(res, 'Please provide an email address', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    const { User } = require('../models/User');
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return sendError(res, 'No account found with this email address.', 404);
    }

    const Otp = require('../models/Otp');
    const { sendPasswordResetOtpEmail } = require('../services/emailService');

    // Generate fresh 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.deleteMany({ email: cleanEmail, type: 'FORGOT_PASSWORD' });

    await Otp.create({
      email: cleanEmail,
      otp,
      type: 'FORGOT_PASSWORD',
    });

    await sendPasswordResetOtpEmail(cleanEmail, otp, user.name);

    return sendSuccess(
      res,
      `A new OTP has been sent to ${cleanEmail}.`,
      {
        email: cleanEmail,
      },
      200
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify OTP and Reset Password
 * @route   POST /api/auth/forgot-password/reset-password
 * @access  Public
 */
const resetPasswordWithOtp = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return sendError(res, 'Email, OTP, and new password are required.', 400);
    }

    if (newPassword.length < 6) {
      return sendError(res, 'New password must be at least 6 characters long.', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otp.toString().trim();

    const Otp = require('../models/Otp');
    const otpRecord = await Otp.findOne({
      email: cleanEmail,
      otp: cleanOtp,
      type: 'FORGOT_PASSWORD',
    });

    if (!otpRecord) {
      return sendError(res, 'Invalid or expired OTP. Please verify or request a new OTP.', 400);
    }

    const { User } = require('../models/User');
    const user = await User.findOne({ email: cleanEmail }).select('+password');

    if (!user) {
      return sendError(res, 'User account not found.', 404);
    }

    // Set new password (pre-save hook will hash it with bcrypt)
    user.password = newPassword;
    await user.save();

    // Invalidate the OTP after use
    await Otp.deleteMany({ email: cleanEmail, type: 'FORGOT_PASSWORD' });

    return sendSuccess(
      res,
      'Password reset successful! You can now log in with your new password.',
      {
        email: cleanEmail,
      },
      200
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};


