const crypto = require('crypto');

/**
 * Generate a random alphanumeric code of specified length
 * @param {Number} length Code length
 * @param {String} prefix Optional prefix (default 'MED')
 * @returns {String} Referral code e.g. MED-8K3N7P
 */
const generateRandomCode = (length = 6, prefix = 'MED') => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars 0, O, 1, I
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return prefix ? `${prefix}-${result}` : result;
};

/**
 * Generate a guaranteed unique referral code for a Mediator
 * @param {Model} UserModel Mongoose User Model
 * @param {String} prefix Optional prefix
 * @returns {Promise<String>} Unique referral code
 */
const generateUniqueReferralCode = async (UserModel, prefix = 'MED') => {
  let isUnique = false;
  let code = '';
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    code = generateRandomCode(6, prefix);
    const existing = await UserModel.findOne({ referralCode: code });
    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    // Append timestamp suffix in the rare case of collision
    code = `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }

  return code;
};

module.exports = {
  generateRandomCode,
  generateUniqueReferralCode,
};
