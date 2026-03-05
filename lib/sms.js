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
    ttl: options.ttl || 1200, // Message expires after 20 minutes (prevents stale pending SMS from being sent)
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
  const message = `Abalay: Your verification code is ${code}. Valid for 10 minutes. Do not share this code.`;
  return sendSMS(phoneNumber, message, { priority: 100 });
}

// ------------------------------------------------------------------
// NEW NOTIFICATIONS YOU REQUESTED
// ------------------------------------------------------------------

/**
 * 1. Send Booking Confirmation (When schedule is confirmed)
 */
export async function sendBookingConfirmation(phoneNumber, booking) {
  const message = `Abalay : Your viewing for "${booking.propertyName}" on ${booking.date} at ${booking.time} is CONFIRMED. Ref: ${booking.id}`;
  return sendSMS(phoneNumber, message);
}

/**
 * 2. Send Bill Notification (When landlord sends a payment bill)
 */
export async function sendBillNotification(phoneNumber, bill) {
  const message = `Abalay: You received a bill for ${bill.propertyName}. Amount: ₱${bill.amount}. Due: ${bill.dueDate}. Log in to pay.`;
  return sendSMS(phoneNumber, message);
}

/**
 * 3. Send Booking Reminder (12 hours before)
 */
export async function sendBookingReminder(phoneNumber, booking) {
  const message = `Abalay Reminder: Your viewing for "${booking.propertyName}" is in 12 hours (${booking.date} @ ${booking.time}). Please be on time.`;
  return sendSMS(phoneNumber, message);
}

/**
 * 4. Send Unread Message Alert (Unread for 6 hours)
 */
export async function sendUnreadMessageNotification(phoneNumber, unreadCount, senderName) {
  const message = `Abalay: You have ${unreadCount} unread message(s) from ${senderName} pending for 6+ hours. Log in to reply.`;
  return sendSMS(phoneNumber, message);
}

/**
 * 5. Send New Application Alert (For Landlord)
 */
export async function sendNewApplicationNotification(phoneNumber, application) {
  const message = `Abalay Alert: New application received from ${application.applicantName} for "${application.propertyName}". Log in to review.`;
  return sendSMS(phoneNumber, message);
}

/**
 * 6. Send New Booking Request Alert (For Landlord)
 */
export async function sendNewBookingNotification(phoneNumber, booking) {
  const message = `Abalay Alert: New viewing request from ${booking.tenantName} for "${booking.propertyName}" on ${booking.date} at ${booking.time}.`;
  return sendSMS(phoneNumber, message);
}

/**
 * 7. Send Move-In Welcome (For Tenant)
 */
export async function sendMoveInNotification(phoneNumber, moveIn) {
  const message = `Abalay: Welcome home! You've been assigned to "${moveIn.propertyName}". Contract: ${moveIn.startDate} to ${moveIn.endDate}. Rent: ₱${moveIn.rentAmount}. Log in for details.`;
  return sendSMS(phoneNumber, message);
}

/**
 * 8. Send Contract Nearing End (For Tenant)
 */
export async function sendContractNearingEnd(phoneNumber, contract) {
  const message = `Abalay Reminder: Your contract for "${contract.propertyName}" ends on ${contract.endDate} (${contract.daysRemaining} days left). Contact your landlord to renew or extend.`;
  return sendSMS(phoneNumber, message);
}

/**
 * 9. Send Contract Ended Notification (For Tenant)
 */
export async function sendEndContractNotification(phoneNumber, info) {
  const message = `Abalay: Your contract for "${info.propertyName}" has been ENDED. Reason: ${info.reason || 'Approved move-out'}. Please ensure all dues are cleared.`;
  return sendSMS(phoneNumber, message);
}

// ------------------------------------------------------------------
// EXISTING HELPERS
// ------------------------------------------------------------------

/**
 * Send payment reminder SMS
 */
export async function sendPaymentReminder(phoneNumber, payment) {
  const message = `Abalay Reminder: Payment of ₱${payment.amount} for ${payment.propertyName} is due on ${payment.dueDate}.`;
  return sendSMS(phoneNumber, message);
}

/**
 * Send maintenance update SMS
 */
export async function sendMaintenanceUpdate(phoneNumber, maintenance) {
  const message = `Abalay: Maintenance request "${maintenance.title}" updated to: ${maintenance.status}. ${maintenance.note || ''}`.trim();
  return sendSMS(phoneNumber, message);
}

/**
 * Send maintenance done notification
 */
export async function sendMaintenanceDoneNotification(phoneNumber, request) {
  const message = `Abalay Alert: Tenant ${request.tenantName} marked maintenance "${request.title}" as DONE. Please review and log the cost to officially complete it.`;
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

  const message = `Abalay: ${statusMessages[application.status] || 'Application status updated.'}`;
  return sendSMS(phoneNumber, message);
}

/**
 * Send Renewal Status SMS
 */
export async function sendRenewalStatus(phoneNumber, renewal) {
  let message = '';
  if (renewal.status === 'approved') {
    message = `Abalay: Renewal for "${renewal.propertyTitle}" APPROVED! New End: ${renewal.newEndDate}. Signing: ${renewal.signingDate}.`;
  } else {
    message = `Abalay: Renewal request for "${renewal.propertyTitle}" was REJECTED. Contact landlord for details.`;
  }
  return sendSMS(phoneNumber, message);
}

/**
 * 188. Send Renewal Request SMS (For Landlord)
 */
export async function sendRenewalRequest(phoneNumber, request) {
  const message = `Abalay: Renewal request for "${request.propertyTitle}" from ${request.tenantName}. Proposed date: ${request.proposedDate}. Pls check dashboard.`;
  return sendSMS(phoneNumber, message);
}

/**
 * Send Payment Received SMS (For Landlord)
 */
export async function sendPaymentReceivedNotification(phoneNumber, payment) {
  const method = payment.method === 'qr_code' ? 'QR Code' : (payment.method === 'stripe' ? 'Stripe' : (payment.method === 'paymongo' ? 'PayMongo' : 'Cash'));
  const message = `💰 ${method} Payment Received: ${payment.tenantName} paid ₱${payment.amount} for "${payment.propertyTitle}". Check dashboard for details.`;
  return sendSMS(phoneNumber, message);
}

/**
 * Send Payment Confirmed SMS (For Tenant)
 */
export async function sendPaymentConfirmedNotification(phoneNumber, { propertyTitle, amount, method }) {
  const methodLabel = method === 'qr_code' ? 'QR Code' : (method === 'stripe' ? 'Stripe' : (method === 'paymongo' ? 'PayMongo' : 'Cash'));
  const message = `✅ Payment Confirmed: Your payment of ₱${amount} for "${propertyTitle}" via ${methodLabel} has been confirmed. Thank you!`;
  return sendSMS(phoneNumber, message);
}

/**
 * Send Family Member Added SMS (For Landlord)
 */
export async function sendFamilyMemberAddedSMS(phoneNumber, { tenantName, memberName, propertyTitle }) {
  const message = `Abalay: ${tenantName} added a family member (${memberName}) to "${propertyTitle}". Family members can pay bills & submit maintenance. Check dashboard.`;
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

/**
 * Cleanup stale pending SMS messages (older than 20 minutes)
 * Fetches pending messages from gateway and returns info about stale ones.
 * The TTL setting (1200s) ensures the gateway auto-fails them,
 * but this function can be called to check/report status.
 * @returns {Promise<object>} - Cleanup result with counts
 */
export async function cleanupStalePendingMessages() {
  if (!SMS_GATEWAY_USERNAME || !SMS_GATEWAY_PASSWORD) {
    return { success: false, error: 'SMS Gateway credentials not configured' };
  }

  const credentials = Buffer.from(`${SMS_GATEWAY_USERNAME}:${SMS_GATEWAY_PASSWORD}`).toString('base64');
  const STALE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes in milliseconds

  try {
    // Fetch pending messages from the gateway
    const response = await fetch(`${SMS_GATEWAY_URL}/3rdparty/v1/messages?state=Pending&limit=100`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`
      }
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return { success: false, error: errData.message || `Gateway returned ${response.status}` };
    }

    const messages = await response.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return { success: true, totalPending: 0, staleCount: 0, message: 'No pending messages' };
    }

    const now = Date.now();
    let staleCount = 0;
    const staleMessages = [];

    for (const msg of messages) {
      // Check the message states history to find when it entered "Pending"
      const pendingSince = msg.states?.Pending || msg.states?.Created;
      if (pendingSince) {
        const pendingTime = new Date(pendingSince).getTime();
        const ageMs = now - pendingTime;

        if (ageMs > STALE_THRESHOLD_MS) {
          staleCount++;
          staleMessages.push({
            id: msg.id,
            ageMinutes: Math.round(ageMs / 60000),
            pendingSince: pendingSince,
            recipients: msg.recipients?.map(r => r.phoneNumber) || []
          });
          console.log(`[SMS Cleanup] Stale message ${msg.id} - pending for ${Math.round(ageMs / 60000)} minutes`);
        }
      }
    }

    console.log(`[SMS Cleanup] Found ${messages.length} pending, ${staleCount} stale (>20 min)`);

    return {
      success: true,
      totalPending: messages.length,
      staleCount,
      staleMessages,
      message: staleCount > 0
        ? `${staleCount} messages pending for over 20 minutes (TTL will auto-expire them)`
        : 'No stale pending messages'
    };

  } catch (error) {
    console.error('[SMS Cleanup] Failed:', error);
    return { success: false, error: error.message };
  }
}