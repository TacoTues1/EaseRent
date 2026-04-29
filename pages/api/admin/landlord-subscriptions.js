import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const SLOT_PRICE = 50
const FREE_SLOTS = 3
const MAX_PROPERTY_SLOTS = 10

function normalizeIdList(ids) {
  return Array.from(new Set((ids || []).filter(Boolean)))
}

async function getLandlordUsedPropertySlots(landlordId) {
  const { count, error } = await supabaseAdmin
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('landlord', landlordId)
    .eq('is_deleted', false)

  if (error) throw error
  return count || 0
}

async function getLatestPaidLandlordSlotPayment(subscriptionId) {
  const { data: adminPayment, error: adminPaymentError } = await supabaseAdmin
    .from('landlord_slot_payments')
    .select('id')
    .eq('subscription_id', subscriptionId)
    .eq('status', 'paid')
    .eq('payment_method', 'admin')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (adminPaymentError) throw adminPaymentError
  if (adminPayment) return adminPayment

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('landlord_slot_payments')
    .select('id')
    .eq('subscription_id', subscriptionId)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (paymentError) throw paymentError
  return payment
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client is not configured' })
  }

  const { action } = req.body || {}

  try {
    if (action === 'stats') {
      const landlordIds = normalizeIdList(req.body.landlordIds)
      if (!landlordIds.length) {
        return res.status(200).json({ stats: {} })
      }

      const { data: subscriptions, error: subscriptionError } = await supabaseAdmin
        .from('landlord_subscriptions')
        .select('id, landlord_id, plan_type, total_slots, paid_slots, status')
        .in('landlord_id', landlordIds)

      if (subscriptionError) {
        return res.status(500).json({ error: subscriptionError.message })
      }

      const subscriptionByLandlord = Object.fromEntries((subscriptions || []).map((s) => [s.landlord_id, s]))
      const subscriptionIds = (subscriptions || []).map((s) => s.id).filter(Boolean)

      let paidPayments = []
      if (subscriptionIds.length) {
        const { data: paymentData, error: paymentError } = await supabaseAdmin
          .from('landlord_slot_payments')
          .select('id, subscription_id, landlord_id')
          .in('subscription_id', subscriptionIds)
          .eq('status', 'paid')

        if (paymentError) {
          return res.status(500).json({ error: paymentError.message })
        }

        paidPayments = paymentData || []
      }

      const paidSlotsByLandlord = {}
      for (const payment of paidPayments) {
        paidSlotsByLandlord[payment.landlord_id] = (paidSlotsByLandlord[payment.landlord_id] || 0) + 1
      }

      const { data: propertyRows, error: propertyError } = await supabaseAdmin
        .from('properties')
        .select('id, landlord')
        .in('landlord', landlordIds)
        .eq('is_deleted', false)

      if (propertyError) {
        return res.status(500).json({ error: propertyError.message })
      }

      const usedSlotsByLandlord = {}
      for (const property of propertyRows || []) {
        usedSlotsByLandlord[property.landlord] = (usedSlotsByLandlord[property.landlord] || 0) + 1
      }

      const maxPaidSlots = Math.max(0, MAX_PROPERTY_SLOTS - FREE_SLOTS)
      const stats = {}

      for (const landlordId of landlordIds) {
        const subscription = subscriptionByLandlord[landlordId] || null
        const usedSlots = usedSlotsByLandlord[landlordId] || 0
        const paidSlots = Math.min(
          Math.max(subscription?.paid_slots || 0, paidSlotsByLandlord[landlordId] || 0, usedSlots - FREE_SLOTS),
          maxPaidSlots
        )
        const totalSlots = Math.min(MAX_PROPERTY_SLOTS, Math.max(FREE_SLOTS + paidSlots, usedSlots))

        stats[landlordId] = {
          has_subscription: !!subscription,
          plan_type: paidSlots > 0 ? 'paid' : (subscription?.plan_type || 'free'),
          status: subscription?.status || 'active',
          total_slots: totalSlots,
          paid_slots: paidSlots,
          used_slots: usedSlots,
          available_slots: Math.max(0, totalSlots - usedSlots),
          max_slots: MAX_PROPERTY_SLOTS
        }
      }

      return res.status(200).json({ stats })
    }

    if (action === 'add-slot') {
      const { landlordId } = req.body || {}
      if (!landlordId) {
        return res.status(400).json({ error: 'landlordId is required' })
      }

      const { data: landlord, error: landlordError } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', landlordId)
        .eq('is_deleted', false)
        .maybeSingle()

      if (landlordError) {
        return res.status(500).json({ error: landlordError.message })
      }

      if (!landlord || landlord.role !== 'landlord') {
        return res.status(400).json({ error: 'User is not an active landlord' })
      }

      let { data: subscription, error: subscriptionError } = await supabaseAdmin
        .from('landlord_subscriptions')
        .select('*')
        .eq('landlord_id', landlordId)
        .maybeSingle()

      if (subscriptionError) {
        return res.status(500).json({ error: subscriptionError.message })
      }

      if (!subscription) {
        const { data: createdSubscription, error: createError } = await supabaseAdmin
          .from('landlord_subscriptions')
          .insert({
            landlord_id: landlordId,
            plan_type: 'free',
            total_slots: FREE_SLOTS,
            paid_slots: 0,
            status: 'active'
          })
          .select()
          .single()

        if (createError) {
          return res.status(500).json({ error: createError.message })
        }

        subscription = createdSubscription
      }

      const { count: paidCount, error: paidCountError } = await supabaseAdmin
        .from('landlord_slot_payments')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_id', subscription.id)
        .eq('status', 'paid')

      if (paidCountError) {
        return res.status(500).json({ error: paidCountError.message })
      }

      const maxPaidSlots = Math.max(0, MAX_PROPERTY_SLOTS - FREE_SLOTS)
      const usedSlots = await getLandlordUsedPropertySlots(landlordId)
      const currentPaidSlots = Math.min(Math.max(subscription.paid_slots || 0, paidCount || 0, usedSlots - FREE_SLOTS), maxPaidSlots)
      const currentTotalSlots = Math.min(MAX_PROPERTY_SLOTS, Math.max(FREE_SLOTS + currentPaidSlots, usedSlots))

      if (currentTotalSlots >= MAX_PROPERTY_SLOTS) {
        return res.status(400).json({ error: `Maximum ${MAX_PROPERTY_SLOTS} property slots reached` })
      }

      const { error: paymentError } = await supabaseAdmin
        .from('landlord_slot_payments')
        .insert({
          subscription_id: subscription.id,
          landlord_id: landlordId,
          amount: SLOT_PRICE,
          currency: 'PHP',
          payment_method: 'admin',
          payment_reference: `admin-${Date.now()}`,
          status: 'paid',
          paid_at: new Date().toISOString()
        })

      if (paymentError) {
        return res.status(500).json({ error: paymentError.message })
      }

      const updatedTotalSlots = Math.min(MAX_PROPERTY_SLOTS, currentTotalSlots + 1)
      const updatedPaidSlots = Math.min(maxPaidSlots, Math.max(0, updatedTotalSlots - FREE_SLOTS))

      const { data: updatedSubscription, error: updateError } = await supabaseAdmin
        .from('landlord_subscriptions')
        .update({
          total_slots: updatedTotalSlots,
          paid_slots: updatedPaidSlots,
          plan_type: updatedPaidSlots > 0 ? 'paid' : 'free',
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id)
        .select()
        .single()

      if (updateError) {
        return res.status(500).json({ error: updateError.message })
      }

      return res.status(200).json({
        success: true,
        subscription: updatedSubscription,
        message: `Property slot added. Total slots: ${updatedTotalSlots}`
      })
    }

    if (action === 'remove-slot') {
      const { landlordId } = req.body || {}
      if (!landlordId) {
        return res.status(400).json({ error: 'landlordId is required' })
      }

      const { data: landlord, error: landlordError } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', landlordId)
        .eq('is_deleted', false)
        .maybeSingle()

      if (landlordError) {
        return res.status(500).json({ error: landlordError.message })
      }

      if (!landlord || landlord.role !== 'landlord') {
        return res.status(400).json({ error: 'User is not an active landlord' })
      }

      const { data: subscription, error: subscriptionError } = await supabaseAdmin
        .from('landlord_subscriptions')
        .select('*')
        .eq('landlord_id', landlordId)
        .maybeSingle()

      if (subscriptionError) {
        return res.status(500).json({ error: subscriptionError.message })
      }

      if (!subscription) {
        return res.status(400).json({ error: `Minimum ${FREE_SLOTS} free property slots reached` })
      }

      const { count: paidCount, error: paidCountError } = await supabaseAdmin
        .from('landlord_slot_payments')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_id', subscription.id)
        .eq('status', 'paid')

      if (paidCountError) {
        return res.status(500).json({ error: paidCountError.message })
      }

      const maxPaidSlots = Math.max(0, MAX_PROPERTY_SLOTS - FREE_SLOTS)
      const usedSlots = await getLandlordUsedPropertySlots(landlordId)
      const currentPaidSlots = Math.min(Math.max(subscription.paid_slots || 0, paidCount || 0, usedSlots - FREE_SLOTS), maxPaidSlots)
      const currentTotalSlots = Math.min(MAX_PROPERTY_SLOTS, Math.max(FREE_SLOTS + currentPaidSlots, usedSlots))

      if (currentTotalSlots <= FREE_SLOTS) {
        return res.status(400).json({ error: `Minimum ${FREE_SLOTS} free property slots reached` })
      }

      const availableSlots = currentTotalSlots - usedSlots
      if (availableSlots <= 0) {
        return res.status(400).json({ error: 'All property slots are occupied. Remove a property before removing a slot.' })
      }

      const updatedTotalSlots = currentTotalSlots - 1
      if (updatedTotalSlots < usedSlots) {
        return res.status(400).json({ error: `Cannot remove occupied property slot(s). ${usedSlots} slot(s) are in use.` })
      }

      const paymentToCancel = await getLatestPaidLandlordSlotPayment(subscription.id)
      if (paymentToCancel?.id) {
        const { error: cancelPaymentError } = await supabaseAdmin
          .from('landlord_slot_payments')
          .update({ status: 'cancelled' })
          .eq('id', paymentToCancel.id)

        if (cancelPaymentError) {
          return res.status(500).json({ error: cancelPaymentError.message })
        }
      }

      const updatedPaidSlots = Math.max(0, currentPaidSlots - 1)

      const { data: updatedSubscription, error: updateError } = await supabaseAdmin
        .from('landlord_subscriptions')
        .update({
          total_slots: updatedTotalSlots,
          paid_slots: updatedPaidSlots,
          plan_type: updatedPaidSlots > 0 ? 'paid' : 'free',
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id)
        .select()
        .single()

      if (updateError) {
        return res.status(500).json({ error: updateError.message })
      }

      return res.status(200).json({
        success: true,
        subscription: updatedSubscription,
        message: `Property slot removed. Total slots: ${updatedTotalSlots}`
      })
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (error) {
    console.error('admin/landlord-subscriptions error:', error)
    return res.status(500).json({ error: error.message || 'Server error' })
  }
}
