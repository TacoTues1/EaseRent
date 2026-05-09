import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { getAdminProfile, getAuthenticatedUser } from '../../../lib/apiAuth'

const MAINTENANCE_STATUSES = ['pending', 'scheduled', 'in_progress', 'completed', 'resolved', 'closed', 'cancelled']
const PRIORITIES = ['low', 'medium', 'normal', 'high', 'urgent']

function getString(value) {
  return String(value || '').trim()
}

function normalizeAttachments(value) {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item || '').trim()).filter(Boolean)
}

function pickMaintenancePayload(body, requireAll = false) {
  const payload = {}

  if ('property_id' in body) payload.property_id = getString(body.property_id)
  if ('tenant_id' in body) payload.tenant = getString(body.tenant_id)
  if ('tenant' in body) payload.tenant = getString(body.tenant)

  if ('title' in body) payload.title = getString(body.title)
  if ('description' in body) payload.description = String(body.description || '').trim()

  if ('status' in body) {
    payload.status = getString(body.status) || 'pending'
    if (!MAINTENANCE_STATUSES.includes(payload.status)) {
      throw new Error('Maintenance status is invalid')
    }
  }

  if ('priority' in body) {
    payload.priority = getString(body.priority) || 'medium'
    if (!PRIORITIES.includes(payload.priority)) {
      throw new Error('Priority is invalid')
    }
  }

  if ('attachment_urls' in body) {
    payload.attachment_urls = normalizeAttachments(body.attachment_urls)
  }

  if (requireAll) {
    if (!payload.property_id) throw new Error('Property is required')
    if (!payload.tenant) throw new Error('Tenant is required')
    if (!payload.title) throw new Error('Title is required')
    if (!payload.description) throw new Error('Description is required')
  }

  return payload
}

async function requireAdmin(req) {
  const user = await getAuthenticatedUser(req)
  await getAdminProfile(supabaseAdmin, user.id)
}

async function validateProperty(propertyId) {
  if (!propertyId) return

  const { data, error } = await supabaseAdmin
    .from('properties')
    .select('id, is_deleted')
    .eq('id', propertyId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || data.is_deleted === true) {
    throw new Error('Selected property is invalid')
  }
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

function getStatus(error) {
  const message = error.message || ''
  if (message.includes('Only admins')) return 403
  if (message.includes('access token') || message.includes('Unauthorized')) return 401
  if (
    message.includes('required') ||
    message.includes('invalid')
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
      const payload = pickMaintenancePayload(req.body || {}, true)
      payload.status = payload.status || 'pending'
      payload.priority = payload.priority || 'medium'
      payload.attachment_urls = payload.attachment_urls || []

      await validateProperty(payload.property_id)
      await validateTenant(payload.tenant)

      const { data, error } = await supabaseAdmin
        .from('maintenance_requests')
        .insert(payload)
        .select('*')
        .single()

      if (error) throw new Error(error.message)
      return res.status(201).json({ request: data })
    }

    const id = getString(req.body?.id)
    if (!id) {
      return res.status(400).json({ error: 'Maintenance request id is required' })
    }

    if (req.method === 'PATCH') {
      const payload = pickMaintenancePayload(req.body || {})
      delete payload.id

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'No maintenance request fields provided' })
      }

      await validateProperty(payload.property_id)
      await validateTenant(payload.tenant)

      const { data, error } = await supabaseAdmin
        .from('maintenance_requests')
        .update(payload)
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) return res.status(404).json({ error: 'Maintenance request not found' })

      return res.status(200).json({ request: data })
    }

    const { data, error } = await supabaseAdmin
      .from('maintenance_requests')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return res.status(404).json({ error: 'Maintenance request not found' })

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('admin/maintenance-requests error:', error)
    return res.status(getStatus(error)).json({ error: error.message || 'Request failed' })
  }
}
