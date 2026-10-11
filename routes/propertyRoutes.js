const express = require('express');
const {
  getPublicProperties,
  getPublicPropertyById,
  addPropertyReview,
  markPropertyInterested,
  unmarkPropertyInterested,
  submitPropertyEnquiry,
  submitPublicProperty,
  getSellerListingQuota,
  getPublicMediators,
  getPublicMediatorProfile,
  getPublicSellerProfile,
} = require('../controllers/propertyController');

const { uploadPropertyImages } = require('../middleware/uploadMiddleware');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const router = express.Router();

// Property image upload (multipart)
router.post('/upload-images', (req, res, next) => {
  uploadPropertyImages.array('images', 10)(req, res, (err) => {
    if (err) {
      return sendError(res, err.message || 'Image upload failed', err.statusCode || 400);
    }
    if (!req.files || req.files.length === 0) {
      return sendError(res, 'No image files provided for upload', 400);
    }
    const urls = req.files.map((file) => `/uploads/properties/${file.filename}`);
    return sendSuccess(res, 'Images uploaded successfully', { urls }, 201);
  });
});

// Public property routes
router.get('/', getPublicProperties);
router.get('/mediators-public', getPublicMediators);
router.get('/seller-listing-quota', getSellerListingQuota);
router.post('/submit-public', submitPublicProperty);
router.get('/mediator-public/:id', getPublicMediatorProfile);
router.get('/seller-public/:id', getPublicSellerProfile);
router.get('/:id', getPublicPropertyById);
router.post('/:id/reviews', addPropertyReview);
router.post('/:id/interest', markPropertyInterested);
router.delete('/:id/interest', unmarkPropertyInterested);
router.post('/:id/enquire', submitPropertyEnquiry);

module.exports = router;

