/**
 * SMS Gateway Integration for EaseRent
 * Uses SMS Gateway for Android (Cloud Server)
 * Docs: https://docs.sms-gate.app
 */

const SMS_GATEWAY_URL = process.env.SMS_GATEWAY_URL || 'https://api.sms-gate.app';
const SMS_GATEWAY_USERNAME = process.env.SMS_GATEWAY_USERNAME;
const SMS_GATEWAY_PASSWORD = process.env.SMS_GATEWAY_PASSWORD;
const SMS_GATEWAY_DEVICE_ID = process.env.SMS_GATEWAY_DEVICE_ID;

/**
 * Send an SMS message via SMS Gateway
 * @param {string} phoneNumber - Recipient phone number (E.164 format, e.g., +639123456789)
 * @param {string} message - Text message to send
 * @param {object} options - Optional settings
 * @returns {Promise<object>} - API response
 */
export async function sendSMS(phoneNumber, message, options = {}) {
  if (!SMS_GATEWAY_USERNAME || !SMS_GATEWAY_PASSWORD) {
    throw new Error('SMS Gateway credentials not configured');
  }

  const credentials = Buffer.from(`${SMS_GATEWAY_USERNAME}:${SMS_GATEWAY_PASSWORD}`).toString('base64');

  const payload = {
    textMessage: {
      text: message
    },
    phoneNumbers: Array.isArray(phoneNumber) ? phoneNumber : [phoneNumber],
    ttl: options.ttl || 3600, // Message expires after 1 hour by default
    withDeliveryReport: options.withDeliveryReport ?? true,
  };

  // Add device ID if configured and valid (max 21 characters)
  // You can find your device ID in the SMS Gateway app under Settings
  if (options.deviceId) {
    payload.deviceId = options.deviceId;
  }

  // Add priority if specified (100+ for urgent messages)
  if (options.priority !== undefined) {
    payload.priority = options.priority;
  }

  // Add SIM number if specified (1, 2, or 3)
  if (options.simNumber) {
    payload.simNumber = options.simNumber;
  }

  try {
    const response = await fetch(`${SMS_GATEWAY_URL}/3rdparty/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('SMS Gateway error:', data);
      throw new Error(data.message || `SMS sending failed with status ${response.status}`);
    }

    console.log('SMS sent successfully:', data);
    return data;
  } catch (error) {
    console.error('Failed to send SMS:', error);
    throw error;
  }
}

/**
 * Send OTP verification code
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} code - OTP code
 * @returns {Promise<object>}
 */
export async function sendOTP(phoneNumber, code) {
  const message = `Your EaseRent verification code is: ${code}. Valid for 10 minutes. Do not share this code.`;
  return sendSMS(phoneNumber, message, { priority: 100 }); // High priority for OTP
}

/**
 * Send booking confirmation SMS
 * @param {string} phoneNumber - Tenant's phone number
 * @param {object} booking - Booking details
 * @returns {Promise<object>}
 */
export async function sendBookingConfirmation(phoneNumber, booking) {
  const message = `EaseRent: Your booking for "${booking.propertyName}" on ${booking.date} has been confirmed. Reference: ${booking.id}`;
  return sendSMS(phoneNumber, message);
}

/**
 * Send payment reminder SMS
 * @param {string} phoneNumber - Tenant's phone number
 * @param {object} payment - Payment details
 * @returns {Promise<object>}
 */
export async function sendPaymentReminder(phoneNumber, payment) {
  const message = `EaseRent Reminder: Your payment of ₱${payment.amount} for ${payment.propertyName} is due on ${payment.dueDate}. Please pay on time to avoid penalties.`;
  return sendSMS(phoneNumber, message);
}

/**
 * Send maintenance update SMS
 * @param {string} phoneNumber - Tenant's phone number
 * @param {object} maintenance - Maintenance request details
 * @returns {Promise<object>}
 */
export async function sendMaintenanceUpdate(phoneNumber, maintenance) {
  const message = `EaseRent: Your maintenance request "${maintenance.title}" has been updated to: ${maintenance.status}. ${maintenance.note || ''}`.trim();
  return sendSMS(phoneNumber, message);
}

/**
 * Send application status SMS
 * @param {string} phoneNumber - Applicant's phone number
 * @param {object} application - Application details
 * @returns {Promise<object>}
 */
export async function sendApplicationStatus(phoneNumber, application) {
  const statusMessages = {
    approved: `Congratulations! Your application for "${application.propertyName}" has been APPROVED. The landlord will contact you soon.`,
    rejected: `We regret to inform you that your application for "${application.propertyName}" was not approved. Feel free to explore other properties on EaseRent.`,
    pending: `Your application for "${application.propertyName}" is being reviewed. We'll notify you once there's an update.`
  };
  
  const message = `EaseRent: ${statusMessages[application.status] || 'Your application status has been updated.'}`;
  return sendSMS(phoneNumber, message);
}

/**
 * Check SMS Gateway status/health
 * @returns {Promise<boolean>}
 */
export async function checkSMSGatewayHealth() {
  try {
    const credentials = Buffer.from(`${SMS_GATEWAY_USERNAME}:${SMS_GATEWAY_PASSWORD}`).toString('base64');
    
    const response = await fetch(`${SMS_GATEWAY_URL}/3rdparty/v1/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('SMS Gateway health check failed:', error);
    return false;
  }
}
