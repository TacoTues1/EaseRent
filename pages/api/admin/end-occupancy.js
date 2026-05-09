import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { getAdminProfile, getAuthenticatedUser } from '../../../lib/apiAuth'

const ACTIVE_OCCUPANCY_STATUSES = ['active', 'pending_end']
const BOOKING_FINALIZE_STATUSES = ['pending', 'pending_approval', 'approved', 'accepted', 'cancelled']
const OPEN_MAINTENANCE_STATUSES = ['pending', 'scheduled', 'in_progress']

function getStatus(error) {
  const message = error.message || ''
  if (message.includes('Only admins')) return 403
  if (message.includes('access token') || message.includes('Unauthorized')) return 401
  if (message.includes('required') || message.includes('already ended') || message.includes('not active')) return 400
  return 500
}

async function requireAdmin(req) {
  const user = await getAuthenticatedUser(req)
  await getAdminProfile(supabaseAdmin, user.id)
  return user
}

function throwIfError(result) {
  if (result?.error) throw new Error(result.error.message)
  return result
}

async function cleanupFamilyMembers(occupancy) {
  const parentOccId = occupancy.is_family_member ? occupancy.parent_occupancy_id : occupancy.id
  if (!parentOccId) return 0

  const { data: familyMembers, error: familyError } = await supabaseAdmin
    .from('family_members')
    .select('id, member_id, member_occupancy_id')
    .eq('parent_occupancy_id', parentOccId)

  if (familyError) throw new Error(familyError.message)
  if (!familyMembers?.length) return 0

  for (const member of familyMembers) {
    if (!member.member_occupancy_id) continue

    throwIfError(await supabaseAdmin
      .from('tenant_occupancies')
      .update({
        status: 'ended',
        end_date: new Date().toISOString(),
        is_family_member: false,
        parent_occupancy_id: null
      })
      .eq('id', member.member_occupancy_id))

    throwIfError(await supabaseAdmin
      .from('bookings')
      .update({ status: 'completed' })
      .eq('tenant', member.member_id)
      .eq('property_id', occupancy.property_id)
      .in('status', BOOKING_FINALIZE_STATUSES))

    throwIfError(await supabaseAdmin
      .from('applications')
      .update({ status: 'completed' })
      .eq('tenant', member.member_id)
      .eq('property_id', occupancy.property_id)
      .eq('status', 'accepted'))
  }

  const { error: deleteFamilyError } = await supabaseAdmin
    .from('family_members')
    .delete()
    .eq('parent_occupancy_id', parentOccId)

  if (deleteFamilyError) throw new Error(deleteFamilyError.message)

  return familyMembers.length
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
    await requireAdmin(req)

    const occupancyId = String(req.body?.occupancyId || req.body?.id || '').trim()
    if (!occupancyId) {
      return res.status(400).json({ error: 'Occupancy id is required' })
    }

    const { data: occupancy, error: occupancyLoadError } = await supabaseAdmin
      .from('tenant_occupancies')
      .select('id, property_id, tenant_id, status, is_family_member, parent_occupancy_id')
      .eq('id', occupancyId)
      .maybeSingle()

    if (occupancyLoadError) throw new Error(occupancyLoadError.message)
    if (!occupancy) return res.status(404).json({ error: 'Occupancy not found' })
    if (occupancy.status === 'ended') throw new Error('Occupancy is already ended')
    if (!ACTIVE_OCCUPANCY_STATUSES.includes(occupancy.status)) {
      throw new Error('Occupancy is not active')
    }

    const endedAt = new Date().toISOString()
    const { data: endedOccupancy, error: endError } = await supabaseAdmin
      .from('tenant_occupancies')
      .update({
        status: 'ended',
        end_date: endedAt,
        end_request_status: 'completed'
      })
      .eq('id', occupancy.id)
      .select('id, property_id, tenant_id, status, end_date')
      .maybeSingle()

    if (endError) throw new Error(endError.message)
    if (!endedOccupancy) return res.status(404).json({ error: 'Occupancy not found' })

    if (occupancy.property_id) {
      throwIfError(await supabaseAdmin
        .from('properties')
        .update({ status: 'available' })
        .eq('id', occupancy.property_id))

      throwIfError(await supabaseAdmin
        .from('bookings')
        .update({ status: 'completed' })
        .eq('tenant', occupancy.tenant_id)
        .eq('property_id', occupancy.property_id)
        .in('status', BOOKING_FINALIZE_STATUSES))

      throwIfError(await supabaseAdmin
        .from('applications')
        .update({ status: 'completed' })
        .eq('tenant', occupancy.tenant_id)
        .eq('property_id', occupancy.property_id)
        .eq('status', 'accepted'))

      throwIfError(await supabaseAdmin
        .from('maintenance_requests')
        .update({ status: 'cancelled', resolved_at: endedAt })
        .eq('property_id', occupancy.property_id)
        .in('status', OPEN_MAINTENANCE_STATUSES))
    }

    const cleanedFamilyMembers = await cleanupFamilyMembers(occupancy)

    return res.status(200).json({
      success: true,
      occupancy: endedOccupancy,
      cleanedFamilyMembers
    })
  } catch (error) {
    console.error('admin/end-occupancy error:', error)
    return res.status(getStatus(error)).json({ error: error.message || 'Request failed' })
  }
}
