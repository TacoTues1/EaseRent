import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { getAdminProfile, getAuthenticatedUser } from '../../../lib/apiAuth'

function parseBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return Boolean(value)
}

function parseDateField(value, fieldName) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} is invalid`)
  }
  return date.toISOString()
}

function pickSlotPayload(body, requireAll = false) {
  const payload = {}

  if ('landlord_id' in body) {
    payload.landlord_id = String(body.landlord_id || '').trim()
  }

  if ('property_id' in body) {
    payload.property_id = body.property_id ? String(body.property_id).trim() : null
  }

  if ('start_time' in body) {
    payload.start_time = parseDateField(body.start_time, 'start_time')
  }

  if ('end_time' in body) {
    payload.end_time = parseDateField(body.end_time, 'end_time')
  }

  if ('is_booked' in body) {
    payload.is_booked = parseBoolean(body.is_booked)
  }

  if (requireAll) {
    if (!payload.landlord_id) throw new Error('Landlord is required')
    if (!payload.start_time) throw new Error('Start time is required')
    if (!payload.end_time) throw new Error('End time is required')
  }

  if (payload.start_time && payload.end_time && new Date(payload.end_time) <= new Date(payload.start_time)) {
    throw new Error('End time must be later than start time')
  }

  return payload
}

async function requireAdmin(req) {
  const user = await getAuthenticatedUser(req)
  await getAdminProfile(supabaseAdmin, user.id)
}

async function validateLandlord(landlordId) {
  if (landlordId === undefined || landlordId === null) return
  if (!landlordId) throw new Error('Selected landlord is invalid')

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, is_deleted')
    .eq('id', landlordId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || data.role !== 'landlord' || data.is_deleted === true) {
    throw new Error('Selected landlord is invalid')
  }
}

function getStatus(error) {
  const message = error.message || ''
  if (message.includes('Only admins')) return 403
  if (message.includes('access token') || message.includes('Unauthorized')) return 401
  if (
    message.includes('required') ||
    message.includes('invalid') ||
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
      const payload = pickSlotPayload(req.body || {}, true)
      await validateLandlord(payload.landlord_id)

      const { data, error } = await supabaseAdmin
        .from('available_time_slots')
        .insert(payload)
        .select('*')
        .single()

      if (error) throw new Error(error.message)
      return res.status(201).json({ slot: data })
    }

    const id = String(req.body?.id || '').trim()
    if (!id) {
      return res.status(400).json({ error: 'Slot id is required' })
    }

    if (req.method === 'PATCH') {
      const payload = pickSlotPayload(req.body || {})
      delete payload.id
      await validateLandlord(payload.landlord_id)

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'No slot fields provided' })
      }

      const { data, error } = await supabaseAdmin
        .from('available_time_slots')
        .update(payload)
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) return res.status(404).json({ error: 'Slot not found' })

      return res.status(200).json({ slot: data })
    }

    const { data, error } = await supabaseAdmin
      .from('available_time_slots')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return res.status(404).json({ error: 'Slot not found' })

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('admin/schedule-slots error:', error)
    return res.status(getStatus(error)).json({ error: error.message || 'Request failed' })
  }
}
