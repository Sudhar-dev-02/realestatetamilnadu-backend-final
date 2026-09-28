const { ROLES } = require('../models/User');
const { sendError } = require('../utils/apiResponse');

/**
 * Grant access to specified roles only
 * @param  {...String} roles Permitted roles
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required before role authorization.', 401);
    }

    if (!roles.includes(req.user.role)) {
      return sendError(
        res,
        `Access denied. Role "${req.user.role}" is not permitted to access this resource.`,
        403
      );
    }

    next();
  };
};

module.exports = {
  authorizeRoles,
  ROLES,
};
