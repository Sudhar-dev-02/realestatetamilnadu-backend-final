const https = require('https');
const { Property } = require('../models/Property');
const PromotionRequest = require('../models/PromotionRequest');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Cashfree Credentials & Config
// NOTE: Never hardcode live keys in source. Configure them in backend/.env
const CASHFREE_APP_ID = (process.env.CASHFREE_APP_ID || '').trim();
const CASHFREE_SECRET_KEY = (process.env.CASHFREE_SECRET_KEY || '').trim();

/**
 * The Cashfree credentials themselves identify their environment:
 *   TEST... app id  /  cfsk_ma_test_... secret  -> sandbox.cashfree.com
 *   cfsk_ma_prod_... secret                     -> api.cashfree.com
 * Sending sandbox credentials to the live host makes Cashfree reply
 *   HTTP 401 { "message": "authentication Failed", "type": "authentication_error" }
 * Therefore the credentials win over a mis-configured CASHFREE_ENV, and the
 * mismatch is logged once at boot instead of surfacing as a 500 on checkout.
 */
const resolveCashfreeEnv = () => {
  const configured = (process.env.CASHFREE_ENV || '').trim().toUpperCase();
  const isTestCredential = /^TEST/i.test(CASHFREE_APP_ID) || /_test_/i.test(CASHFREE_SECRET_KEY);
  const isLiveCredential = /_prod_/i.test(CASHFREE_SECRET_KEY);

  if (isTestCredential && !isLiveCredential) return 'SANDBOX';
  if (isLiveCredential && !isTestCredential) return 'PRODUCTION';

  return configured === 'SANDBOX' || configured === 'TEST' ? 'SANDBOX' : 'PRODUCTION';
};

const CASHFREE_ENV = resolveCashfreeEnv();

const CASHFREE_HOST = CASHFREE_ENV === 'PRODUCTION' ? 'api.cashfree.com' : 'sandbox.cashfree.com';

// Validate the configuration at boot instead of failing with a vague 500 at checkout time.
const CONFIGURED_CASHFREE_ENV = (process.env.CASHFREE_ENV || '').trim().toUpperCase().replace('TEST', 'SANDBOX');
if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
  console.warn(
    '[Cashfree] CASHFREE_APP_ID / CASHFREE_SECRET_KEY are missing in backend/.env - online payments will be rejected until they are configured.'
  );
} else if (CONFIGURED_CASHFREE_ENV && CONFIGURED_CASHFREE_ENV !== CASHFREE_ENV) {
  console.warn(
    `[Cashfree] CASHFREE_ENV="${process.env.CASHFREE_ENV}" does not match the supplied credentials. ` +
    `Using ${CASHFREE_ENV} (${CASHFREE_HOST}) to avoid "authentication Failed" errors.`
  );
}

class CashfreeConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CashfreeConfigError';
    this.statusCode = 503;
  }
}

/**
 * Throws when the gateway credentials are absent so callers can answer 503
 * with an actionable message rather than a generic internal error.
 */
const assertCashfreeConfigured = () => {
  if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
    throw new CashfreeConfigError(
      'Online payment gateway is not configured on the server. Please set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in backend/.env.'
    );
  }
};

/**
 * Converts a Cashfree error payload into an actionable Error for the client.
 */
const buildCashfreeError = (statusCode, parsed) => {
  const payload = parsed && typeof parsed === 'object' ? parsed : {};
  const message = payload.message || payload.code || `Cashfree API returned HTTP ${statusCode}`;
  const isAuthenticationFailure =
    statusCode === 401 ||
    statusCode === 403 ||
    payload.type === 'authentication_error' ||
    /authentication\s*failed/i.test(String(message));

  if (isAuthenticationFailure) {
    return new Error(
      `Cashfree authentication failed (HTTP ${statusCode}) on the ${CASHFREE_ENV} gateway. ` +
      `Make sure CASHFREE_APP_ID and CASHFREE_SECRET_KEY in backend/.env belong to the same Cashfree environment (${CASHFREE_HOST}) ` +
      `and that CASHFREE_ENV=${CASHFREE_ENV}.`
    );
  }

  return new Error(message);
};


/**
 * Helper to make HTTPS requests to Cashfree API
 */
const cashfreeApiRequest = (path, method = 'GET', postData = null) => {
  return new Promise((resolve, reject) => {
    try {
      assertCashfreeConfigured();
    } catch (configError) {
      return reject(configError);
    }

    const dataString = postData ? JSON.stringify(postData) : '';
    const options = {
      hostname: CASHFREE_HOST,
      port: 443,
      path: path,
      method: method,
      timeout: 10000, // 10 seconds timeout to prevent hanging connections
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
        'x-api-version': '2023-08-01',
      },
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(dataString);
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            console.error(`Cashfree API Error [${method} ${path}] HTTP ${res.statusCode}:`, parsed);
            reject(buildCashfreeError(res.statusCode, parsed));
          }
        } catch (e) {
          console.error('Cashfree Parse Error:', body);
          reject(new Error(`Failed to parse Cashfree response: ${e.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Cashfree payment gateway request timed out after 10 seconds'));
    });

    req.on('error', (err) => {
      console.error('Cashfree Request Error:', err);
      reject(err);
    });

    if (postData) {
      req.write(dataString);
    }
    req.end();
  });
};

/**
 * @desc    Create Cashfree Payment Order
 * @route   POST /api/payment/create-order
 * @access  Private
 */
const createCashfreeOrder = async (req, res, next) => {
  try {
    const { amount = 299, category = 'TOP_LISTING' } = req.body;
    const user = req.user;

    const orderId = `order_${category.toLowerCase()}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    // Ensure valid phone number for Cashfree
    let rawPhone = user.phone ? String(user.phone).replace(/\D/g, '') : '';
    if (rawPhone.length < 10) {
      rawPhone = '9999999999';
    } else if (rawPhone.length > 10) {
      rawPhone = rawPhone.slice(-10);
    }

    let clientUrl = process.env.CLIENT_URL || 'https://realestatetamilnadu.com';
    let returnUrl = req.body.returnUrl || `${clientUrl}/seller/dashboard?order_id={order_id}`;
    if (!returnUrl.includes('{order_id}')) {
      returnUrl += (returnUrl.includes('?') ? '&' : '?') + 'order_id={order_id}';
    }

    const payload = {
      order_id: orderId,
      order_amount: Number(amount) || 299,
      order_currency: 'INR',
      customer_details: {
        customer_id: user._id.toString(),
        customer_name: user.name || 'Real Estate Customer',
        customer_email: user.email || 'customer@realestatetamilnadu.com',
        customer_phone: rawPhone,
      },
      order_meta: {
        return_url: returnUrl,
      },
    };

    const cfResponse = await cashfreeApiRequest('/pg/orders', 'POST', payload);

    return sendSuccess(res, 'Cashfree payment order created successfully', {
      orderId: cfResponse.order_id,
      paymentSessionId: cfResponse.payment_session_id,
      orderAmount: cfResponse.order_amount,
      orderCurrency: cfResponse.order_currency,
      environment: CASHFREE_ENV,
    });
  } catch (error) {
    console.error('Error creating Cashfree order:', error.message);
    return sendError(res, error.message || 'Failed to initialize online payment', error.statusCode || 500);
  }
};

/**
 * @desc    Verify Cashfree Payment & Auto-Approve Promotion
 * @route   POST /api/payment/verify
 * @access  Private
 */
const verifyCashfreePayment = async (req, res, next) => {
  try {
    const {
      orderId,
      propertyId,
      topListingScope = 'district_wise',
      selectedDistrict = '',
      durationPlan = '1_week',
      amountPaid = 299,
      promotionCategory = 'TOP_LISTING',
      socialMediaPlanId = '',
      socialMediaPlanName = '',
      socialMediaServices = [],
    } = req.body;

    if (!orderId) {
      return sendError(res, 'Cashfree Order ID is required for verification', 400);
    }

    // Verify status directly with Cashfree server
    const orderDetails = await cashfreeApiRequest(`/pg/orders/${orderId}`, 'GET');

    if (orderDetails.order_status !== 'PAID') {
      const isSocialMedia =
        promotionCategory === 'SOCIAL_MEDIA' ||
        (orderId && orderId.toLowerCase().includes('social')) ||
        Boolean(socialMediaPlanId || socialMediaPlanName);

      const actualCategory = isSocialMedia ? 'SOCIAL_MEDIA' : 'TOP_LISTING';
      const actualType = isSocialMedia ? 'SOCIAL_MEDIA' : 'TOP_LIST_LANDING';
      
      let failDurationDays = 7;
      if (durationPlan === '1_month' || durationPlan === 'month') {
        failDurationDays = 30;
      }
      
      const existingFailed = await PromotionRequest.findOne({ transactionId: orderId });
      if (!existingFailed) {
        try {
          await PromotionRequest.create({
            mediator: req.user._id,
            promotionCategory: actualCategory,
            promotionType: actualType,
            topListingScope: actualCategory === 'TOP_LISTING' ? (topListingScope === 'overall' ? 'overall' : 'district_wise') : undefined,
            selectedDistrict: actualCategory === 'TOP_LISTING' ? (topListingScope === 'overall' ? '' : selectedDistrict) : undefined,
            durationPlan: durationPlan === '1_month' ? '1_month' : '1_week',
            durationDays: actualCategory === 'SOCIAL_MEDIA' ? 0 : failDurationDays,
            socialMediaPlanId: isSocialMedia ? socialMediaPlanId : undefined,
            socialMediaPlanName: isSocialMedia ? socialMediaPlanName : undefined,
            socialMediaServices: isSocialMedia ? socialMediaServices : [],
            property: propertyId || null,
            amountPaid: Number(orderDetails.order_amount) || Number(amountPaid) || 0,
            paymentReceipt: 'CASHFREE_ONLINE_PAYMENT_FAILED',
            transactionId: orderId,
            status: 'failed',
            startDate: null,
            endDate: null,
            adminNotes: `Payment Unsuccessful: ${orderDetails.order_status}. Property was NOT promoted.`,
          });
        } catch (err) {
          console.warn('Could not record failed promotion payment:', err.message);
        }
      }

      return sendError(res, `Payment is not completed. Status: ${orderDetails.order_status}`, 400);
    }

    // Determine duration in days
    let durationDays = 7;
    if (durationPlan === '1_month' || durationPlan === 'month') {
      durationDays = 30;
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Extract transaction ID from Cashfree payment details if available
    let txnId = orderId;
    try {
      const paymentsList = await cashfreeApiRequest(`/pg/orders/${orderId}/payments`, 'GET');
      if (Array.isArray(paymentsList) && paymentsList.length > 0) {
        const successPayment = paymentsList.find((p) => p.payment_status === 'SUCCESS') || paymentsList[0];
        if (successPayment && (successPayment.cf_payment_id || successPayment.payment_id)) {
          txnId = String(successPayment.cf_payment_id || successPayment.payment_id);
        }
      }
    } catch (err) {
      console.warn('Could not fetch payment details array, using orderId as txnId:', err.message);
    }

    // Check if a promotion request already exists for this transaction
    let existingRequest = await PromotionRequest.findOne({ transactionId: txnId });

    if (existingRequest) {
      return sendSuccess(res, 'Payment already verified and promotion activated!', existingRequest);
    }

    let targetProperty = null;
    if (propertyId) {
      targetProperty = await Property.findById(propertyId);
      if (!targetProperty) {
        return sendError(res, 'Property specified for promotion not found', 404);
      }

      // IDOR Protection: Verify that property belongs to authenticated user or assigned mediator
      const isOwner = targetProperty.seller && targetProperty.seller.toString() === req.user._id.toString();
      const isAssignedMediator = targetProperty.mediator && targetProperty.mediator.toString() === req.user._id.toString();
      const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

      if (!isOwner && !isAssignedMediator && !isSuperAdmin) {
        return sendError(res, 'Access denied: You are not authorized to promote a property that does not belong to your account', 403);
      }
    }

    const isSocialMedia =
      promotionCategory === 'SOCIAL_MEDIA' ||
      (orderId && orderId.toLowerCase().includes('social')) ||
      Boolean(socialMediaPlanId || socialMediaPlanName);

    const actualCategory = isSocialMedia ? 'SOCIAL_MEDIA' : 'TOP_LISTING';
    const actualType = isSocialMedia ? 'SOCIAL_MEDIA' : 'TOP_LIST_LANDING';

    // Auto-approve and create promotion record
    const promotionRequest = new PromotionRequest({
      mediator: req.user._id,
      promotionCategory: actualCategory,
      promotionType: actualType,
      topListingScope: actualCategory === 'TOP_LISTING' ? (topListingScope === 'overall' ? 'overall' : 'district_wise') : undefined,
      selectedDistrict: actualCategory === 'TOP_LISTING' ? (topListingScope === 'overall' ? '' : (selectedDistrict || (targetProperty ? targetProperty.city : '') || '')) : undefined,
      durationPlan: durationPlan === '1_month' ? '1_month' : '1_week',
      durationDays,
      socialMediaPlanId: isSocialMedia ? socialMediaPlanId : undefined,
      socialMediaPlanName: isSocialMedia ? socialMediaPlanName : undefined,
      socialMediaServices: isSocialMedia ? socialMediaServices : [],
      property: propertyId || null,
      amountPaid: Number(orderDetails.order_amount) || Number(amountPaid) || 299,
      paymentReceipt: 'CASHFREE_ONLINE_PAYMENT',
      transactionId: txnId,
      status: 'approved', // AUTO APPROVED ON ONLINE PAYMENT SUCCESS
      startDate,
      endDate,
      adminNotes: `Auto-approved via Cashfree Online Gateway (${actualCategory}) on ${startDate.toLocaleString('en-IN')}`,
    });

    await promotionRequest.save();

    // If Top Listing, immediately activate top listing on Property
    if (actualCategory === 'TOP_LISTING' && targetProperty) {
      targetProperty.featured = true;
      targetProperty.topListing = {
        isActive: true,
        scope: topListingScope === 'overall' ? 'overall' : 'district_wise',
        district: topListingScope === 'overall' ? '' : (selectedDistrict || targetProperty.city || ''),
        startDate,
        endDate,
      };
      await targetProperty.save();
    }

    const populatedRequest = await PromotionRequest.findById(promotionRequest._id)
      .populate('mediator', 'name email phone role')
      .populate('property');

    const successMessage = isSocialMedia
      ? 'Online payment verified successfully! Social Media Campaign application submitted & active.'
      : 'Online payment verified successfully! Property is now TOP LISTED.';

    return sendSuccess(res, successMessage, populatedRequest, 201);
  } catch (error) {
    console.error('Error verifying Cashfree payment:', error.message);
    return sendError(res, error.message || 'Failed to verify payment', error.statusCode || 500);
  }
};

/**
 * @desc    Create Cashfree Payment Order for Subscription Plans
 * @route   POST /api/payment/create-subscription-order
 * @access  Private
 */
const createSubscriptionOrder = async (req, res, next) => {
  try {
    const { amount = 99, planId = 'seller_premium_monthly', billingCycle = 'monthly' } = req.body;
    const user = req.user;

    const orderId = `sub_order_${(user.role || 'user').toLowerCase()}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    let rawPhone = user.phone ? String(user.phone).replace(/\D/g, '') : '';
    if (rawPhone.length < 10) {
      rawPhone = '9999999999';
    } else if (rawPhone.length > 10) {
      rawPhone = rawPhone.slice(-10);
    }

    let clientUrl = process.env.CLIENT_URL || 'https://realestatetamilnadu.com';
    let returnUrl = req.body.returnUrl;
    if (!returnUrl) {
      if (user.role === 'MEDIATOR') {
        returnUrl = `${clientUrl}/mediator/subscription-plans?order_id={order_id}`;
      } else {
        returnUrl = `${clientUrl}/seller/dashboard?order_id={order_id}`;
      }
    }
    if (!returnUrl.includes('{order_id}')) {
      returnUrl += (returnUrl.includes('?') ? '&' : '?') + 'order_id={order_id}';
    }

    const payload = {
      order_id: orderId,
      order_amount: Number(amount) || 99,
      order_currency: 'INR',
      customer_details: {
        customer_id: user._id.toString(),
        customer_name: user.name || 'Real Estate Member',
        customer_email: user.email || 'member@realestatetamilnadu.com',
        customer_phone: rawPhone,
      },
      order_meta: {
        return_url: returnUrl,
      },
    };

    const cfResponse = await cashfreeApiRequest('/pg/orders', 'POST', payload);

    return sendSuccess(res, 'Cashfree subscription payment order created successfully', {
      orderId: cfResponse.order_id,
      paymentSessionId: cfResponse.payment_session_id,
      orderAmount: cfResponse.order_amount,
      orderCurrency: cfResponse.order_currency,
      environment: CASHFREE_ENV,
    });
  } catch (error) {
    console.error('Error creating Cashfree subscription order:', error.message);
    return sendError(res, error.message || 'Failed to initialize online subscription payment', error.statusCode || 500);
  }
};

/**
 * @desc    Verify Cashfree Payment & Auto-Activate Subscription
 * @route   POST /api/payment/verify-subscription
 * @access  Private
 */
const verifySubscriptionPayment = async (req, res, next) => {
  try {
    const {
      orderId,
      planId = 'seller_premium_monthly',
      planName,
      billingCycle = 'monthly',
      durationMonths = 1,
      amountPaid = 99,
    } = req.body;

    if (!orderId) {
      return sendError(res, 'Cashfree Order ID is required for subscription verification', 400);
    }

    const { User } = require('../models/User');
    const user = await User.findById(req.user._id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    // Verify status directly with Cashfree server
    const orderDetails = await cashfreeApiRequest(`/pg/orders/${orderId}`, 'GET');

    if (orderDetails.order_status !== 'PAID') {
      const SubscriptionTransaction = require('../models/SubscriptionTransaction');
      const isAnnual = billingCycle === 'annual' || billingCycle === 'yearly' || Number(durationMonths) === 12;
      let finalPlanName = planName;
      if (!finalPlanName && planId) {
        try {
          const SubscriptionPlan = require('../models/SubscriptionPlan');
          const dbPlan = await SubscriptionPlan.findById(planId);
          if (dbPlan) finalPlanName = isAnnual ? `${dbPlan.name} (1 Year)` : dbPlan.name;
        } catch (e) {}
      }
      if (!finalPlanName) {
        if (planId === 'starter' || (typeof planId === 'string' && planId.toLowerCase().includes('starter'))) {
          finalPlanName = isAnnual ? 'Starter Plan (1 Year)' : 'Starter Plan';
        } else if (planId === 'growth' || (typeof planId === 'string' && planId.toLowerCase().includes('growth'))) {
          finalPlanName = isAnnual ? 'Growth Plan (1 Year)' : 'Growth Plan';
        } else if (planId === 'pro' || (typeof planId === 'string' && planId.toLowerCase().includes('pro'))) {
          finalPlanName = isAnnual ? 'Pro Plan (1 Year)' : 'Pro Plan';
        } else if (user.role === 'SELLER') {
          finalPlanName = isAnnual ? 'Seller Direct Lead Pass (1 Year)' : 'Seller Direct Lead Pass (1 Month)';
        } else {
          finalPlanName = isAnnual ? 'Growth Plan (1 Year)' : 'Growth Plan';
        }
      }

      const existingTxn = await SubscriptionTransaction.findOne({ transactionId: orderId });
      if (!existingTxn) {
        try {
          await SubscriptionTransaction.create({
            user: user._id,
            userName: user.name || 'Member',
            userRole: user.role || 'USER',
            userEmail: user.email || '',
            planName: finalPlanName,
            billingCycle: billingCycle || 'monthly',
            amountPaid: Number(orderDetails.order_amount) || Number(amountPaid) || 0,
            currency: 'INR',
            transactionStatus: 'failed',
            paymentMethod: 'Cashfree Online Gateway',
            transactionId: orderId,
            purchaseDate: new Date(),
            notes: `Payment Failed/Cancelled: ${orderDetails.order_status}`,
          });
        } catch (err) {
          console.warn('Non-critical failed subscription log error:', err.message);
        }
      }

      const statusNote = orderDetails.order_status === 'ACTIVE'
        ? 'Payment was cancelled or pending'
        : `Payment status: ${orderDetails.order_status}`;
      return sendError(res, `Payment could not be completed (${statusNote}). Please try again.`, 400);
    }

    const isAnnual = billingCycle === 'annual' || billingCycle === 'yearly' || Number(durationMonths) === 12;
    const durationDays = isAnnual ? 365 : 30;

    let txnId = orderId;
    try {
      const paymentsList = await cashfreeApiRequest(`/pg/orders/${orderId}/payments`, 'GET');
      if (Array.isArray(paymentsList) && paymentsList.length > 0) {
        const successPayment = paymentsList.find((p) => p.payment_status === 'SUCCESS') || paymentsList[0];
        if (successPayment && (successPayment.cf_payment_id || successPayment.payment_id)) {
          txnId = String(successPayment.cf_payment_id || successPayment.payment_id);
        }
      }
    } catch (err) {
      console.warn('Could not fetch Cashfree payment details, using orderId as txnId:', err.message);
    }

    let finalPlanName = planName;
    if (!finalPlanName && planId) {
      try {
        const SubscriptionPlan = require('../models/SubscriptionPlan');
        const dbPlan = await SubscriptionPlan.findById(planId);
        if (dbPlan) finalPlanName = isAnnual ? `${dbPlan.name} (1 Year)` : dbPlan.name;
      } catch (e) {}
    }
    if (!finalPlanName) {
      if (planId === 'starter' || (typeof planId === 'string' && planId.toLowerCase().includes('starter'))) {
        finalPlanName = isAnnual ? 'Starter Plan (1 Year)' : 'Starter Plan';
      } else if (planId === 'growth' || (typeof planId === 'string' && planId.toLowerCase().includes('growth'))) {
        finalPlanName = isAnnual ? 'Growth Plan (1 Year)' : 'Growth Plan';
      } else if (planId === 'pro' || (typeof planId === 'string' && planId.toLowerCase().includes('pro'))) {
        finalPlanName = isAnnual ? 'Pro Plan (1 Year)' : 'Pro Plan';
      } else if (user.role === 'SELLER') {
        finalPlanName = isAnnual ? 'Seller Direct Lead Pass (1 Year)' : 'Seller Direct Lead Pass (1 Month)';
      } else {
        finalPlanName = isAnnual ? 'Growth Plan (1 Year)' : 'Growth Plan';
      }
    }

    const finalAmount = Number(orderDetails.order_amount) || Number(amountPaid) || (isAnnual ? 49990 : 4999);
    const now = new Date();
    const isCurrentActive =
      user.subscription?.status === 'active' &&
      user.subscription?.endDate &&
      new Date(user.subscription.endDate) > now;

    let successMessage = '';

    if (isCurrentActive) {
      const currentEndDate = new Date(user.subscription.endDate);
      const isSamePlan = user.subscription?.planId === planId;
      const newEndDate = new Date(currentEndDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

      user.subscription = {
        planId: planId || user.subscription?.planId || 'enterprise_partner',
        planName: finalPlanName,
        billingCycle: isAnnual ? 'annual' : 'monthly',
        status: 'active',
        startDate: user.subscription.startDate || now,
        endDate: newEndDate,
        amountPaid: (user.subscription.amountPaid || 0) + finalAmount,
        transactionId: txnId,
        paymentReceipt: 'CASHFREE_ONLINE_PAYMENT',
        submittedAt: now,
        notes: `${isSamePlan ? 'Renewed' : 'Upgraded to ' + finalPlanName} & Extended seamlessly via Cashfree on ${now.toLocaleString('en-IN')}`,
      };
      user.queuedSubscription = undefined;

      successMessage = `🎉 Subscription ${isSamePlan ? 'extended' : 'upgraded to ' + finalPlanName} successfully! Your plan is active until ${newEndDate.toLocaleDateString('en-IN')}.`;
    } else {
      // Immediate activation
      const startDate = now;
      const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

      user.subscription = {
        planId: planId || (user.role === 'SELLER' ? (isAnnual ? 'seller_premium_annual' : 'seller_premium_monthly') : 'enterprise_partner'),
        planName: finalPlanName,
        billingCycle: isAnnual ? 'annual' : 'monthly',
        status: 'active',
        startDate,
        endDate,
        amountPaid: finalAmount,
        transactionId: txnId,
        paymentReceipt: 'CASHFREE_ONLINE_PAYMENT',
        submittedAt: now,
        notes: `Auto-approved via Cashfree Online Gateway on ${now.toLocaleString('en-IN')}`,
      };

      if (user.role === 'SELLER') {
        user.sellerPlan = 'premium';
      }

      successMessage = `🎉 Subscription activated successfully! Your ${finalPlanName} is now ACTIVE.`;
    }

    // Save to user subscription history audit
    if (!user.subscriptionHistory) user.subscriptionHistory = [];
    user.subscriptionHistory.push({
      planId: planId || 'pro_mediator',
      planName: finalPlanName,
      billingCycle: isAnnual ? 'annual' : 'monthly',
      amountPaid: finalAmount,
      startDate: isCurrentActive ? new Date(user.subscription.endDate) : now,
      endDate: isCurrentActive
        ? new Date(new Date(user.subscription.endDate).getTime() + durationDays * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000),
      transactionId: txnId,
      paymentStatus: 'completed',
    });

    await user.save();

    // Create Subscription Transaction audit record for Admin visibility
    const SubscriptionTransaction = require('../models/SubscriptionTransaction');
    try {
      await SubscriptionTransaction.create({
        user: user._id,
        userName: user.name,
        userRole: user.role,
        userEmail: user.email,
        planName: finalPlanName,
        billingCycle: isAnnual ? 'annual' : 'monthly',
        amountPaid: finalAmount,
        currency: 'INR',
        transactionStatus: 'success',
        paymentMethod: 'Cashfree Online Gateway',
        transactionId: txnId,
        purchaseDate: now,
        notes: isCurrentActive && user.subscription?.planId !== planId
          ? `Queued plan: Auto-activates on ${new Date(user.subscription.endDate).toLocaleDateString('en-IN')}`
          : 'Instant Auto-Activation via Cashfree',
      });
    } catch (txnErr) {
      console.warn('Non-critical audit log creation error:', txnErr.message);
    }

    return sendSuccess(res, successMessage, user, 200);
  } catch (error) {
    console.error('Error verifying Cashfree subscription payment:', error.message);
    return sendError(res, error.message || 'Failed to verify subscription payment', error.statusCode || 500);
  }
};

/**
 * @desc    Cashfree Webhook Handler
 * @route   POST /api/payment/webhook
 * @access  Public
 */
/**
 * @desc    Record Failed / Cancelled Payment Attempt (for Admin Info tracking)
 * @route   POST /api/payment/record-failed
 * @access  Private
 */
const recordFailedPayment = async (req, res, next) => {
  try {
    const {
      orderId,
      category = 'TOP_LISTING', // 'TOP_LISTING' | 'SOCIAL_MEDIA' | 'SUBSCRIPTION'
      propertyId,
      topListingScope = 'district_wise',
      selectedDistrict = '',
      durationPlan = '1_week',
      socialMediaPlanId = '',
      socialMediaPlanName = '',
      socialMediaServices = [],
      amountPaid = 0,
      reason = 'Payment was cancelled or failed by user',
      planId = '',
      planName = '',
      billingCycle = 'monthly',
    } = req.body;

    const user = req.user;
    const failureTxnId = orderId || `FAILED_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;

    if (category === 'SUBSCRIPTION') {
      const SubscriptionTransaction = require('../models/SubscriptionTransaction');
      try {
        await SubscriptionTransaction.create({
          user: user._id,
          userName: user.name || 'Member',
          userRole: user.role || 'USER',
          userEmail: user.email || '',
          planName: planName || (user.role === 'SELLER' ? 'Seller Direct Lead Pass' : 'Mediator Plan'),
          billingCycle: billingCycle || 'monthly',
          amountPaid: Number(amountPaid) || 0,
          currency: 'INR',
          transactionStatus: 'failed',
          paymentMethod: 'Cashfree Online Gateway',
          transactionId: failureTxnId,
          purchaseDate: new Date(),
          notes: `Payment Failed/Cancelled: ${reason}`,
        });
      } catch (err) {
        console.warn('Non-critical failed subscription log error:', err.message);
      }
    } else {
      // Determine duration days
      let durationDays = 7;
      if (durationPlan === '1_month' || durationPlan === 'month') {
        durationDays = 30;
      }

      const failedPromotion = new PromotionRequest({
        mediator: user._id,
        promotionCategory: category === 'SOCIAL_MEDIA' ? 'SOCIAL_MEDIA' : 'TOP_LISTING',
        promotionType: category === 'SOCIAL_MEDIA' ? 'SOCIAL_MEDIA' : 'TOP_LIST_LANDING',
        topListingScope: topListingScope === 'overall' ? 'overall' : 'district_wise',
        selectedDistrict: topListingScope === 'overall' ? '' : selectedDistrict,
        durationPlan: durationPlan === '1_month' ? '1_month' : '1_week',
        durationDays: category === 'SOCIAL_MEDIA' ? 0 : durationDays,
        socialMediaPlanId,
        socialMediaPlanName,
        socialMediaServices: Array.isArray(socialMediaServices) ? socialMediaServices : [],
        property: propertyId || null,
        amountPaid: Number(amountPaid) || 0,
        paymentReceipt: 'CASHFREE_ONLINE_PAYMENT_FAILED',
        transactionId: failureTxnId,
        status: 'failed',
        startDate: null,
        endDate: null,
        adminNotes: `Payment Unsuccessful: ${reason}. Property was NOT promoted to top listing.`,
      });

      await failedPromotion.save();
    }

    return sendSuccess(res, 'Failed payment information recorded for admin records', { recorded: true });
  } catch (error) {
    console.error('Error recording failed payment:', error.message);
    return sendError(res, error.message || 'Failed to record payment info', 500);
  }
};

/**
 * @desc    Cashfree Webhook Handler
 * @route   POST /api/payment/webhook
 * @access  Public
 */
const cashfreeWebhook = async (req, res, next) => {
  try {
    const event = req.body;
    console.log('Cashfree Webhook Received:', event ? event.type : 'Empty event');
    return res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('Cashfree Webhook Error:', error.message);
    return res.status(200).json({ status: 'ERROR', message: error.message });
  }
};

module.exports = {
  createCashfreeOrder,
  verifyCashfreePayment,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  recordFailedPayment,
  cashfreeWebhook,
  cashfreeApiRequest,
  CASHFREE_ENV,
};
