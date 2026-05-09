import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { getAdminProfile, getAuthenticatedUser } from '../../../lib/apiAuth'

const FREE_SLOTS = 1

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client is not configured' })
  }

  const { occupancy_id: occupancyId } = req.query
  if (!occupancyId) {
    return res.status(400).json({ error: 'occupancy_id is required' })
  }

  try {
    const user = await getAuthenticatedUser(req)
    await getAdminProfile(supabaseAdmin, user.id)

    const { data: occupancy, error: occupancyError } = await supabaseAdmin
      .from('tenant_occupancies')
      .select(`
        *,
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, email, phone, avatar_url),
        landlord:profiles!tenant_occupancies_landlord_id_fkey(id, first_name, middle_name, last_name, email, phone),
        property:properties(id, title, address, city, price, bedrooms, bathrooms, area_sqft, images, status)
      `)
      .eq('id', occupancyId)
      .maybeSingle()

    if (occupancyError) {
      return res.status(500).json({ error: occupancyError.message })
    }

    if (!occupancy) {
      return res.status(404).json({ error: 'Occupancy not found' })
    }

    const { data: familyMembers, error: familyError } = await supabaseAdmin
      .from('family_members')
      .select('id, created_at, member_profile:profiles!family_members_member_id_fkey(id, first_name, middle_name, last_name, email, phone, avatar_url, role)')
      .eq('parent_occupancy_id', occupancyId)
      .order('created_at', { ascending: true })

    if (familyError) {
      return res.status(500).json({ error: familyError.message })
    }

    let subscriptionSummary = null
    if (occupancy.tenant_id) {
      const { data: subscription, error: subscriptionError } = await supabaseAdmin
        .from('subscriptions')
        .select('id, tenant_id, plan_type, total_slots, paid_slots, status')
        .eq('tenant_id', occupancy.tenant_id)
        .maybeSingle()

      if (subscriptionError) {
        return res.status(500).json({ error: subscriptionError.message })
      }

      const usedSlots = (familyMembers || []).length
      const totalSlots = subscription?.total_slots || FREE_SLOTS
      subscriptionSummary = {
        has_subscription: !!subscription,
        plan_type: subscription?.plan_type || 'free',
        total_slots: totalSlots,
        paid_slots: subscription?.paid_slots || 0,
        used_slots: usedSlots,
        available_slots: Math.max(0, totalSlots - usedSlots),
        status: subscription?.status || 'active'
      }
    }

    return res.status(200).json({
      occupancy,
      familyMembers: familyMembers || [],
      subscription: subscriptionSummary
    })
  } catch (error) {
    console.error('admin/occupancy-details error:', error)
    const message = error.message || 'Server error'
    const status = message.includes('Only admins') ? 403 : message.includes('access token') || message.includes('Unauthorized') ? 401 : 500
    return res.status(status).json({ error: message })
  }
}
