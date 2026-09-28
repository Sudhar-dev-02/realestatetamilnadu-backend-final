const { User, ROLES } = require('../models/User');
const { generateUniqueReferralCode } = require('../utils/generateReferralCode');
const { validateReferralCode } = require('./referralService');

/**
 * Register a new Mediator
 * @param {Object} data Registration data { name, email, password, phone, profile }
 * @returns {Promise<{user: Object, token: String}>}
 */
const registerMediator = async ({ name, email, password, phone, profile = {} }) => {
  // Check if email already exists
  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    const error = new Error('An account with this email address already exists');
    error.statusCode = 409;
    throw error;
  }

  // Generate unique referral code for Mediator
  const referralCode = await generateUniqueReferralCode(User, 'MED');

  // Create Mediator user
  const mediator = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role: ROLES.MEDIATOR,
    phone: phone ? phone.trim() : '',
    referralCode,
    profile: {
      agencyName: profile.agencyName || '',
      licenseNumber: profile.licenseNumber || '',
      address: profile.address || '',
      city: profile.city || 'Tamil Nadu',
      state: profile.state || 'Tamil Nadu',
      bio: profile.bio || '',
      avatar: profile.avatar || '/images/avatar/default-user.jpg',
    },
    isActive: true,
  });

  const token = mediator.getSignedJwtToken();

  return {
    user: mediator,
    token,
  };
};

/**
 * Register a new Seller (with optional Mediator referral code)
 * @param {Object} data Registration data { name, email, password, phone, referralCode, profile }
 * @returns {Promise<{user: Object, token: String, mediatorInfo: Object|null}>}
 */
const registerSeller = async ({ name, email, password, phone, referralCode, profile = {} }) => {
  // Check if email already exists
  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    const error = new Error('An account with this email address already exists');
    error.statusCode = 409;
    throw error;
  }

  let referredBy = null;
  let mediatorInfo = null;

  // Handle optional referral code
  if (referralCode && referralCode.trim() !== '') {
    const validation = await validateReferralCode(referralCode);
    if (!validation.isValid) {
      const error = new Error(validation.message);
      error.statusCode = 400;
      throw error;
    }
    referredBy = validation.mediator._id;
    mediatorInfo = {
      id: validation.mediator._id,
      name: validation.mediator.name,
      email: validation.mediator.email,
      referralCode: validation.mediator.referralCode,
    };
  }

  // Create Seller user
  const seller = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role: ROLES.SELLER,
    phone: phone ? phone.trim() : '',
    referredBy, // null if no referral code -> managed by SUPER_ADMIN
    profile: {
      address: profile.address || '',
      city: profile.city || 'Tamil Nadu',
      state: profile.state || 'Tamil Nadu',
      bio: profile.bio || '',
      avatar: profile.avatar || '/images/avatar/default-user.jpg',
    },
    isActive: true,
  });

  const token = seller.getSignedJwtToken();

  return {
    user: seller,
    token,
    mediatorInfo,
  };
};

/**
 * Authenticate a user by email/username and password
 * @param {String} identifier Email address or username
 * @param {String} password Plaintext password
 * @returns {Promise<{user: Object, token: String}>}
 */
const loginUser = async (identifier, password) => {
  if (!identifier || !password) {
    const error = new Error('Please provide both identifier (email/username) and password');
    error.statusCode = 400;
    throw error;
  }

  const cleanIdentifier = identifier.trim().toLowerCase();
  const escapedIdentifier = cleanIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Find user by email or name with password field included
  const user = await User.findOne({
    $or: [{ email: cleanIdentifier }, { name: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } }],
  })
    .select('+password')
    .populate('referredBy', 'name email phone referralCode');

  if (!user) {
    const error = new Error('Invalid email/username or password');
    error.statusCode = 401;
    throw error;
  }

  // Check if account is active
  if (!user.isActive) {
    const error = new Error('Your account has been deactivated. Please contact platform support / Super Admin.');
    error.statusCode = 403;
    throw error;
  }

  // Verify password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    const error = new Error('Invalid email/username or password');
    error.statusCode = 401;
    throw error;
  }

  const token = user.getSignedJwtToken();

  return {
    user,
    token,
  };
};

const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verify Google access token or ID token against Google OAuth2 services
 */
const verifyGoogleToken = async ({ idToken, accessToken, token }) => {
  const tokenToUse = idToken || accessToken || token;
  if (!tokenToUse) {
    throw new Error('Google authentication token is required');
  }

  // 1. Verify as ID Token if structured as JWT (3 parts) or explicitly provided as idToken
  if (idToken || (typeof tokenToUse === 'string' && tokenToUse.split('.').length === 3)) {
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: tokenToUse,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (payload && payload.email) {
        return {
          email: payload.email.toLowerCase().trim(),
          name: payload.name || '',
          avatar: payload.picture || '/images/avatar/default-user.jpg',
          googleId: payload.sub || '',
        };
      }
    } catch (idErr) {
      if (!accessToken && tokenToUse === idToken) {
        const error = new Error('Invalid or expired Google ID token');
        error.statusCode = 401;
        throw error;
      }
    }
  }

  // 2. Verify as OAuth2 Access Token against Google userinfo endpoint
  const accessTok = accessToken || tokenToUse;
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessTok}` },
    });
    if (!response.ok) {
      const err = new Error('Failed to verify Google access token');
      err.statusCode = 401;
      throw err;
    }
    const profile = await response.json();
    if (!profile.email) {
      const err = new Error('Google account profile does not contain an email address');
      err.statusCode = 400;
      throw err;
    }
    return {
      email: profile.email.toLowerCase().trim(),
      name: profile.name || '',
      avatar: profile.picture || '/images/avatar/default-user.jpg',
      googleId: profile.sub || '',
    };
  } catch (err) {
    if (err.statusCode) throw err;
    const error = new Error('Google token verification failed. Please try again.');
    error.statusCode = 401;
    throw error;
  }
};

/**
 * Google Auth - Verifies Google token, checks if user exists or returns new user metadata for completion
 */
const googleAuth = async ({ token, accessToken, idToken, email, name, avatar, googleId }) => {
  let verified = null;
  if (token || accessToken || idToken) {
    verified = await verifyGoogleToken({ token, accessToken, idToken });
  } else {
    const error = new Error('Google identity token is required for authentication');
    error.statusCode = 401;
    throw error;
  }

  const cleanEmail = verified.email;
  const existingUser = await User.findOne({ email: cleanEmail }).populate('referredBy', 'name email phone referralCode');

  if (existingUser) {
    if (!existingUser.isActive) {
      const error = new Error('Your account has been deactivated. Please contact platform support / Super Admin.');
      error.statusCode = 403;
      throw error;
    }

    if (verified.avatar && (!existingUser.profile?.avatar || existingUser.profile?.avatar === '/images/avatar/default-user.jpg')) {
      if (!existingUser.profile) existingUser.profile = {};
      existingUser.profile.avatar = verified.avatar;
      await existingUser.save();
    }

    const appToken = existingUser.getSignedJwtToken();
    return {
      isNewUser: false,
      user: existingUser,
      token: appToken,
    };
  }

  // Generate signed temporary registration token so profile completion cannot be spoofed
  const googleAuthToken = jwt.sign(
    {
      email: cleanEmail,
      name: verified.name || name || '',
      avatar: verified.avatar || avatar || '/images/avatar/default-user.jpg',
      googleId: verified.googleId || googleId || '',
      isGoogleVerified: true,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  return {
    isNewUser: true,
    email: cleanEmail,
    name: verified.name || name || '',
    avatar: verified.avatar || avatar || '/images/avatar/default-user.jpg',
    googleId: verified.googleId || googleId || '',
    googleAuthToken,
  };
};

/**
 * Google Register - Registers new Mediator or Seller with required role-specific fields
 */
const googleRegister = async ({ name, email, role, phone, agencyName, referralCode, avatar, googleId, googleAuthToken, token, accessToken, idToken }) => {
  if (!role || !name) {
    const error = new Error('Name and role are required for registration');
    error.statusCode = 400;
    throw error;
  }

  let verifiedEmail = null;
  let verifiedGoogleId = googleId;

  if (googleAuthToken) {
    try {
      const decoded = jwt.verify(googleAuthToken, process.env.JWT_SECRET);
      if (decoded && decoded.isGoogleVerified && decoded.email) {
        verifiedEmail = decoded.email.toLowerCase().trim();
        verifiedGoogleId = decoded.googleId || verifiedGoogleId;
      }
    } catch (err) {
      const error = new Error('Google registration session has expired. Please sign in with Google again.');
      error.statusCode = 401;
      throw error;
    }
  } else if (token || accessToken || idToken) {
    const verified = await verifyGoogleToken({ token, accessToken, idToken });
    verifiedEmail = verified.email;
    verifiedGoogleId = verified.googleId;
  } else {
    const error = new Error('Cryptographic verification token missing. Please sign in with Google again.');
    error.statusCode = 401;
    throw error;
  }

  const cleanEmail = verifiedEmail;
  const existingUser = await User.findOne({ email: cleanEmail }).populate('referredBy', 'name email phone referralCode');
  
  if (existingUser) {
    const appToken = existingUser.getSignedJwtToken();
    return {
      user: existingUser,
      token: appToken,
    };
  }

  const crypto = require('crypto');
  const randomPassword = crypto.randomBytes(16).toString('hex') + 'A1!';
  const selectedRole = role === ROLES.MEDIATOR ? ROLES.MEDIATOR : ROLES.SELLER;

  if (selectedRole === ROLES.MEDIATOR) {
    const mediatorReferralCode = await generateUniqueReferralCode(User, 'MED');
    const mediator = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: randomPassword,
      role: ROLES.MEDIATOR,
      phone: phone ? phone.trim() : '',
      referralCode: mediatorReferralCode,
      profile: {
        agencyName: agencyName ? agencyName.trim() : '',
        avatar: avatar || '/images/avatar/default-user.jpg',
        city: 'Tamil Nadu',
        state: 'Tamil Nadu',
      },
      isActive: true,
    });

    const token = mediator.getSignedJwtToken();
    return {
      user: mediator,
      token,
      referralCode: mediatorReferralCode,
    };
  } else {
    let referredBy = null;
    let mediatorInfo = null;

    if (referralCode && referralCode.trim() !== '') {
      const validation = await validateReferralCode(referralCode);
      if (!validation.isValid) {
        const error = new Error(validation.message);
        error.statusCode = 400;
        throw error;
      }
      referredBy = validation.mediator._id;
      mediatorInfo = {
        id: validation.mediator._id,
        name: validation.mediator.name,
        email: validation.mediator.email,
        referralCode: validation.mediator.referralCode,
      };
    }

    const seller = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: randomPassword,
      role: ROLES.SELLER,
      phone: phone ? phone.trim() : '',
      referredBy,
      profile: {
        avatar: avatar || '/images/avatar/default-user.jpg',
        city: 'Tamil Nadu',
        state: 'Tamil Nadu',
      },
      isActive: true,
    });

    const token = seller.getSignedJwtToken();
    return {
      user: seller,
      token,
      mediatorInfo,
    };
  }
};

module.exports = {
  registerMediator,
  registerSeller,
  loginUser,
  googleAuth,
  googleRegister,
};

