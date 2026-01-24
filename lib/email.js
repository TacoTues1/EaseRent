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
export async function sendNotificationEmail({ to, subject, message }) {
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

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail)
    return { success: true, data }
  } catch (error) {
    console.error('Error in sendNotificationEmail:', error)
    return { success: false, error }
  }
}