const { Property } = require('../models/Property');
const { User, ROLES } = require('../models/User');

/**
 * Verify if the requesting user has permission to access / mutate a specific property
 * - SUPER_ADMIN: Full access
 * - MEDIATOR: Can only access if the property's seller is referred by this mediator
 * - SELLER: Can only access their own property
 * @param {String} propertyId Property document ID
 * @param {Object} user Logged in user (from req.user)
 * @returns {Promise<Object>} Property document
 */
const verifyPropertyHierarchyAccess = async (propertyId, user) => {
  const property = await Property.findById(propertyId)
    .populate('seller', 'name email phone referredBy profile')
    .populate('mediator', 'name email phone referralCode');

  if (!property) {
    const error = new Error('Property listing not found');
    error.statusCode = 404;
    throw error;
  }

  // Super Admin has unrestricted access
  if (user.role === ROLES.SUPER_ADMIN) {
    return property;
  }

  // Seller can only access their own property
  if (user.role === ROLES.SELLER) {
    const sellerId = property.seller._id ? property.seller._id.toString() : property.seller.toString();
    if (sellerId !== user._id.toString()) {
      const error = new Error('Access denied. You can only manage your own property listings.');
      error.statusCode = 403;
      throw error;
    }
    return property;
  }

  // Mediator can only access if the seller belongs to them or if they listed it under their own account
  if (user.role === ROLES.MEDIATOR) {
    const mediatorId = property.mediator ? (property.mediator._id ? property.mediator._id.toString() : property.mediator.toString()) : null;
    const sellerId = property.seller ? (property.seller._id ? property.seller._id.toString() : property.seller.toString()) : null;
    const sellerReferredBy = property.seller && property.seller.referredBy ? property.seller.referredBy.toString() : null;

    if (
      mediatorId !== user._id.toString() &&
      sellerReferredBy !== user._id.toString() &&
      sellerId !== user._id.toString()
    ) {
      const error = new Error('Access denied. You can only manage listings of Sellers registered under your referral code.');
      error.statusCode = 403;
      throw error;
    }
    return property;
  }

  const error = new Error('Unauthorized action');
  error.statusCode = 403;
  throw error;
};

module.exports = {
  verifyPropertyHierarchyAccess,
};
