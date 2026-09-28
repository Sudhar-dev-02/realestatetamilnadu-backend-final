/**
 * Standardized API Response Helper Functions
 */

/**
 * Send a success response
 * @param {Object} res Express response object
 * @param {String} message Success message
 * @param {Object|Array} data Payload data
 * @param {Number} statusCode HTTP status code (default 200)
 */
const sendSuccess = (res, message = 'Success', data = null, statusCode = 200) => {
  const response = {
    success: true,
    message,
  };
  if (data !== null && data !== undefined) {
    response.data = data;
  }
  return res.status(statusCode).json(response);
};

/**
 * Send an error response
 * @param {Object} res Express response object
 * @param {String} message Error message
 * @param {Number} statusCode HTTP status code (default 400)
 * @param {Array|Object} errors Detailed validation or error breakdown
 */
const sendError = (res, message = 'An error occurred', statusCode = 400, errors = null) => {
  const response = {
    success: false,
    message,
  };
  if (errors !== null && errors !== undefined) {
    response.errors = errors;
  }
  return res.status(statusCode).json(response);
};

/**
 * Send paginated response
 * @param {Object} res Express response object
 * @param {String} message Success message
 * @param {Array} items List of items for current page
 * @param {Number} total Total count of records
 * @param {Number} page Current page number
 * @param {Number} limit Items per page
 */
const sendPaginated = (res, message = 'Success', items = [], total = 0, page = 1, limit = 10) => {
  const totalPages = Math.ceil(total / limit) || 1;
  return res.status(200).json({
    success: true,
    message,
    data: items,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
};

module.exports = {
  sendSuccess,
  sendError,
  sendPaginated,
};
