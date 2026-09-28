const jwt = require('jsonwebtoken');
const { User } = require('../models/User');
const { sendError } = require('../utils/apiResponse');

/**
 * Protect routes: verify JWT Bearer token and populate req.user
 */
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return sendError(res, 'Not authorized to access this route. No token provided.', 401);
  }

  if (!process.env.JWT_SECRET) {
    return sendError(res, 'Server configuration error: JWT_SECRET missing.', 500);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user and check active status
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return sendError(res, 'User account no longer exists.', 401);
    }

    if (!user.isActive) {
      return sendError(
        res,
        'Your account has been deactivated. Please contact Super Admin.',
        403
      );
    }

    // Auto-activate queued subscription if existing subscription has expired
    if (user.queuedSubscription && user.queuedSubscription.status === 'queued') {
      const now = new Date();
      const currentExpired = !user.subscription?.endDate || new Date(user.subscription.endDate) <= now;
      if (currentExpired || (user.queuedSubscription.startDate && now >= new Date(user.queuedSubscription.startDate))) {
        // Save expired active sub to history if exists
        if (user.subscription && user.subscription.planId) {
          if (!user.subscriptionHistory) user.subscriptionHistory = [];
          user.subscriptionHistory.push({
            planId: user.subscription.planId,
            planName: user.subscription.planName,
            billingCycle: user.subscription.billingCycle,
            amountPaid: user.subscription.amountPaid,
            startDate: user.subscription.startDate,
            endDate: user.subscription.endDate,
            transactionId: user.subscription.transactionId,
            paymentStatus: 'completed',
          });
        }

        user.subscription = {
          planId: user.queuedSubscription.planId,
          planName: user.queuedSubscription.planName,
          billingCycle: user.queuedSubscription.billingCycle,
          status: 'active',
          startDate: user.queuedSubscription.startDate || now,
          endDate: user.queuedSubscription.endDate,
          amountPaid: user.queuedSubscription.amountPaid,
          transactionId: user.queuedSubscription.transactionId,
          paymentReceipt: 'CASHFREE_ONLINE_PAYMENT',
          submittedAt: now,
          notes: `Auto-activated from queued plan on ${now.toLocaleString('en-IN')}`,
        };

        user.queuedSubscription = {
          planId: null,
          planName: null,
          billingCycle: 'monthly',
          status: 'inactive',
          startDate: null,
          endDate: null,
          amountPaid: 0,
          transactionId: '',
          notes: '',
        };

        try {
          await user.save();
        } catch (saveErr) {
          console.warn('Could not auto-save queued subscription activation:', saveErr.message);
        }
      }
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 'Session expired. Please log in again.', 401);
    }
    return sendError(res, 'Invalid authentication token.', 401);
  }
};

module.exports = {
  protect,
};
