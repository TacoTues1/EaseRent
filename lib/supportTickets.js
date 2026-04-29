export const SUPPORT_TICKET_REQUEST_TYPES = [
  { value: 'technical_issue', label: 'Technical Issue' },
  { value: 'account_help', label: 'Account Help' },
  { value: 'booking_support', label: 'Booking Support' },
  { value: 'payment_support', label: 'Payment Support' },
  { value: 'property_listing', label: 'Property Listing' },
  { value: 'maintenance_support', label: 'Maintenance Support' },
  { value: 'other', label: 'Other Request' }
]

export const SUPPORT_TICKET_ISSUES = [
  { value: 'accounts', label: 'Accounts' },
  { value: 'booking', label: 'Booking' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'payment_problems', label: 'Payment Problems' },
  { value: 'account_profile', label: 'Account / Profile' },
  { value: 'property_listing', label: 'Property Listing' },
  { value: 'messages_notifications', label: 'Messages / Notifications' },
  { value: 'other', label: 'Others' }
]

export const SUPPORT_TICKET_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' }
]

export const SUPPORT_TICKET_COMMENT_SELECT = `
  id,
  ticket_id,
  author_id,
  body,
  created_at,
  author:profiles!support_ticket_comments_author_id_fkey(id, first_name, last_name, email, role, avatar_url)
`

export function getSupportOptionLabel(options, value) {
  return options.find(option => option.value === value)?.label || value || 'N/A'
}

export function getSupportProfileName(profile, fallback = 'N/A') {
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
  return name || profile?.email || fallback
}

export function formatSupportTicketId(id) {
  if (!id) return 'N/A'
  return `#${String(id).slice(0, 8).toUpperCase()}`
}

export function normalizeSupportTicketStatus(status) {
  return SUPPORT_TICKET_STATUSES.some(option => option.value === status) ? status : 'pending'
}

export function isMissingSupportTicketCommentsTable(error) {
  return error?.code === 'PGRST205' && String(error?.message || '').includes('support_ticket_comments')
}

export async function fetchSupportTicketComments(supabaseClient, ticketIds) {
  const ids = Array.isArray(ticketIds) ? ticketIds.filter(Boolean) : []
  if (ids.length === 0) return {}

  const { data, error } = await supabaseClient
    .from('support_ticket_comments')
    .select(SUPPORT_TICKET_COMMENT_SELECT)
    .in('ticket_id', ids)
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingSupportTicketCommentsTable(error)) {
      console.warn('support_ticket_comments table is missing; returning tickets without comments.')
      return {}
    }

    throw error
  }

  return (data || []).reduce((grouped, comment) => {
    if (!grouped[comment.ticket_id]) grouped[comment.ticket_id] = []
    grouped[comment.ticket_id].push(comment)
    return grouped
  }, {})
}

export async function attachSupportTicketComments(supabaseClient, tickets) {
  const rows = Array.isArray(tickets) ? tickets : []
  const commentsByTicketId = await fetchSupportTicketComments(
    supabaseClient,
    rows.map(ticket => ticket.id)
  )

  return rows.map(ticket => ({
    ...ticket,
    comments: commentsByTicketId[ticket.id] || []
  }))
}
