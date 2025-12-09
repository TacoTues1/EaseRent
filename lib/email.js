import * as brevo from '@getbrevo/brevo'

/**
 * Send viewing approval email to tenant
 * @param {Object} params - Email parameters
 * @param {string} params.to - Recipient email address
 * @param {string} params.tenantName - Name of the tenant
 * @param {string} params.propertyTitle - Title of the property
 * @param {string} params.propertyAddress - Address of the property
 * @param {Date} params.viewingDate - Date and time of the viewing
 * @param {string} params.timeSlot - Time slot label (e.g., "Morning (8:00 AM - 11:00 AM)")
 * @param {string} params.landlordName - Name of the landlord
 * @param {string} params.landlordPhone - Phone number of the landlord
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
  console.log('sendViewingApprovalEmail called with:', { to, tenantName, propertyTitle })
  
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

  const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Viewing Approved</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9fafb;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 2px solid #000000;">
                    <!-- Header -->
                    <tr>
                      <td style="background-color: #000000; padding: 30px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                          🎉 Viewing Approved!
                        </h1>
                      </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px 30px;">
                        <p style="margin: 0 0 20px 0; color: #000000; font-size: 16px; line-height: 1.6;">
                          Hi <strong>${tenantName}</strong>,
                        </p>

                        <p style="margin: 0 0 20px 0; color: #000000; font-size: 16px; line-height: 1.6;">
                          Great news! Your viewing request has been <strong>approved</strong> by the landlord.
                        </p>

                        <!-- Property Details Card -->
                        <div style="background-color: #f3f4f6; border-left: 4px solid #000000; padding: 20px; margin: 30px 0;">
                          <h2 style="margin: 0 0 15px 0; color: #000000; font-size: 20px; font-weight: bold;">
                            📍 Property Details
                          </h2>
                          <p style="margin: 0 0 10px 0; color: #000000; font-size: 15px;">
                            <strong>Property:</strong> ${propertyTitle}
                          </p>
                          <p style="margin: 0; color: #000000; font-size: 15px;">
                            <strong>Address:</strong> ${propertyAddress}
                          </p>
                        </div>

                        <!-- Viewing Schedule Card -->
                        <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 20px; margin: 30px 0;">
                          <h2 style="margin: 0 0 15px 0; color: #000000; font-size: 20px; font-weight: bold;">
                            📅 Viewing Schedule
                          </h2>
                          <p style="margin: 0 0 10px 0; color: #000000; font-size: 15px;">
                            <strong>Date:</strong> ${formattedDate}
                          </p>
                          <p style="margin: 0; color: #000000; font-size: 15px;">
                            <strong>Time:</strong> ${timeSlot}
                          </p>
                        </div>

                        <!-- Landlord Contact Card -->
                        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 30px 0;">
                          <h2 style="margin: 0 0 15px 0; color: #000000; font-size: 20px; font-weight: bold;">
                            👤 Landlord Contact
                          </h2>
                          <p style="margin: 0 0 10px 0; color: #000000; font-size: 15px;">
                            <strong>Name:</strong> ${landlordName}
                          </p>
                          <p style="margin: 0; color: #000000; font-size: 15px;">
                            <strong>Phone:</strong> ${landlordPhone}
                          </p>
                        </div>

                        <!-- Important Notice -->
                        <div style="background-color: #fee2e2; border: 2px solid #ef4444; padding: 20px; margin: 30px 0; border-radius: 4px;">
                          <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
                            <strong>⚠️ Important:</strong> Please arrive on time for your viewing. If you need to reschedule or cancel, 
                            please contact the landlord as soon as possible.
                          </p>
                        </div>

                        <!-- Tips -->
                        <div style="margin: 30px 0;">
                          <h3 style="margin: 0 0 15px 0; color: #000000; font-size: 18px; font-weight: bold;">
                            💡 Tips for Your Viewing
                          </h3>
                          <ul style="margin: 0; padding-left: 20px; color: #000000; font-size: 15px; line-height: 1.8;">
                            <li>Bring a valid ID</li>
                            <li>Prepare questions about the property</li>
                            <li>Check the condition of appliances and fixtures</li>
                            <li>Take notes and photos if allowed</li>
                            <li>Ask about utilities and additional fees</li>
                          </ul>
                        </div>

                        <p style="margin: 30px 0 0 0; color: #000000; font-size: 16px; line-height: 1.6;">
                          Good luck with your viewing!
                        </p>

                        <p style="margin: 20px 0 0 0; color: #000000; font-size: 16px; line-height: 1.6;">
                          Best regards,<br>
                          <strong>The EaseRent Team</strong>
                        </p>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f3f4f6; padding: 30px; text-align: center; border-top: 2px solid #000000;">
                        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                          This is an automated notification from EaseRent
                        </p>
                        <p style="margin: 0; color: #6b7280; font-size: 12px;">
                          © ${new Date().getFullYear()} EaseRent. All rights reserved.
                        </p>
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
    console.log('Attempting to send email via Brevo...')
    
    // Initialize API client with key
    const apiInstance = new brevo.TransactionalEmailsApi()
    apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY)
    
    const sendSmtpEmail = new brevo.SendSmtpEmail()
    sendSmtpEmail.sender = { name: 'EaseRent', email: 'alfnzperez@gmail.com' }
    sendSmtpEmail.to = [{ email: to, name: tenantName }]
    sendSmtpEmail.subject = `✅ Viewing Approved - ${propertyTitle}`
    sendSmtpEmail.htmlContent = htmlContent

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail)

    console.log('Email sent successfully via Brevo:', data)
    console.log('Email sent to:', to)
    console.log('From:', 'alfnzperez@gmail.com')
    return { success: true, data }
  } catch (error) {
    console.error('Error in sendViewingApprovalEmail:', error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    if (error.response) {
      console.error('Brevo API Response:', error.response.body || error.response.text)
    }
    return { success: false, error: error.message || error }
  }
}

/**
 * Send a generic notification email
 * @param {Object} params - Email parameters
 * @param {string} params.to - Recipient email address
 * @param {string} params.subject - Email subject
 * @param {string} params.message - Email message (can include HTML)
 */
export async function sendNotificationEmail({ to, subject, message }) {
  try {
    // Initialize API client with key
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
