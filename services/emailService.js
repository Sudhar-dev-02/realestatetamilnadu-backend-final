const { Resend } = require('resend');

/**
 * Send Password Reset OTP Email using Resend.com
 * @param {string} email
 * @param {string} otp
 * @param {string} userName
 */
const sendPasswordResetOtpEmail = async (email, otp, userName = 'User') => {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM || 'Real Estate Tamil Nadu <onboarding@resend.dev>';

  console.log(`[PASSWORD RESET OTP] Dispatched verification code to ${email}`);

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 540px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
      <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 24px; text-align: center; color: #ffffff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">Real Estate Tamil Nadu</h2>
        <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.85;">Password Reset Verification Code</p>
      </div>
      <div style="padding: 30px 24px;">
        <p style="margin: 0 0 16px; font-size: 15px; color: #334155;">Hello <strong>${userName}</strong>,</p>
        <p style="margin: 0 0 20px; font-size: 14px; color: #64748b; line-height: 1.5;">
          We received a request to reset your password for your Real Estate Tamil Nadu account. Use the 6-digit One-Time Password (OTP) below to reset your password:
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <div style="display: inline-block; background-color: #f1f5f9; border: 2px dashed #2a5298; border-radius: 8px; padding: 14px 28px;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e3c72;">${otp}</span>
          </div>
          <p style="margin: 10px 0 0; font-size: 12px; color: #94a3b8;">This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
        </div>
        <p style="margin: 20px 0 0; font-size: 13px; color: #64748b; line-height: 1.5;">
          If you did not request a password reset, please ignore this email or contact platform support.
        </p>
      </div>
      <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        © ${new Date().getFullYear()} Real Estate Tamil Nadu. All rights reserved.
      </div>
    </div>
  `;

  if (apiKey) {
    try {
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: [email],
        subject: 'Password Reset OTP - Real Estate Tamil Nadu',
        html: htmlContent,
      });

      if (error) {
        console.error('[Resend Error]:', error);
        return false;
      }

      console.log(`[Resend Success] OTP email sent successfully to ${email}. ID: ${data?.id}`);
      return true;
    } catch (err) {
      console.error('[Resend Exception]:', err.message);
      return false;
    }
  } else {
    console.warn('[Resend] Warning: RESEND_API_KEY is not set in backend/.env. OTP logged to console.');
  }

  return true;
};

module.exports = {
  sendPasswordResetOtpEmail,
};
