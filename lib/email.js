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
    sendSmtpEmail.sender = { name: 'EaseRent', email: 'alfnzperez@gmail.com' }
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
    other: '📋 Other Bill'
  }

  const label = billTypeLabels[billType] || '📋 Bill'
  const formattedDue = dueDate ? new Date(dueDate).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  }) : 'Not specified'

  const subject = `${label} Due: ${propertyTitle}`

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
                    You have a new ${billType === 'rent' ? 'rent' : 'utility'} bill for <strong>${propertyTitle}</strong>.
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
                    This is an automated notification from EaseRent. Please do not reply to this email.
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
                    Please respond to this request promptly. This is an automated notification from EaseRent.
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
 */
export async function sendMonthlyStatementEmail({ to, tenantName, period, pdfBuffer }) {
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

      <p>For inquiries and comments, please contact our Customer Support Hotline at (+632) 1111-1111 (Domestic toll-free: 1-800-1111-1111) or *1111 using your Smart mobile phone or access our built in messaging system on the EaseRent Website.</p>
      
      <p style="margin-top: 32px; font-weight: bold;">EaseRent - Rental Management System</p>
    </div>
  `

  const attachment = [
    {
      name: `Statement_${period.monthName}_${period.year}.pdf`,
      content: pdfBuffer.toString('base64')
    }
  ]

  return sendNotificationEmail({ to, subject, message: htmlContent, attachment })
}

export async function sendNotificationEmail({ to, subject, message, attachment }) {
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
    sendSmtpEmail.sender = { name: 'EaseRent', email: 'alfnzperez@gmail.com' }
    sendSmtpEmail.to = [{ email: to }]
    sendSmtpEmail.subject = subject
    sendSmtpEmail.htmlContent = message

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