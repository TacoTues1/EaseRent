import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { getAdminProfile, getAuthenticatedUser } from '../../../lib/apiAuth'

const BOOKING_STATUSES = [
  'pending',
  'pending_approval',
  'approved',
  'accepted',
  'confirmed',
  'viewing_done',
  'ready_to_book',
  'assigned',
  'completed',
  'rejected',
  'cancelled'
]

const SLOT_LOCKING_BOOKING_STATUSES = [
  'pending',
  'pending_approval',
  'approved',
  'accepted',
  'viewing_done',
  'assigned',
  'completed'
]

function parseDateField(value, fieldName) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} is invalid`)
  }
  return date.toISOString()
}

function getString(value) {
  return String(value || '').trim()
}

function pickBookingPayload(body, requireAll = false) {
  const payload = {}

  if ('property_id' in body) payload.property_id = getString(body.property_id)
  if ('tenant_id' in body) payload.tenant = getString(body.tenant_id)
  if ('tenant' in body) payload.tenant = getString(body.tenant)
  if ('landlord_id' in body) payload.landlord = getString(body.landlord_id)
  if ('landlord' in body) payload.landlord = getString(body.landlord)

  if ('booking_date' in body) {
    payload.booking_date = parseDateField(body.booking_date, 'Booking date')
    payload.start_time = payload.booking_date
  }

  if ('end_time' in body) {
    payload.end_time = parseDateField(body.end_time, 'End time')
  }

  if ('status' in body) {
    payload.status = getString(body.status) || 'pending'
    if (!BOOKING_STATUSES.includes(payload.status)) {
      throw new Error('Booking status is invalid')
    }
  }

  if ('notes' in body) {
    payload.notes = String(body.notes || '').trim()
  }

  if (requireAll) {
    if (!payload.property_id) throw new Error('Property is required')
    if (!payload.tenant) throw new Error('Tenant is required')
    if (!payload.booking_date) throw new Error('Booking date is required')
  }

  if ('booking_date' in body && !payload.booking_date) {
    throw new Error('Booking date is required')
  }

  if (payload.booking_date && payload.end_time && new Date(payload.end_time) <= new Date(payload.booking_date)) {
    throw new Error('End time must be later than booking date')
  }

  return payload
}

async function requireAdmin(req) {
  const user = await getAuthenticatedUser(req)
  await getAdminProfile(supabaseAdmin, user.id)
}

async function validateTenant(tenantId) {
  if (!tenantId) return

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, is_deleted')
    .eq('id', tenantId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || data.is_deleted === true || !['tenant', 'family_member'].includes(data.role)) {
    throw new Error('Selected tenant is invalid')
  }
}

async function normalizePropertyAndLandlord(payload) {
  if (!payload.property_id) return payload

  const { data: property, error } = await supabaseAdmin
    .from('properties')
    .select('id, landlord, is_deleted')
    .eq('id', payload.property_id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!property || property.is_deleted === true) {
    throw new Error('Selected property is invalid')
  }

  if (!payload.landlord) {
    payload.landlord = property.landlord
  }

  if (property.landlord && payload.landlord && property.landlord !== payload.landlord) {
    throw new Error('Landlord must match the selected property')
  }

  return payload
}

async function ensureNoConflict(payload, currentId = null) {
  const status = payload.status || 'pending'
  if (!payload.property_id || !payload.booking_date || !SLOT_LOCKING_BOOKING_STATUSES.includes(status)) return

  let query = supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('property_id', payload.property_id)
    .eq('booking_date', payload.booking_date)
    .in('status', SLOT_LOCKING_BOOKING_STATUSES)
    .limit(1)

  if (currentId) {
    query = query.neq('id', currentId)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (data) throw new Error('This property already has a booking for that schedule')
}

function getStatus(error) {
  const message = error.message || ''
  if (message.includes('Only admins')) return 403
  if (message.includes('access token') || message.includes('Unauthorized')) return 401
  if (message.includes('already has a booking')) return 409
  if (
    message.includes('required') ||
    message.includes('invalid') ||
    message.includes('must match') ||
    message.includes('later than')
  ) return 400
  return 500
}

export default async function handler(req, res) {
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client is not configured' })
  }

  try {
    await requireAdmin(req)

    if (req.method === 'POST') {
      let payload = pickBookingPayload(req.body || {}, true)
      payload.status = payload.status || 'pending'
      payload = await normalizePropertyAndLandlord(payload)
      if (!payload.landlord) throw new Error('Landlord is required')
      await validateTenant(payload.tenant)
      await ensureNoConflict(payload)

      const { data, error } = await supabaseAdmin
        .from('bookings')
        .insert(payload)
        .select('*')
        .single()

      if (error) throw new Error(error.message)
      return res.status(201).json({ booking: data })
    }

    const id = getString(req.body?.id)
    if (!id) {
      return res.status(400).json({ error: 'Booking id is required' })
    }

    if (req.method === 'PATCH') {
      let payload = pickBookingPayload(req.body || {})
      delete payload.id

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'No booking fields provided' })
      }

      payload = await normalizePropertyAndLandlord(payload)
      await validateTenant(payload.tenant)
      await ensureNoConflict(payload, id)

      const { data, error } = await supabaseAdmin
        .from('bookings')
        .update(payload)
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) return res.status(404).json({ error: 'Booking not found' })

      return res.status(200).json({ booking: data })
    }

    const { data, error } = await supabaseAdmin
      .from('bookings')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return res.status(404).json({ error: 'Booking not found' })

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('admin/bookings error:', error)
    return res.status(getStatus(error)).json({ error: error.message || 'Request failed' })
  }
}
