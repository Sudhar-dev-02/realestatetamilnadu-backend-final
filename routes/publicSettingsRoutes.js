const express = require('express');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Review = require('../models/Review');
const Client = require('../models/Client');
const Blog = require('../models/Blog');
const FAQ = require('../models/FAQ');
const ContactEntry = require('../models/ContactEntry');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const router = express.Router();

// GET /api/public/plans - Get active subscription plans
router.get('/plans', async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ order: 1 });
    return sendSuccess(res, 'Subscription plans retrieved', plans);
  } catch (err) {
    next(err);
  }
});

// GET /api/public/reviews - Get reviews / testimonials
router.get('/reviews', async (req, res, next) => {
  try {
    const reviews = await Review.find().sort({ order: 1, createdAt: -1 });
    return sendSuccess(res, 'Reviews retrieved', reviews);
  } catch (err) {
    next(err);
  }
});

// GET /api/public/clients - Get partner/client logos
router.get('/clients', async (req, res, next) => {
  try {
    const clients = await Client.find({ isActive: true }).sort({ order: 1 });
    return sendSuccess(res, 'Clients retrieved', clients);
  } catch (err) {
    next(err);
  }
});

// GET /api/public/blogs - Get blogs
router.get('/blogs', async (req, res, next) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    return sendSuccess(res, 'Blogs retrieved', blogs);
  } catch (err) {
    next(err);
  }
});

// GET /api/public/faqs - Get FAQs
router.get('/faqs', async (req, res, next) => {
  try {
    const faqs = await FAQ.find({ isActive: true }).sort({ order: 1 });
    return sendSuccess(res, 'FAQs retrieved', faqs);
  } catch (err) {
    next(err);
  }
});

// POST /api/public/contact - Submit contact us message
router.post('/contact', async (req, res, next) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) {
      return sendError(res, 'Please provide name, email, and message', 400);
    }
    const entry = await ContactEntry.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : '',
      subject: subject ? subject.trim() : 'General Inquiry',
      message: message.trim(),
    });
    return sendSuccess(res, 'Thank you! Your message has been received.', entry, 201);
  } catch (err) {
    next(err);
  }
});

const PromotionSetting = require('../models/PromotionSetting');

// GET /api/public/promotion-settings & /api/public/promotions/settings - Get active promotion configuration
router.get(['/promotion-settings', '/promotions/settings'], async (req, res, next) => {
  try {
    let settings = await PromotionSetting.findOne();
    if (!settings) {
      settings = await PromotionSetting.create({});
    }
    return sendSuccess(res, 'Promotion settings retrieved', settings);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
