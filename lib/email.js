// lib/email.js

/**
 * ---------------------------------------------------------
 * 1. ORIGINAL FANCY APPROVAL EMAIL
 * ---------------------------------------------------------
 */
export async function sendViewingApprovalEmail({
  to,
  tenantName,
  propertyTitle,
  propertyAddress,
  viewingDate,
  timeSlot,
  landlordName,
  landlordPhone
}) {
  if (!process.env.BREVO_API_KEY) {
    console.error('BREVO_API_KEY is not set!')
    return { success: false, error: 'BREVO_API_KEY environment variable not set' }
  }

  const formattedDate = new Date(viewingDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  // Your original HTML template
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Viewing Approved</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f3f4f6; -webkit-font-smoothing: antialiased;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; max-width: 600px; width: 100%; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
                <tr><td style="background-color: #000000; height: 6px;"></td></tr>
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <div style="display: inline-block; background-color: #ecfdf5; border-radius: 50%; padding: 12px; margin-bottom: 20px;">
                      <span style="font-size: 32px; display: block; line-height: 1;">✅</span>
                    </div>
                    <h1 style="margin: 0; color: #111827; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Viewing Approved!</h1>
                    <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 16px;">You are all set to view your potential new home.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 40px 40px 40px;">
                    <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">Hi <strong>${tenantName}</strong>,</p>
                    <p style="margin: 0 0 32px 0; color: #374151; font-size: 16px; line-height: 1.6;">Great news! The landlord has accepted your request.</p>
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
                      <tr>
                        <td style="padding: 24px;">
                          <p style="margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Property</p>
                          <p style="margin: 4px 0 0 0; font-size: 16px; color: #111827; font-weight: 600;">${propertyTitle}</p>
                          <p style="margin: 2px 0 0 0; font-size: 14px; color: #4b5563;">${propertyAddress}</p>
                        </td>
                      </tr>
                      <tr><td style="padding: 0 24px;"><div style="border-top: 1px dashed #d1d5db;"></div></td></tr>
                      <tr>
                        <td style="padding: 24px;">
                          <p style="margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">When</p>
                          <p style="margin: 4px 0 0 0; font-size: 16px; color: #111827; font-weight: 600;">${formattedDate}</p>
                          <p style="margin: 2px 0 0 0; font-size: 14px; color: #4b5563;">${timeSlot}</p>
                        </td>
                      </tr>
                       <tr><td style="padding: 0 24px;"><div style="border-top: 1px dashed #d1d5db;"></div></td></tr>
                      <tr>
                        <td style="padding: 24px;">
                          <p style="margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Landlord</p>
                          <p style="margin: 4px 0 0 0; font-size: 16px; color: #111827; font-weight: 600;">${landlordName}</p>
                          <p style="margin: 2px 0 0 0; font-size: 14px; color: #4b5563;">${landlordPhone}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `

  try {
    let brevo
    try {
      brevo = await import('@getbrevo/brevo')
    } catch (impErr) {
      console.error('Brevo SDK import failed:', impErr)
      return { success: false, error: 'Brevo SDK not available' }
    }

    const apiInstance = new brevo.TransactionalEmailsApi()
    apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY)

    const sendSmtpEmail = new brevo.SendSmtpEmail()
    sendSmtpEmail.sender = { name: '𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝', email: 'alfnzperez@gmail.com' }
    sendSmtpEmail.to = [{ email: to, name: tenantName }]
    sendSmtpEmail.subject = `✅ Viewing Approved - ${propertyTitle}`
    sendSmtpEmail.htmlContent = htmlContent

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail)
    console.log('✅ Approved Email sent to:', to)
    return { success: true, data }
  } catch (error) {
    console.error('❌ Email send failed:', error)
    return { success: false, error: error.message || String(error) }
  }
}

/**
 * ---------------------------------------------------------
 * 2. NEW NOTIFICATION TEMPLATES (Move Out, Maintenance, etc.)
 * ---------------------------------------------------------
 */

export async function sendMoveOutEmail({ to, landlordName, tenantName, propertyTitle, reason }) {
  const subject = `📢 Move Out Request: ${tenantName}`
  const htmlContent = `
    <div style="font-family: sans-serif; color: #333;">
      <h2>Move Out Request</h2>
      <p>Hi <strong>${landlordName}</strong>,</p>
      <p><strong>${tenantName}</strong> has requested to move out of <strong>${propertyTitle}</strong>.</p>
      <blockquote style="background: #f9f9f9; padding: 15px; border-left: 4px solid #000;">
        " ${reason} "
      </blockquote>
      <p>Please log in to your dashboard to contact the tenant.</p>
    </div>
  `
  return sendNotificationEmail({ to, subject, message: htmlContent })
}

export async function sendRenewalReminderEmail({ to, tenantName, propertyTitle, endDate, daysRemaining, landlordName }) {
  return sendNotificationEmail({
    to,
    subject: `⚠️ Contract Nearing End - ${propertyTitle}`,
    message: `
      <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #d97706; border-bottom: 2px solid #fbbf24; padding-bottom: 10px;">Contract Expiry Reminder</h2>
        <p>Dear ${tenantName},</p>
        <p>This is a reminder that your contract for <strong>${propertyTitle}</strong> is ending soon.</p>
        <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 5px 0;"><strong>Contract End Date:</strong> ${endDate}</p>
            <p style="margin: 5px 0;"><strong>Days Remaining:</strong> <span style="color: #d97706; font-weight: bold;">${daysRemaining} Days</span></p>
        </div>
        <p>If you wish to renew your contract or have any questions about the move-out process, please contact your landlord, ${landlordName}, as soon as possible.</p>
        <br>
        <p>Best regards,<br>TessyNTed Team</p>
      </div>
    `
  })
}

// ---------------------------------------------------------
// 10. RENEWAL STATUS EMAIL (Approved/Rejected)
// ---------------------------------------------------------
export async function sendRenewalStatusEmail({
  to,
  tenantName,
  propertyTitle,
  status, // 'approved' | 'rejected'
  newEndDate,
  signingDate,
  landlordName
}) {
  const isApproved = status === 'approved';
  const subject = isApproved
    ? `Contract Renewal Approved - ${propertyTitle}`
    : `Contract Renewal Update - ${propertyTitle}`;

  const content = isApproved ? `
    <h2 style="color: #10b981; border-bottom: 2px solid #34d399; padding-bottom: 10px;">Contract Renewal Approved!</h2>
    <p>Dear ${tenantName},</p>
    <p>Great news! Your contract renewal request for <strong>${propertyTitle}</strong> has been approved.</p>
    <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
        <p style="margin: 5px 0;"><strong>New Contract End Date:</strong> ${newEndDate}</p>
        <p style="margin: 5px 0;"><strong>Contract Signing Date:</strong> ${signingDate}</p>
    </div>
    <p>Please make sure to meet with your landlord for the contract signing on the scheduled date.</p>
  ` : `
    <h2 style="color: #ef4444; border-bottom: 2px solid #f87171; padding-bottom: 10px;">Renewal Request Update</h2>
    <p>Dear ${tenantName},</p>
    <p>Your contract renewal request for <strong>${propertyTitle}</strong> was not approved at this time.</p>
    <p>Please contact your landlord, ${landlordName}, for more details regarding this decision and to discuss the next steps.</p>
  `;

  await sendNotificationEmail({
    to,
    subject,
    message: `
      <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; color: #333;">
        ${content}
        <br>
        <p>Best regards,<br>TessyNTed Team</p>
      </div>
    `
  });
}


export async function sendRenewalRequestEmail({
  to,
  landlordName,
  tenantName,
  propertyTitle,
  proposedDate
}) {
  const subject = `🔄 Renewal Request: ${propertyTitle}`;

  const htmlContent = `
    <div style="font-family: sans-serif; color: #333;">
      <h2 style="color: #3b82f6;">Contract Renewal Request</h2>
      <p>Hi <strong>${landlordName}</strong>,</p>
      <p><strong>${tenantName}</strong> has requested to renew their contract for <strong>${propertyTitle}</strong>.</p>
      
      <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
        <p style="margin: 5px 0;"><strong>Proposed Signing Date:</strong> ${proposedDate}</p>
      </div>
      
      <p>Please log in to your dashboard to review and approve/reject this request.</p>
      
      <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/dashboard" 
         style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">
        Go to Dashboard
      </a>
    </div>
  `;

  return sendNotificationEmail({ to, subject, message: htmlContent });
}

export async function sendAssignmentEmail({ to, tenantName, propertyTitle, address, landlordName, phone }) {
  const subject = `🎉 You have been assigned to ${propertyTitle}!`
  const htmlContent = `
    <div style="font-family: sans-serif; color: #333;">
      <h1 style="color: #059669;">Application Accepted!</h1>
      <p>Hi <strong>${tenantName}</strong>,</p>
      <p>Congratulations! You have been officially assigned as the tenant for <strong>${propertyTitle}</strong>.</p>
      <p><strong>Address:</strong> ${address}</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <h3>Landlord Contact:</h3>
      <p>Name: ${landlordName}<br>Phone: ${phone}</p>
      <p>Please log in to view your lease details.</p>
    </div>
  `
  return sendNotificationEmail({ to, subject, message: htmlContent })
}

export async function sendMaintenanceEmail({ to, recipientName, title, propertyTitle, status, isUpdate }) {
  const subject = isUpdate
    ? `🔧 Update: ${title} is now ${status}`
    : `🛠️ New Maintenance Request: ${title}`

  const htmlContent = `
    <div style="font-family: sans-serif; color: #333;">
      <h2>${isUpdate ? 'Maintenance Update' : 'New Maintenance Request'}</h2>
      <p>Hi <strong>${recipientName}</strong>,</p>
      <p>
        ${isUpdate
      ? `The status of the request <strong>"${title}"</strong> for ${propertyTitle} has been updated to:`
      : `A new request has been submitted for <strong>${propertyTitle}</strong>:`}
      </p>
      <p style="font-size: 18px; font-weight: bold; color: ${status === 'completed' ? 'green' : 'orange'}; text-transform: uppercase;">
        ${status.replace('_', ' ')}
      </p>
    </div>
  `
  return sendNotificationEmail({ to, subject, message: htmlContent })
}

export async function sendBookingEmail({ to, recipientName, propertyTitle, date, status, isNew }) {
  const subject = isNew
    ? `📅 New Viewing Request: ${propertyTitle}`
    : `📅 Viewing Update: ${propertyTitle}`

  const htmlContent = `
    <div style="font-family: sans-serif; color: #333;">
      <h2>${isNew ? 'New Viewing Request' : 'Viewing Status Update'}</h2>
      <p>Hi <strong>${recipientName}</strong>,</p>
      <p>Regarding the property: <strong>${propertyTitle}</strong></p>
      <p><strong>Date:</strong> ${new Date(date).toLocaleString()}</p>
      <p><strong>Status:</strong> <span style="font-weight:bold; text-transform:uppercase;">${status}</span></p>
    </div>
  `
  return sendNotificationEmail({ to, subject, message: htmlContent })
}

/**
 * ---------------------------------------------------------
 * 3. HELPER FUNCTION (FIXED)
 * ---------------------------------------------------------
 */
export async function sendEndContractEmail({ to, tenantName, propertyTitle, endDate, customMessage }) {
  const formattedDate = new Date(endDate).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const subject = `Contract Ended: ${propertyTitle}`

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center">
              <div style="background-color: #ffffff; max-width: 600px; width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="background-color: #000000; height: 6px;"></div>
                <div style="padding: 40px;">
                  <h1 style="color: #ef4444; margin-top: 0; font-size: 24px;">Contract Ended</h1>
                  <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">Hi <strong>${tenantName}</strong>,</p>
                  
                  <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    Your contract for <strong>${propertyTitle}</strong> has been officially ended.
                  </p>
                  
                  <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #e5e7eb;">
                    <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: bold;">End Date</p>
                    <p style="margin: 5px 0 0; color: #111827; font-size: 18px; font-weight: 600;">${formattedDate}</p>
                  </div>

                  ${customMessage ? `
                    <blockquote style="background: #fff1f2; border-left: 4px solid #ef4444; margin: 0 0 24px 0; padding: 16px; color: #be123c; font-style: italic;">
                      "${customMessage}"
                    </blockquote>
                  ` : ''}
                  
                  <p style="font-size: 14px; color: #6b7280;">Please ensure all move-out procedures are completed. We wish you the best on your next journey!</p>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
  return sendNotificationEmail({ to, subject, message: htmlContent })
}

/**
 * ---------------------------------------------------------
 * 4. NEW PAYMENT BILL EMAIL (Separate bill types)
 * ---------------------------------------------------------
 */
export async function sendNewPaymentBillEmail({
  to,
  tenantName,
  propertyTitle,
  billType, // 'rent', 'water', 'electricity', 'wifi', 'other'
  amount,
  dueDate,
  description
}) {
  const billTypeLabels = {
    rent: '🏠 Rent',
    water: '💧 Water Bill',
    electricity: '⚡ Electricity Bill',
    wifi: '📶 Internet/WiFi Bill',
    other: '📋 Other Bill',
    'move-in': '🏠 Move-In Payment',
    renewal: '🔄 Contract Renewal Payment'
  }

  const label = billTypeLabels[billType] || '📋 Bill'
  const formattedDue = dueDate ? new Date(dueDate).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  }) : 'Not specified'

  const subject = `${label} Due: ${propertyTitle}`

  // Helper to determine bill category description
  let billCategory = 'utility'
  if (billType === 'rent') billCategory = 'rent'
  else if (billType === 'move-in') billCategory = 'move-in'
  else if (billType === 'renewal') billCategory = 'renewal'

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center">
              <div style="background-color: #ffffff; max-width: 600px; width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="background-color: #000000; height: 6px;"></div>
                <div style="padding: 40px;">
                  <h1 style="color: #111827; margin-top: 0; font-size: 24px;">${label}</h1>
                  <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">Hi <strong>${tenantName}</strong>,</p>
                  
                  <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    You have a new <strong>${billCategory}</strong> bill for <strong>${propertyTitle}</strong>.
                  </p>
                  
                  <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #e5e7eb;">
                    <table style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0;">
                          <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: bold;">Amount Due</p>
                          <p style="margin: 5px 0 0; color: #111827; font-size: 24px; font-weight: 700;">₱${amount.toLocaleString()}</p>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: bold;">Due Date</p>
                          <p style="margin: 5px 0 0; color: #ef4444; font-size: 16px; font-weight: 600;">${formattedDue}</p>
                        </td>
                      </tr>
                    </table>
                  </div>

                  ${description ? `
                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; margin: 0 0 24px 0; padding: 16px; color: #92400e;">
                      <strong>Note:</strong> ${description}
                    </div>
                  ` : ''}
                  
                  <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/payments" 
                     style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
                    View & Pay Bill
                  </a>
                  
                  <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
                    This is an automated notification from 𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝. Please do not reply to this email.
                  </p>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
  return sendNotificationEmail({ to, subject, message: htmlContent })
}

/**
 * ---------------------------------------------------------
 * 5. NEW BOOKING NOTIFICATION EMAIL (For Landlord)
 * ---------------------------------------------------------
 */
export async function sendNewBookingNotificationEmail({
  to,
  landlordName,
  tenantName,
  tenantPhone,
  propertyTitle,
  bookingDate,
  timeSlot
}) {
  const formattedDate = bookingDate ? new Date(bookingDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }) : 'Not specified'

  const subject = `📅 New Viewing Request: ${propertyTitle}`

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center">
              <div style="background-color: #ffffff; max-width: 600px; width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="background-color: #3b82f6; height: 6px;"></div>
                <div style="padding: 40px;">
                  <h1 style="color: #1e40af; margin-top: 0; font-size: 24px;">📅 New Viewing Request</h1>
                  <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">Hi <strong>${landlordName}</strong>,</p>
                  
                  <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    You have a new viewing request for <strong>${propertyTitle}</strong>.
                  </p>
                  
                  <div style="background-color: #eff6ff; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #bfdbfe;">
                    <table style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0;">
                          <p style="margin: 0; color: #1e40af; font-size: 12px; text-transform: uppercase; font-weight: bold;">Tenant</p>
                          <p style="margin: 5px 0 0; color: #111827; font-size: 16px; font-weight: 600;">${tenantName}</p>
                          ${tenantPhone ? `<p style="margin: 5px 0 0; color: #6b7280; font-size: 14px;">${tenantPhone}</p>` : ''}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <p style="margin: 0; color: #1e40af; font-size: 12px; text-transform: uppercase; font-weight: bold;">Requested Date</p>
                          <p style="margin: 5px 0 0; color: #111827; font-size: 16px; font-weight: 600;">${formattedDate}</p>
                          ${timeSlot ? `<p style="margin: 5px 0 0; color: #6b7280; font-size: 14px;">${timeSlot}</p>` : ''}
                        </td>
                      </tr>
                    </table>
                  </div>
                  
                  <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/bookings" 
                     style="display: inline-block; background-color: #1e40af; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
                    Review Booking Request
                  </a>
                  
                  <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
                    Please respond to this request promptly. This is an automated notification from 𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝.
                  </p>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
  return sendNotificationEmail({ to, subject, message: htmlContent })
}

/**
 * Sends a monthly statement with password-protected PDF attachment
 * @param {string} adminBcc - Optional admin email to receive a copy
 */
export async function sendMonthlyStatementEmail({ to, tenantName, period, pdfBuffer, adminBcc }) {
  const subject = `Payment statement for ${period.monthName}`
  const startDateStr = period.start.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  const endDateStr = period.end.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })

  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333;">
      <p>Hi <strong>${tenantName}</strong>,</p>
      
      <p>Here is your wallet statement from <strong>${startDateStr}</strong> to <strong>${endDateStr}</strong>.</p>
      
      <p>To view your statement, open the attached file and enter your <strong>birthday</strong> as the password.</p>
      <p>Format: MMDDYYYY (with leading zeros)</p>
      
      <p style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-size: 14px;">
        For example, if your birthday is <strong>March 16, 2005</strong>, your password is <strong>03162005</strong>.
      </p>

      <p>For inquiries and comments, please contact our Customer Support Hotline at (+632) 1111-1111 (Domestic toll-free: 1-800-1111-1111) or *1111 using your Smart mobile phone or access our built in messaging system on the 𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝 Website.</p>
      
      <p style="margin-top: 32px; font-weight: bold;">𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝 - Rental Management System</p>
    </div>
  `

  const attachment = [
    {
      name: `Statement_${period.monthName}_${period.year}.pdf`,
      content: pdfBuffer.toString('base64')
    }
  ]

  return sendNotificationEmail({ to, subject, message: htmlContent, attachment, bcc: adminBcc })
}

/**
 * ---------------------------------------------------------
 * 6. CASH PAYMENT NOTIFICATION EMAIL (For Landlord)
 * ---------------------------------------------------------
 */
export async function sendCashPaymentNotificationEmail({
  to,
  landlordName,
  tenantName,
  propertyTitle,
  amount,
  monthsCovered,
  paymentMethod
}) {
  const methodLabel = paymentMethod === 'qr_code' ? 'QR Code Payment' : 'Cash Payment';
  const subject = `💰 ${methodLabel} Received: ${propertyTitle}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center">
              <div style="background-color: #ffffff; max-width: 600px; width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="background-color: #10b981; height: 6px;"></div>
                <div style="padding: 40px;">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <span style="font-size: 48px;">💰</span>
                  </div>
                  <h1 style="color: #059669; margin-top: 0; font-size: 24px; text-align: center;">${methodLabel} Received!</h1>
                  <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">Hi <strong>${landlordName}</strong>,</p>
                  
                  <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    Your tenant <strong>${tenantName}</strong> has submitted a ${paymentMethod === 'qr_code' ? 'QR code' : 'cash'} payment for <strong>${propertyTitle}</strong>.
                  </p>
                  
                  <div style="background-color: #ecfdf5; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #a7f3d0;">
                    <table style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0;">
                          <p style="margin: 0; color: #059669; font-size: 12px; text-transform: uppercase; font-weight: bold;">Amount Paid</p>
                          <p style="margin: 5px 0 0; color: #111827; font-size: 28px; font-weight: 700;">₱${amount.toLocaleString()}</p>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <p style="margin: 0; color: #059669; font-size: 12px; text-transform: uppercase; font-weight: bold;">Coverage</p>
                          <p style="margin: 5px 0 0; color: #111827; font-size: 16px; font-weight: 600;">${monthsCovered} month${monthsCovered > 1 ? 's' : ''}</p>
                        </td>
                      </tr>
                    </table>
                  </div>
                  
                  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; margin: 0 0 24px 0; padding: 16px; color: #92400e;">
                    <strong>⚠️ Action Required:</strong> Please confirm the payment receipt in your dashboard.
                  </div>
                  
                  <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/payments" 
                     style="display: inline-block; background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
                    Confirm Payment
                  </a>
                  
                  <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
                    This is an automated notification from 𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝. Please do not reply to this email.
                  </p>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
  return sendNotificationEmail({ to, subject, message: htmlContent })
}

/**
 * ---------------------------------------------------------
 * 7. MONTHLY INCOME STATEMENT EMAIL (For Landlord)
 * ---------------------------------------------------------
 */
export async function sendLandlordMonthlyStatementEmail({
  to,
  landlordName,
  period,
  totalIncome,
  transactions,
  propertySummary,
  pdfBuffer,
  adminBcc
}) {
  const subject = `📊 Monthly Income Statement - ${period.monthName} ${period.year}`;
  const startDateStr = period.start.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  const endDateStr = period.end.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333;">
      <p>Hi <strong>${landlordName}</strong>,</p>
      
      <p>Here is your income statement from <strong>${startDateStr}</strong> to <strong>${endDateStr}</strong>.</p>
      
      <p>To view your statement, open the attached file and enter your <strong>birthday</strong> as the password.</p>
      <p>Format: MMDDYYYY (with leading zeros)</p>
      
      <p style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-size: 14px;">
        For example, if your birthday is <strong>March 16, 2005</strong>, your password is <strong>03162005</strong>.
      </p>

      <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
        <p style="margin: 0; color: rgba(255,255,255,0.8); font-size: 14px; text-transform: uppercase; font-weight: bold;">Total Income This Period</p>
        <p style="margin: 8px 0 0; color: #ffffff; font-size: 36px; font-weight: 800;">₱${totalIncome.toLocaleString()}</p>
      </div>

      <p>For inquiries and comments, please contact our Customer Support Hotline at (+632) 1111-1111 (Domestic toll-free: 1-800-1111-1111) or *1111 using your Smart mobile phone or access our built in messaging system on the 𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝 Website.</p>
      
      <p style="margin-top: 32px; font-weight: bold;">𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝 - Rental Management System</p>
    </div>
  `;

  // Only add attachment if pdfBuffer is provided
  let attachment = null;
  if (pdfBuffer) {
    attachment = [
      {
        name: `Income_Statement_${period.monthName}_${period.year}.pdf`,
        content: pdfBuffer.toString('base64')
      }
    ];
  }

  return sendNotificationEmail({ to, subject, message: htmlContent, attachment, bcc: adminBcc });
}

/**
 * ---------------------------------------------------------
 * 8. MOVE-IN WELCOME EMAIL (For Tenant)
 * ---------------------------------------------------------
 */
export async function sendMoveInEmail({
  to,
  tenantName,
  propertyTitle,
  propertyAddress,
  startDate,
  endDate,
  landlordName,
  landlordPhone,
  securityDeposit,
  rentAmount
}) {
  const formattedStart = new Date(startDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
  const formattedEnd = new Date(endDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  const subject = `🏡 Welcome Home! You're Moving In to ${propertyTitle}`

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center">
              <div style="background-color: #ffffff; max-width: 600px; width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); height: 6px;"></div>
                <div style="padding: 40px;">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <span style="font-size: 48px;">🏡</span>
                  </div>
                  <h1 style="color: #059669; margin-top: 0; font-size: 24px; text-align: center;">Welcome Home!</h1>
                  <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">Hi <strong>${tenantName}</strong>,</p>
                  
                  <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    Congratulations! You have been officially assigned as the tenant for <strong>${propertyTitle}</strong>. Welcome to your new home!
                  </p>
                  
                  <div style="background-color: #ecfdf5; border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid #a7f3d0;">
                    <table style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0;">
                          <p style="margin: 0; color: #059669; font-size: 12px; text-transform: uppercase; font-weight: bold;">Property</p>
                          <p style="margin: 5px 0 0; color: #111827; font-size: 16px; font-weight: 600;">${propertyTitle}</p>
                          ${propertyAddress ? `<p style="margin: 3px 0 0; color: #6b7280; font-size: 14px;">${propertyAddress}</p>` : ''}
                        </td>
                      </tr>
                      <tr><td style="padding: 0;"><div style="border-top: 1px dashed #a7f3d0; margin: 12px 0;"></div></td></tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <p style="margin: 0; color: #059669; font-size: 12px; text-transform: uppercase; font-weight: bold;">Contract Period</p>
                          <p style="margin: 5px 0 0; color: #111827; font-size: 16px; font-weight: 600;">${formattedStart}</p>
                          <p style="margin: 3px 0 0; color: #6b7280; font-size: 14px;">to ${formattedEnd}</p>
                        </td>
                      </tr>
                      <tr><td style="padding: 0;"><div style="border-top: 1px dashed #a7f3d0; margin: 12px 0;"></div></td></tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <table style="width: 100%;">
                            <tr>
                              <td>
                                <p style="margin: 0; color: #059669; font-size: 12px; text-transform: uppercase; font-weight: bold;">Monthly Rent</p>
                                <p style="margin: 5px 0 0; color: #111827; font-size: 20px; font-weight: 700;">₱${Number(rentAmount || 0).toLocaleString()}</p>
                              </td>
                              <td style="text-align: right;">
                                <p style="margin: 0; color: #059669; font-size: 12px; text-transform: uppercase; font-weight: bold;">Security Deposit</p>
                                <p style="margin: 5px 0 0; color: #111827; font-size: 20px; font-weight: 700;">₱${Number(securityDeposit || 0).toLocaleString()}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr><td style="padding: 0;"><div style="border-top: 1px dashed #a7f3d0; margin: 12px 0;"></div></td></tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <p style="margin: 0; color: #059669; font-size: 12px; text-transform: uppercase; font-weight: bold;">Landlord Contact</p>
                          <p style="margin: 5px 0 0; color: #111827; font-size: 16px; font-weight: 600;">${landlordName || 'Your Landlord'}</p>
                          ${landlordPhone ? `<p style="margin: 3px 0 0; color: #6b7280; font-size: 14px;">📞 ${landlordPhone}</p>` : ''}
                        </td>
                      </tr>
                    </table>
                  </div>
                  
                  <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/dashboard" 
                     style="display: inline-block; background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
                    Go to Dashboard
                  </a>
                  
                  <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
                    This is an automated notification from 𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝. Please do not reply to this email.
                  </p>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
  return sendNotificationEmail({ to, subject, message: htmlContent })
}

/**
 * ---------------------------------------------------------
 * 9. CONTRACT NEARING END EMAIL (40 Days Before Expiry)
 * ---------------------------------------------------------
 */
export async function sendContractNearingEndEmail({
  to,
  tenantName,
  propertyTitle,
  endDate,
  daysRemaining,
  landlordName
}) {
  const formattedEnd = new Date(endDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  const subject = `⏳ Contract Ending Soon: ${propertyTitle} (${daysRemaining} days left)`

  const urgencyColor = daysRemaining <= 14 ? '#ef4444' : daysRemaining <= 30 ? '#f59e0b' : '#3b82f6'
  const urgencyBg = daysRemaining <= 14 ? '#fef2f2' : daysRemaining <= 30 ? '#fffbeb' : '#eff6ff'
  const urgencyBorder = daysRemaining <= 14 ? '#fecaca' : daysRemaining <= 30 ? '#fde68a' : '#bfdbfe'

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center">
              <div style="background-color: #ffffff; max-width: 600px; width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="background-color: ${urgencyColor}; height: 6px;"></div>
                <div style="padding: 40px;">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <span style="font-size: 48px;">⏳</span>
                  </div>
                  <h1 style="color: ${urgencyColor}; margin-top: 0; font-size: 24px; text-align: center;">Contract Ending Soon</h1>
                  <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">Hi <strong>${tenantName}</strong>,</p>
                  
                  <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                    This is a friendly reminder that your rental contract for <strong>${propertyTitle}</strong> is nearing its end.
                  </p>
                  
                  <div style="background-color: ${urgencyBg}; border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid ${urgencyBorder}; text-align: center;">
                    <p style="margin: 0; color: ${urgencyColor}; font-size: 14px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Days Remaining</p>
                    <p style="margin: 8px 0 0; color: ${urgencyColor}; font-size: 48px; font-weight: 800; line-height: 1;">${daysRemaining}</p>
                    <p style="margin: 12px 0 0; color: #6b7280; font-size: 14px;">Contract ends on</p>
                    <p style="margin: 4px 0 0; color: #111827; font-size: 18px; font-weight: 600;">${formattedEnd}</p>
                  </div>
                  
                  <div style="background: #f0fdf4; border-left: 4px solid #10b981; margin: 0 0 24px 0; padding: 16px; color: #065f46;">
                    <strong>💡 What to do next:</strong><br>
                    If you wish to <strong>renew or extend</strong> your contract, please contact your landlord <strong>${landlordName || ''}</strong> as soon as possible to discuss terms.
                  </div>
                  
                  <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/dashboard" 
                     style="display: inline-block; background-color: ${urgencyColor}; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
                    Go to Dashboard
                  </a>
                  
                  <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
                    This is an automated notification from 𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝. Please do not reply to this email.
                  </p>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
  return sendNotificationEmail({ to, subject, message: htmlContent })
}

export async function sendNotificationEmail({ to, subject, message, attachment, bcc }) {
  try {
    // Dynamically import Brevo SDK
    let brevo
    try {
      brevo = await import('@getbrevo/brevo')
    } catch (impErr) {
      console.error('Brevo SDK import failed:', impErr)
      return { success: false, error: 'Brevo SDK not available' }
    }

    // Initialize API client
    const apiInstance = new brevo.TransactionalEmailsApi()
    apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY)

    const sendSmtpEmail = new brevo.SendSmtpEmail()
    sendSmtpEmail.sender = { name: '𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝', email: 'alfnzperez@gmail.com' }
    sendSmtpEmail.to = [{ email: to }]
    sendSmtpEmail.subject = subject
    sendSmtpEmail.htmlContent = message

    // Add BCC if provided (for admin copies)
    if (bcc) {
      sendSmtpEmail.bcc = [{ email: bcc }]
    }

    if (attachment) {
      sendSmtpEmail.attachment = attachment
    }

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail)
    return { success: true, data }
  } catch (error) {
    console.error('Error in sendNotificationEmail:', error)
    return { success: false, error }
  }
}