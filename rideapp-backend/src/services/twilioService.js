const twilio = require('twilio');
const logger = require('../utils/logger');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM = process.env.TWILIO_PHONE_NUMBER;

/**
 * Generate a 6-digit OTP.
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP via SMS.
 */
async function sendOTP(phone, otp) {
  if (process.env.NODE_ENV !== 'production') {
    // In dev, just log — don't actually send
    logger.info(`[DEV] SMS OTP for ${phone}: ${otp}`);
    return { success: true, dev: true };
  }

  try {
    await client.messages.create({
      body: `Your GoRide verification code is: ${otp}. Valid for 10 minutes.`,
      from: FROM,
      to: phone,
    });
    logger.info(`OTP sent to ${phone}`);
    return { success: true };
  } catch (err) {
    logger.error('Twilio error:', err.message);
    throw new Error('Failed to send SMS. Check phone number format (+1XXXXXXXXXX).');
  }
}

/**
 * Send a notification SMS (ride accepted, etc.)
 */
async function sendSMS(phone, message) {
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[DEV] SMS to ${phone}: ${message}`);
    return { success: true };
  }

  try {
    await client.messages.create({ body: message, from: FROM, to: phone });
    return { success: true };
  } catch (err) {
    logger.error('Twilio SMS error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { generateOTP, sendOTP, sendSMS };
