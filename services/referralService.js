const { User, ROLES } = require('../models/User');

/**
 * Validate a Mediator Referral Code
 * @param {String} code Referral code to validate
 * @returns {Promise<{isValid: boolean, mediator: Object|null, message: string}>}
 */
const validateReferralCode = async (code) => {
  if (!code || typeof code !== 'string') {
    return {
      isValid: false,
      mediator: null,
      message: 'Referral code is required for validation.',
    };
  }

  const cleanedCode = code.trim().toUpperCase();

  const mediator = await User.findOne({
    referralCode: cleanedCode,
    role: ROLES.MEDIATOR,
  }).select('_id name email phone referralCode isActive profile');

  if (!mediator) {
    return {
      isValid: false,
      mediator: null,
      message: `Invalid referral code "${cleanedCode}". No matching Mediator found.`,
    };
  }

  if (!mediator.isActive) {
    return {
      isValid: false,
      mediator: null,
      message: `The Mediator associated with code "${cleanedCode}" is currently inactive.`,
    };
  }

  return {
    isValid: true,
    mediator,
    message: `Valid referral code. Mediator: ${mediator.name}`,
  };
};

/**
 * Get all Sellers referred by a specific Mediator
 * @param {String} mediatorId Mediator User ID
 * @returns {Promise<Array>} List of sellers
 */
const getSellersByMediator = async (mediatorId) => {
  return await User.find({
    role: ROLES.SELLER,
    referredBy: mediatorId,
  })
    .select('-password')
    .sort({ createdAt: -1 });
};

/**
 * Get all unassigned Sellers (managed directly by SUPER_ADMIN)
 * @returns {Promise<Array>} List of unassigned sellers
 */
const getUnassignedSellers = async () => {
  return await User.find({
    role: ROLES.SELLER,
    $or: [{ referredBy: null }, { referredBy: { $exists: false } }],
  })
    .select('-password')
    .sort({ createdAt: -1 });
};

module.exports = {
  validateReferralCode,
  getSellersByMediator,
  getUnassignedSellers,
};
