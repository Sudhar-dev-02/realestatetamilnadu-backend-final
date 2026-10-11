const express = require('express');
const mongoose = require('mongoose');
const { Property } = require('../models/Property');

const router = express.Router();

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Helper to resolve absolute public URL for images
 */
const resolveAbsoluteImageUrl = (imagePath, baseUrl) => {
  if (!imagePath) {
    return `${baseUrl}/images/logo/logo-dark.png`;
  }
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${baseUrl}${cleanPath}`;
};

/**
 * Handle Property Share Route for WhatsApp, Facebook, Twitter, and Social Crawlers
 * Supports lookup by MongoDB _id OR human-readable propertyId (e.g., RETN-PROP-343354)
 */
const handlePropertyShare = async (req, res) => {
  try {
    const rawId = (req.params.id || '').trim();
    if (!rawId) {
      return res.status(400).send('Invalid property identifier');
    }

    const queryConditions = [{ propertyId: rawId }];
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      queryConditions.push({ _id: rawId });
    }

    const property = await Property.findOne({
      $or: queryConditions,
    }).lean();

    const host = req.get('host');
    const forwardedProto = req.get('x-forwarded-proto');
    const isHttps = req.secure || forwardedProto === 'https' || process.env.NODE_ENV === 'production';
    const protocol = isHttps ? 'https' : req.protocol;
    
    // If request comes from Netlify proxy or custom domain, prefer that as canonical
    const forwardedHost = req.get('x-forwarded-host');
    const effectiveHost = forwardedHost || host;
    const baseUrl = process.env.PUBLIC_URL || `${protocol}://${effectiveHost}`;

    // Target frontend base URL for redirection
    const clientBaseUrl = (process.env.CLIENT_URL || (forwardedHost ? `${protocol}://${forwardedHost}` : 'https://realestatetamilnadu.netlify.app')).replace(/\/+$/, '');

    if (!property) {
      res.status(404).set('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Property Not Found | Real Estate Tamil Nadu</title>
            <meta property="og:title" content="Property Not Found | Real Estate Tamil Nadu" />
            <meta property="og:description" content="This property listing may have expired or is no longer available." />
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; text-align: center; padding: 20px; }
              .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 480px; width: 100%; }
              h1 { font-size: 24px; margin-bottom: 12px; color: #0f172a; }
              p { font-size: 15px; color: #64748b; margin-bottom: 24px; line-height: 1.5; }
              a { display: inline-block; background: #1563df; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Listing Not Found</h1>
              <p>The property listing you are looking for has either expired or been removed.</p>
              <a href="${clientBaseUrl}/#/properties">Browse Available Properties</a>
            </div>
          </body>
        </html>
      `);
    }

    const priceFormatted = property.priceFormatted || (property.price ? `₹${Number(property.price).toLocaleString('en-IN')}` : 'Price on Request');
    
    // Title format: 3 BHK Independent House | ₹65,00,000 | RETN
    const title = `${property.title || 'Property for Sale'} | ${priceFormatted} | Real Estate Tamil Nadu`;

    // Dynamic description highlighting key specs: Sq.ft, beds, baths, location
    const specsParts = [];
    if (property.beds) specsParts.push(`${property.beds} BHK`);
    if (property.sqft) specsParts.push(`${Number(property.sqft).toLocaleString('en-IN')} Sq.ft`);
    if (property.propertyType) specsParts.push(property.propertyType);
    if (property.city || property.address) specsParts.push(property.city || property.address);

    const description = specsParts.length > 0
      ? `${specsParts.join(' • ')} — ${property.description ? property.description.slice(0, 120) + '...' : 'Verified listing on Real Estate Tamil Nadu'}`
      : (property.description || 'Verified property listing on Real Estate Tamil Nadu. Click to view full photos and contact details.');

    // Primary image selection
    const primaryImageRaw = (property.images && property.images.length > 0)
      ? property.images[0]
      : '/images/banner/banner-property-5.jpg';

    const imageUrl = resolveAbsoluteImageUrl(primaryImageRaw, baseUrl);

    // Canonical link
    const identifier = property.propertyId || property._id;
    const canonicalShareUrl = `${baseUrl}/property/${encodeURIComponent(identifier)}`;

    // Client redirect target URL (directs to the React HashRouter SPA view)
    const clientRedirectUrl = `${clientBaseUrl}/#/property-details?id=${encodeURIComponent(property._id)}`;

    res.set('Content-Type', 'text/html; charset=utf-8');

    return res.send(`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />

    <!-- Open Graph / Facebook / WhatsApp Preview Tags -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Real Estate Tamil Nadu" />
    <meta property="og:url" content="${escapeHtml(canonicalShareUrl)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(property.title || 'Property Photo')}" />

    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@RealEstateTN" />
    <meta name="twitter:url" content="${escapeHtml(canonicalShareUrl)}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />

    <!-- Instant Redirect for Real Humans (Crawlers ignore JavaScript) -->
    <script>
      (function() {
        try {
          window.location.replace(${JSON.stringify(clientRedirectUrl)});
        } catch(e) {
          window.location.href = ${JSON.stringify(clientRedirectUrl)};
        }
      })();
    </script>
    <noscript>
      <meta http-equiv="refresh" content="0;url=${escapeHtml(clientRedirectUrl)}" />
    </noscript>

    <style>
      body {
        margin: 0;
        padding: 0;
        background: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        box-sizing: border-box;
      }
      .preview-container {
        max-width: 540px;
        width: 90%;
        background: #1e293b;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        border: 1px solid #334155;
        margin: 20px;
        text-align: left;
      }
      .preview-image {
        width: 100%;
        height: 280px;
        object-fit: cover;
        display: block;
        background: #0f172a;
      }
      .preview-body {
        padding: 24px;
      }
      .property-price {
        color: #38bdf8;
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .property-title {
        font-size: 18px;
        font-weight: 600;
        color: #ffffff;
        margin: 0 0 10px 0;
        line-height: 1.4;
      }
      .property-desc {
        font-size: 14px;
        color: #94a3b8;
        margin: 0 0 20px 0;
        line-height: 1.5;
      }
      .redirect-btn {
        display: inline-block;
        width: 100%;
        box-sizing: border-box;
        text-align: center;
        background: #1563df;
        color: #ffffff;
        padding: 14px 20px;
        border-radius: 10px;
        text-decoration: none;
        font-size: 16px;
        font-weight: 600;
        transition: background 0.2s ease;
      }
      .redirect-btn:hover {
        background: #0d4bb5;
      }
      .redirect-hint {
        text-align: center;
        font-size: 12px;
        color: #64748b;
        margin-top: 12px;
      }
    </style>
  </head>
  <body>
    <div class="preview-container">
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(property.title || 'Property')}" class="preview-image" />
      <div class="preview-body">
        <div class="property-price">${escapeHtml(priceFormatted)}</div>
        <h1 class="property-title">${escapeHtml(property.title)}</h1>
        <p class="property-desc">${escapeHtml(description)}</p>
        <a href="${escapeHtml(clientRedirectUrl)}" class="redirect-btn">View Full Property Details & Contact</a>
        <div class="redirect-hint">Redirecting you to Real Estate Tamil Nadu...</div>
      </div>
    </div>
  </body>
</html>
    `);
  } catch (error) {
    console.error('[Share Route Error]:', error);
    res.status(500).send('Unable to load property preview');
  }
};

// Mount routes for /property/:id and /p/:id
router.get('/property/:id', handlePropertyShare);
router.get('/p/:id', handlePropertyShare);

module.exports = router;
