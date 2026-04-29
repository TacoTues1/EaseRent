import { sendNotificationEmail } from '../../lib/email'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const FALLBACK_ADMIN_EMAIL = process.env.BUG_REPORT_FALLBACK_EMAIL || 'alfnzperez@gmail.com'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

function uniqueEmails(emails) {
  return Array.from(
    new Set(
      (emails || [])
        .map(email => String(email || '').trim().toLowerCase())
        .filter(email => email && isValidEmail(email))
    )
  )
}

async function getAdminEmails() {
  if (!supabaseAdmin) return [FALLBACK_ADMIN_EMAIL]

  const { data: adminProfiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email')
    .eq('role', 'admin')
    .or('is_deleted.is.false,is_deleted.is.null')

  if (error) throw error

  const profileEmails = uniqueEmails((adminProfiles || []).map(admin => admin.email))
  const authEmails = []

  for (const admin of adminProfiles || []) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(admin.id)
      if (data?.user?.email) authEmails.push(data.user.email)
    } catch (authError) {
      console.warn(`Could not fetch auth email for admin ${admin.id}:`, authError)
    }
  }

  const emails = uniqueEmails([...profileEmails, ...authEmails])
  return emails.length > 0 ? emails : [FALLBACK_ADMIN_EMAIL]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, email: reporterEmail, category, description, source = 'Web App', attachmentName, attachmentContent } = req.body || {}
  const reporterName = String(name || '').trim() || 'Anonymous'
  const bugCategory = String(category || '').trim() || 'Uncategorized'

  if (!description || !String(description).trim()) {
    return res.status(400).json({ error: 'Description is required' })
  }

  const safeReporterName = escapeHtml(reporterName)
  const safeReporterEmail = escapeHtml(reporterEmail || 'N/A')
  const safeBugCategory = escapeHtml(bugCategory)
  const safeDescription = escapeHtml(description)
  const safeAttachmentName = escapeHtml(attachmentName || 'No attachment')

  const htmlContent = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
      <div style="background-color: #f97316; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">New Bug Report</h1>
      </div>
      <div style="padding: 24px; background-color: white;">
        <p style="margin-top: 0;">Hi Admin,</p>
        <p>A new bug has been reported from the <strong>${escapeHtml(source)}</strong>.</p>

        <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0 0 12px; font-weight: bold; color: #9a3412;">Category: ${safeBugCategory}</p>
          <p style="margin: 0; font-weight: bold; color: #9a3412;">Description:</p>
          <p style="margin: 8px 0 0; white-space: pre-wrap; line-height: 1.6;">${safeDescription}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 14px;">Category</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-weight: 600; text-align: right;">${safeBugCategory}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 14px;">Reporter</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-weight: 600; text-align: right;">${safeReporterName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 14px;">Email</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-weight: 600; text-align: right;">${safeReporterEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 14px;">Attachment</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-style: italic; text-align: right;">${safeAttachmentName}</td>
          </tr>
        </table>

        <div style="margin-top: 30px; text-align: center;">
          <a href="https://abalay-rent.me/admin" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">View in Admin Dashboard</a>
        </div>
      </div>
      <div style="background-color: #f9fafb; padding: 15px; text-align: center; border-top: 1px solid #eee;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">This is an automated system notification from Abalay Rent.</p>
      </div>
    </div>
  `

  try {
    // Try to save to bug_reports table
    if (supabaseAdmin) {
      const bugReportRecord = {
        reporter_name: reporterName,
        reporter_email: reporterEmail || null,
        category: bugCategory,
        description: description,
        source: source,
        attachment_note: attachmentName ? `File: ${attachmentName}` : 'No attachment',
        status: 'pending',
        created_at: new Date().toISOString()
      }

      try {
        const { error: insertError } = await supabaseAdmin.from('bug_reports').insert(bugReportRecord)
        if (insertError) throw insertError
      } catch (dbError) {
        const errorText = String(dbError?.message || dbError?.details || '')
        const isMissingCategoryColumn = errorText.toLowerCase().includes('category')

        if (isMissingCategoryColumn) {
          const { category: _category, ...recordWithoutCategory } = bugReportRecord

          try {
            const { error: fallbackError } = await supabaseAdmin.from('bug_reports').insert(recordWithoutCategory)
            if (fallbackError) throw fallbackError
          } catch (fallbackDbError) {
            console.warn('Could not save bug report to database:', fallbackDbError)
          }
        } else {
          console.warn('Could not save bug report to database:', dbError)
        }
      }
    }

    const adminEmails = await getAdminEmails()

    const results = await Promise.all(adminEmails.map(email => {
      const emailConfig = {
        to: email,
        subject: `[Bug Report] ${bugCategory} - ${reporterName}`,
        message: htmlContent
      }

      if (attachmentName && attachmentContent) {
        emailConfig.attachment = [
          {
            name: attachmentName,
            content: attachmentContent
          }
        ]
      }

      return sendNotificationEmail(emailConfig)
    }))

    const failed = results
      .map((result, index) => ({ result, email: adminEmails[index] }))
      .filter(item => !item.result?.success)

    if (failed.length > 0 && adminEmails.length > 0) {
      console.warn('Some bug report emails failed:', failed)
    }

    return res.status(200).json({ success: true, sentTo: adminEmails.length })
  } catch (error) {
    console.error('Bug report error:', error)
    return res.status(500).json({ error: 'Failed to send bug report' })
  }
}
