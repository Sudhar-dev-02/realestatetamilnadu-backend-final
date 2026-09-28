const { sendError } = require('../utils/apiResponse');
const { ROLES } = require('../models/User');

/**
 * Middleware to enforce active non-expired subscription for Mediators.
 * If subscription has expired (endDate < Date.now()) or is not active, access is cut.
 */
const requireActiveSubscription = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 'Authentication required.', 401);
  }

  // Only enforce for MEDIATOR role (handle both constant and case-insensitive check)
  if (req.user.role === ROLES.MEDIATOR || req.user.role?.toUpperCase() === 'MEDIATOR') {
    const sub = req.user.subscription;
    const isExpired = sub?.endDate ? new Date(sub.endDate) < new Date() : false;
    const isActive = sub?.status === 'active' && !isExpired;

    if (!isActive) {
      return sendError(
        res,
        'Your mediator subscription has expired or is inactive. Access to property listings, seller details, buyer leads, and tools has been restricted. Please renew your plan to continue.',
        403
      );
    }
  }

  next();
};

module.exports = {
  requireActiveSubscription,
};
