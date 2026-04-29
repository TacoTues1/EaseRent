import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { sendNotificationEmail } from '../../lib/email'
import { getAuthenticatedUser } from '../../lib/apiAuth'
import {
  SUPPORT_TICKET_ISSUES,
  SUPPORT_TICKET_REQUEST_TYPES,
  attachSupportTicketComments,
  getSupportOptionLabel,
  formatSupportTicketId
} from '../../lib/supportTickets'

const FALLBACK_ADMIN_EMAIL = process.env.SUPPORT_TICKET_FALLBACK_EMAIL || process.env.BUG_REPORT_FALLBACK_EMAIL || 'alfnzperez@gmail.com'

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

function trimRequired(value, label, maxLength) {
  const clean = String(value || '').trim()
  if (!clean) {
    throw new Error(`${label} is required`)
  }
  if (maxLength && clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less`)
  }
  return clean
}

function sanitizeAttachments(attachments, userId) {
  if (!Array.isArray(attachments)) return []

  return attachments
    .slice(0, 8)
    .map(file => ({
      name: String(file?.name || 'Attachment').slice(0, 180),
      url: String(file?.url || ''),
      path: String(file?.path || ''),
      type: String(file?.type || ''),
      size: Number(file?.size || 0)
    }))
    .filter(file => (
      file.url &&
      file.path.startsWith(`${userId}/`) &&
      (file.type.startsWith('image/') || file.type.startsWith('video/'))
    ))
}

function buildTicketEmail({ ticket, requesterProfile, requesterEmail, origin }) {
  const requesterName = `${requesterProfile?.first_name || ''} ${requesterProfile?.last_name || ''}`.trim() || requesterEmail || 'User'
  const requestType = getSupportOptionLabel(SUPPORT_TICKET_REQUEST_TYPES, ticket.request_type)
  const issue = getSupportOptionLabel(SUPPORT_TICKET_ISSUES, ticket.issue)
  const attachmentLinks = Array.isArray(ticket.attachments) && ticket.attachments.length > 0
    ? ticket.attachments.map(file => `
        <li style="margin: 6px 0;">
          <a href="${escapeHtml(file.url)}" style="color: #111827; font-weight: 600;">${escapeHtml(file.name)}</a>
          <span style="color: #6b7280;">(${escapeHtml(file.type || 'file')})</span>
        </li>
      `).join('')
    : '<li style="color: #6b7280;">No attachments</li>'

  return `
    <div style="font-family: Helvetica, Arial, sans-serif; color: #111827; max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
      <div style="background: #111827; padding: 22px 26px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">New Help Center Ticket</h1>
        <p style="color: #d1d5db; margin: 8px 0 0; font-size: 14px;">${escapeHtml(formatSupportTicketId(ticket.id))}</p>
      </div>
      <div style="padding: 26px; background: #ffffff;">
        <p style="margin-top: 0;">A user submitted a new support ticket.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 10px 0; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Requester</td><td style="padding: 10px 0; font-weight: 700; text-align: right; border-bottom: 1px solid #f3f4f6;">${escapeHtml(requesterName)}</td></tr>
          <tr><td style="padding: 10px 0; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Email</td><td style="padding: 10px 0; font-weight: 700; text-align: right; border-bottom: 1px solid #f3f4f6;">${escapeHtml(requesterEmail || 'N/A')}</td></tr>
          <tr><td style="padding: 10px 0; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Phone</td><td style="padding: 10px 0; font-weight: 700; text-align: right; border-bottom: 1px solid #f3f4f6;">${escapeHtml(ticket.phone_number || 'N/A')}</td></tr>
          <tr><td style="padding: 10px 0; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Type</td><td style="padding: 10px 0; font-weight: 700; text-align: right; border-bottom: 1px solid #f3f4f6;">${escapeHtml(requestType)}</td></tr>
          <tr><td style="padding: 10px 0; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Issue</td><td style="padding: 10px 0; font-weight: 700; text-align: right; border-bottom: 1px solid #f3f4f6;">${escapeHtml(issue)}</td></tr>
        </table>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 700;">Subject</p>
          <p style="margin: 0 0 18px; font-size: 18px; font-weight: 800;">${escapeHtml(ticket.subject)}</p>
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 700;">Description</p>
          <p style="margin: 0; white-space: pre-wrap; line-height: 1.65;">${escapeHtml(ticket.description)}</p>
        </div>
        <div style="margin-top: 22px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 700;">Attachments</p>
          <ul style="padding-left: 18px; margin: 0;">${attachmentLinks}</ul>
        </div>
        <div style="margin-top: 28px; text-align: center;">
          <a href="${escapeHtml(origin)}/dashboard" style="display: inline-block; background: #111827; color: #ffffff; padding: 12px 22px; border-radius: 10px; text-decoration: none; font-weight: 800;">Open Admin Dashboard</a>
        </div>
      </div>
    </div>
  `
}

async function handleGet(req, res, user) {
  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .select(`
      id,
      request_type,
      issue,
      subject,
      description,
      phone_number,
      attachments,
      status,
      claimed_by,
      claimed_at,
      created_at,
      updated_at,
      claimed_by_profile:profiles!support_tickets_claimed_by_fkey(id, first_name, last_name, email)
    `)
    .eq('requester_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  const tickets = await attachSupportTicketComments(supabaseAdmin, data || [])

  return res.status(200).json({ tickets })
}

async function handlePost(req, res, user) {
  const body = req.body || {}
  const requestType = trimRequired(body.requestType, 'Request type', 80)
  const issue = trimRequired(body.issue, 'Issue', 80)
  const subject = trimRequired(body.subject, 'Subject', 160)
  const description = trimRequired(body.description, 'Description', 4000)
  const phoneNumber = String(body.phoneNumber || '').trim().slice(0, 40) || null
  const attachments = sanitizeAttachments(body.attachments, user.id)

  const allowedRequestTypes = SUPPORT_TICKET_REQUEST_TYPES.map(option => option.value)
  const allowedIssues = SUPPORT_TICKET_ISSUES.map(option => option.value)

  if (!allowedRequestTypes.includes(requestType)) {
    return res.status(400).json({ error: 'Invalid request type' })
  }

  if (!allowedIssues.includes(issue)) {
    return res.status(400).json({ error: 'Invalid issue' })
  }

  const { data: requesterProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, email, phone')
    .eq('id', user.id)
    .maybeSingle()

  const { data: ticket, error } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      requester_id: user.id,
      request_type: requestType,
      issue,
      subject,
      description,
      phone_number: phoneNumber || requesterProfile?.phone || null,
      attachments,
      status: 'pending'
    })
    .select('id, request_type, issue, subject, description, phone_number, attachments, status, created_at')
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  let sentTo = 0
  let failed = []

  try {
    const adminEmails = await getAdminEmails()
    const origin = req.headers.origin || process.env.NEXT_PUBLIC_SITE_URL || 'https://abalay-rent.me'
    const message = buildTicketEmail({
      ticket,
      requesterProfile,
      requesterEmail: requesterProfile?.email || user.email,
      origin
    })

    const results = await Promise.all(adminEmails.map(email => (
      sendNotificationEmail({
        to: email,
        subject: `[Help Center] ${formatSupportTicketId(ticket.id)} - ${subject}`,
        message
      })
    )))

    sentTo = adminEmails.length
    failed = results
      .map((result, index) => ({ result, email: adminEmails[index] }))
      .filter(item => !item.result?.success)

    if (failed.length > 0) {
      console.warn('Some support ticket emails failed:', failed.map(item => ({
        email: item.email,
        error: item.result?.error?.message || String(item.result?.error || 'Send failed')
      })))
    }

    console.log('Support ticket admin email status:', {
      ticketId: ticket.id,
      attempted: sentTo,
      sent: Math.max(0, sentTo - failed.length),
      failed: failed.length
    })
  } catch (emailError) {
    console.warn('Support ticket was saved, but notification email failed:', emailError)
    failed = [{ email: 'admins', error: emailError.message || 'Notification failed' }]
  }

  return res.status(201).json({
    success: true,
    ticket,
    email: {
      attempted: sentTo,
      sent: Math.max(0, sentTo - failed.length),
      failed: failed.length
    }
  })
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client is not configured' })
  }

  try {
    const user = await getAuthenticatedUser(req)

    if (req.method === 'GET') {
      return handleGet(req, res, user)
    }

    return handlePost(req, res, user)
  } catch (error) {
    const message = error.message || 'Request failed'
    const status = message.includes('Unauthorized') || message.includes('access token') ? 401 : 400
    return res.status(status).json({ error: message })
  }
}
