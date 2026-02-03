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

  if (options.deviceId || SMS_GATEWAY_DEVICE_ID) {
    payload.deviceId = options.deviceId || SMS_GATEWAY_DEVICE_ID;
  }
  if (options.priority !== undefined) {
    payload.priority = options.priority;
  }
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
 */
export async function sendOTP(phoneNumber, code) {
  const message = `EaseRent: Your verification code is ${code}. Valid for 10 minutes. Do not share this code.`;
  return sendSMS(phoneNumber, message, { priority: 100 });
}

// ------------------------------------------------------------------
// NEW NOTIFICATIONS YOU REQUESTED
// ------------------------------------------------------------------

/**
 * 1. Send Booking Confirmation (When schedule is confirmed)
 */
export async function sendBookingConfirmation(phoneNumber, booking) {
  const message = `EaseRent: Your viewing for "${booking.propertyName}" on ${booking.date} at ${booking.time} is CONFIRMED. Ref: ${booking.id}`;
  return sendSMS(phoneNumber, message);
}

/**
 * 2. Send Bill Notification (When landlord sends a payment bill)
 */
export async function sendBillNotification(phoneNumber, bill) {
  const message = `EaseRent: You received a bill for ${bill.propertyName}. Amount: ₱${bill.amount}. Due: ${bill.dueDate}. Log in to pay.`;
  return sendSMS(phoneNumber, message);
}

/**
 * 3. Send Booking Reminder (12 hours before)
 */
export async function sendBookingReminder(phoneNumber, booking) {
  const message = `EaseRent Reminder: Your viewing for "${booking.propertyName}" is in 12 hours (${booking.date} @ ${booking.time}). Please be on time.`;
  return sendSMS(phoneNumber, message);
}

/**
 * 4. Send Unread Message Alert (Unread for 6 hours)
 */
export async function sendUnreadMessageNotification(phoneNumber, unreadCount, senderName) {
  const message = `EaseRent: You have ${unreadCount} unread message(s) from ${senderName} pending for 6+ hours. Log in to reply.`;
  return sendSMS(phoneNumber, message);
}

/**
 * 5. Send New Application Alert (For Landlord)
 */
export async function sendNewApplicationNotification(phoneNumber, application) {
  const message = `EaseRent Alert: New application received from ${application.applicantName} for "${application.propertyName}". Log in to review.`;
  return sendSMS(phoneNumber, message);
}

/**
 * 6. Send New Booking Request Alert (For Landlord)
 */
export async function sendNewBookingNotification(phoneNumber, booking) {
  const message = `EaseRent Alert: New viewing request from ${booking.tenantName} for "${booking.propertyName}" on ${booking.date} at ${booking.time}.`;
  return sendSMS(phoneNumber, message);
}

// ------------------------------------------------------------------
// EXISTING HELPERS
// ------------------------------------------------------------------

/**
 * Send payment reminder SMS
 */
export async function sendPaymentReminder(phoneNumber, payment) {
  const message = `EaseRent Reminder: Payment of ₱${payment.amount} for ${payment.propertyName} is due on ${payment.dueDate}.`;
  return sendSMS(phoneNumber, message);
}

/**
 * Send maintenance update SMS
 */
export async function sendMaintenanceUpdate(phoneNumber, maintenance) {
  const message = `EaseRent: Maintenance request "${maintenance.title}" updated to: ${maintenance.status}. ${maintenance.note || ''}`.trim();
  return sendSMS(phoneNumber, message);
}

/**
 * Send application status SMS
 */
export async function sendApplicationStatus(phoneNumber, application) {
  const statusMessages = {
    approved: `Congrats! Application for "${application.propertyName}" APPROVED. Landlord will contact you.`,
    rejected: `Update: Application for "${application.propertyName}" was not approved. Check app for details.`,
    pending: `Your application for "${application.propertyName}" is under review.`
  };

  const message = `EaseRent: ${statusMessages[application.status] || 'Application status updated.'}`;
  return sendSMS(phoneNumber, message);
}

/**
 * Check SMS Gateway status/health
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