import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  const normalizedEmail = email.toLowerCase().trim()

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials for Admin API')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail
    })

    if (linkError) {
      const isUserLookupError = linkError.message?.toLowerCase().includes('not found')

      if (isUserLookupError) {
        return res.status(200).json({
          success: true,
          message: 'If an account exists, a password reset code has been sent to your email'
        })
      }

      console.error('Failed to generate recovery code:', linkError)
      return res.status(500).json({ error: 'Failed to generate reset code' })
    }

    const recoveryCode = linkData?.properties?.email_otp

    if (!recoveryCode) {
      console.error('Recovery code was not returned by Supabase generateLink')
      return res.status(500).json({ error: 'Failed to generate reset code' })
    }

    let brevo
    try {
      brevo = await import('@getbrevo/brevo')
    } catch (impErr) {
      console.error('Brevo SDK import failed:', impErr)
      return res.status(500).json({ error: 'Email service not available' })
    }

    const apiInstance = new brevo.TransactionalEmailsApi()
    apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY)

    const sendSmtpEmail = new brevo.SendSmtpEmail()
    sendSmtpEmail.sender = { name: 'Abalay', email: 'alfnzperez@gmail.com' }
    sendSmtpEmail.to = [{ email: normalizedEmail }]
    sendSmtpEmail.subject = 'Abalay - Password Reset Code'
    sendSmtpEmail.htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">Abalay</h1>
          <p style="color: #666; margin-top: 5px;">Password Reset Request</p>
        </div>
        <div style="background: #f8f8f8; border-radius: 16px; padding: 30px; text-align: center;">
          <p style="color: #333; font-size: 16px; margin: 0 0 20px;">You requested to reset your password. Enter this verification code in the app to continue:</p>
          <div style="background: white; color: #1a1a1a; font-size: 32px; font-weight: 800; letter-spacing: 10px; padding: 18px 24px; border-radius: 14px; display: inline-block;">
            ${recoveryCode}
          </div>
          <p style="color: #999; font-size: 13px; margin-top: 20px;">If you did not request this, you can safely ignore this email.</p>
        </div>
      </div>
    `;

    await apiInstance.sendTransacEmail(sendSmtpEmail)

    return res.status(200).json({
      success: true,
      message: 'If an account exists, a password reset code has been sent to your email'
    })

  } catch (error) {
    console.error('Failed to send reset password code via Brevo:', error)
    return res.status(500).json({
      error: 'Failed to send reset code. Please try again.'
    })
  }
}
