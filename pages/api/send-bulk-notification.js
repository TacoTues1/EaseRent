import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { sendNotificationEmail } from '../../lib/email'
import { sendSMS } from '../../lib/sms'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ success: false, error: 'Supabase admin client not configured' })
  }

  const { tenantIds, subject, body, ending, landlordId } = req.body || {}

  if (!tenantIds || !Array.isArray(tenantIds) || tenantIds.length === 0) {
    return res.status(400).json({ success: false, error: 'No tenants selected' })
  }

  if (!subject || !body) {
    return res.status(400).json({ success: false, error: 'Subject and body are required' })
  }

  try {
    // Get landlord profile
    const { data: landlordProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', landlordId)
      .single()

    const landlordName = landlordProfile
      ? `${landlordProfile.first_name} ${landlordProfile.last_name}`
      : 'Your Landlord'

    // Get tenant profiles with their emails and phone verification status
    const { data: tenants, error: tenantsError } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, phone, phone_verified')
      .in('id', tenantIds)

    if (tenantsError) {
      console.error('Error fetching tenants:', tenantsError)
      return res.status(500).json({ success: false, error: 'Failed to fetch tenant information' })
    }

    const results = {
      emailsSent: 0,
      smsSent: 0,
      emailsFailed: 0,
      smsFailed: 0,
      details: []
    }

    // Process each tenant
    for (const tenant of tenants) {
      const tenantName = tenant.first_name || 'Tenant'

      // Build email HTML
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
                      <h1 style="color: #111827; margin-top: 0; font-size: 24px;">📬 ${subject}</h1>
                      <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">Hi <strong>${tenantName}</strong>,</p>
                      
                      <div style="font-size: 16px; color: #374151; line-height: 1.8; white-space: pre-wrap;">
${body}
                      </div>
                      
                      ${ending ? `
                        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                          <p style="font-size: 14px; color: #6b7280; white-space: pre-wrap; margin: 0;">${ending}</p>
                        </div>
                      ` : ''}
                      
                      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                        <p style="font-size: 14px; color: #6b7280; margin: 0;">Best regards,</p>
                        <p style="font-size: 16px; color: #111827; font-weight: 600; margin: 4px 0 0 0;">${landlordName}</p>
                      </div>
                      
                      <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
                        This message was sent via 𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝. Please do not reply to this email directly.
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `

      // Get tenant email
      const { data: tenantEmail } = await supabaseAdmin.rpc('get_user_email', { user_id: tenant.id })

      // Send Email
      if (tenantEmail) {
        try {
          const emailResult = await sendNotificationEmail({
            to: tenantEmail,
            subject: `📬 ${subject}`,
            message: htmlContent
          })

          if (emailResult.success) {
            results.emailsSent++
            results.details.push({ tenant: tenantName, email: 'sent' })
          } else {
            results.emailsFailed++
            results.details.push({ tenant: tenantName, email: 'failed' })
          }
        } catch (err) {
          console.error(`Email failed for ${tenantName}:`, err)
          results.emailsFailed++
          results.details.push({ tenant: tenantName, email: 'failed' })
        }
      }

      // Send SMS if phone is verified
      if (tenant.phone && tenant.phone_verified) {
        const smsMessage = `[EaseRent] ${subject}\n\n${body}${ending ? `\n\n${ending}` : ''}\n\n- ${landlordName}`

        try {
          await sendSMS(tenant.phone, smsMessage.substring(0, 500))
          results.smsSent++
          results.details.push({ tenant: tenantName, sms: 'sent' })
        } catch (err) {
          console.error(`SMS failed for ${tenantName}:`, err)
          results.smsFailed++
          results.details.push({ tenant: tenantName, sms: 'failed' })
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Sent ${results.emailsSent} emails and ${results.smsSent} SMS messages`,
      results
    })

  } catch (err) {
    console.error('Bulk notification error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
