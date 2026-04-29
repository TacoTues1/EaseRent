import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { getAdminProfile, getAuthenticatedUser } from '../../../lib/apiAuth'
import { SUPPORT_TICKET_STATUSES, attachSupportTicketComments } from '../../../lib/supportTickets'

const TICKET_SELECT = `
  id,
  requester_id,
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
  requester:profiles!support_tickets_requester_id_fkey(id, first_name, last_name, email, phone),
  claimed_by_profile:profiles!support_tickets_claimed_by_fkey(id, first_name, last_name, email)
`

async function requireAdmin(req) {
  const user = await getAuthenticatedUser(req)
  const profile = await getAdminProfile(supabaseAdmin, user.id)
  return { user, profile }
}

async function handleGet(req, res) {
  const status = String(req.query.status || 'all')
  const validStatuses = SUPPORT_TICKET_STATUSES.map(option => option.value)

  let query = supabaseAdmin
    .from('support_tickets')
    .select(TICKET_SELECT)
    .order('created_at', { ascending: false })
    .limit(250)

  if (status !== 'all') {
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' })
    }
    query = query.eq('status', status)
  }

  const [{ data, error }, { count: pendingCount, error: countError }] = await Promise.all([
    query,
    supabaseAdmin
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
  ])

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  if (countError) {
    return res.status(500).json({ error: countError.message })
  }

  const tickets = await attachSupportTicketComments(supabaseAdmin, data || [])

  return res.status(200).json({ tickets, pendingCount: pendingCount || 0 })
}

async function handlePatch(req, res, adminProfile) {
  const { ticketId, action, status } = req.body || {}

  if (!ticketId) {
    return res.status(400).json({ error: 'Ticket ID is required' })
  }

  const now = new Date().toISOString()
  const updates = { updated_at: now }

  if (action === 'claim') {
    updates.claimed_by = adminProfile.id
    updates.claimed_at = now
    updates.status = 'in_progress'
  } else if (action === 'status') {
    const validStatuses = SUPPORT_TICKET_STATUSES.map(option => option.value)
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    updates.status = status
  } else {
    return res.status(400).json({ error: 'Invalid ticket action' })
  }

  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .update(updates)
    .eq('id', ticketId)
    .select(TICKET_SELECT)
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  const { count: pendingCount } = await supabaseAdmin
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  const [ticket] = await attachSupportTicketComments(supabaseAdmin, data ? [data] : [])

  return res.status(200).json({ success: true, ticket: ticket || data, pendingCount: pendingCount || 0 })
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client is not configured' })
  }

  try {
    const { profile } = await requireAdmin(req)

    if (req.method === 'GET') {
      return handleGet(req, res)
    }

    return handlePatch(req, res, profile)
  } catch (error) {
    const message = error.message || 'Request failed'
    const status = message.includes('Only admins') ? 403 : 401
    return res.status(status).json({ error: message })
  }
}
