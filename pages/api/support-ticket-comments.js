import { getAuthenticatedUser } from '../../lib/apiAuth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import {
  SUPPORT_TICKET_COMMENT_SELECT,
  isMissingSupportTicketCommentsTable
} from '../../lib/supportTickets'

function cleanComment(value) {
  const comment = String(value || '').trim()

  if (!comment) {
    throw new Error('Comment is required')
  }

  if (comment.length > 2000) {
    throw new Error('Comment must be 2000 characters or less')
  }

  return comment
}

async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, email, role, is_deleted')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function getTicket(ticketId) {
  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .select('id, requester_id, claimed_by, status')
    .eq('id', ticketId)
    .maybeSingle()

  if (error) throw error
  return data
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client is not configured' })
  }

  try {
    const user = await getAuthenticatedUser(req)
    const profile = await getProfile(user.id)
    const { ticketId } = req.body || {}

    if (!ticketId) {
      return res.status(400).json({ error: 'Ticket ID is required' })
    }

    const ticket = await getTicket(ticketId)
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' })
    }

    if (ticket.status === 'closed') {
      return res.status(403).json({ error: 'This ticket is closed and can no longer receive comments' })
    }

    const isRequester = ticket.requester_id === user.id
    const isActiveAdmin = profile?.role === 'admin' && profile?.is_deleted !== true
    const isAssignedAdmin = isActiveAdmin && ticket.claimed_by === user.id

    if (!isRequester && !isAssignedAdmin) {
      const message = isActiveAdmin
        ? 'Only the assigned admin can comment on this ticket'
        : 'You can only comment on your own tickets'
      return res.status(403).json({ error: message })
    }

    const body = cleanComment(req.body?.body || req.body?.comment)
    const { data: comment, error } = await supabaseAdmin
      .from('support_ticket_comments')
      .insert({
        ticket_id: ticketId,
        author_id: user.id,
        body
      })
      .select(SUPPORT_TICKET_COMMENT_SELECT)
      .single()

    if (error) {
      if (isMissingSupportTicketCommentsTable(error)) {
        return res.status(503).json({
          error: 'Ticket comments are not ready yet. Please run the support ticket comments database migration.'
        })
      }

      return res.status(500).json({ error: error.message })
    }

    const { error: updateError } = await supabaseAdmin
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', ticketId)

    if (updateError) {
      console.warn('Support ticket comment saved, but ticket timestamp update failed:', updateError)
    }

    return res.status(201).json({ success: true, comment })
  } catch (error) {
    const message = error.message || 'Request failed'
    const status = message.includes('Unauthorized') || message.includes('access token') ? 401 : 400
    return res.status(status).json({ error: message })
  }
}
