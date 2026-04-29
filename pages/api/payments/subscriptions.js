import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const SLOT_PRICE = 1
const FREE_SLOTS = 1
const MAX_FAMILY_MEMBERS = 4

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const { tenant_id, occupancy_id } = req.query

        if (!tenant_id) {
            return res.status(400).json({ error: 'tenant_id required' })
        }

        let activeOccupancyId = occupancy_id || null
        if (!activeOccupancyId) {
            const { data: occupancy } = await supabaseAdmin
                .from('tenant_occupancies')
                .select('id')
                .eq('tenant_id', tenant_id)
                .in('status', ['active', 'pending_end'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            activeOccupancyId = occupancy?.id || null
        }

        if (!activeOccupancyId) {
            const { data: fmRecord } = await supabaseAdmin
                .from('family_members')
                .select('parent_occupancy_id')
                .eq('member_id', tenant_id)
                .limit(1)
                .maybeSingle()
            activeOccupancyId = fmRecord?.parent_occupancy_id || null
        }

        // Always look up by tenant_id — subscription is permanent per tenant
        let { data: subscription, error } = await supabaseAdmin
            .from('subscriptions')
            .select('*')
            .eq('tenant_id', tenant_id)
            .maybeSingle()

        if (error) return res.status(500).json({ error: error.message })

        // Count currently used slots for the active occupancy
        let usedSlots = 0
        if (activeOccupancyId) {
            const { data: members } = await supabaseAdmin
                .from('family_members')
                .select('id')
                .eq('parent_occupancy_id', activeOccupancyId)
            usedSlots = (members || []).length
        }

        // If no subscription exists, return default free plan info
        if (!subscription) {
            const totalSlots = Math.min(MAX_FAMILY_MEMBERS, Math.max(FREE_SLOTS, usedSlots))
            const paidSlots = Math.max(0, totalSlots - FREE_SLOTS)
            return res.status(200).json({
                subscription: null,
                plan: {
                    type: paidSlots > 0 ? 'paid' : 'free',
                    total_slots: totalSlots,
                    paid_slots: paidSlots,
                    used_slots: usedSlots,
                    available_slots: Math.max(0, totalSlots - usedSlots),
                    slot_price: SLOT_PRICE,
                    max_slots: MAX_FAMILY_MEMBERS
                }
            })
        }

        // Self-heal: reconcile slots from paid payments in case prior confirmation/webhook was missed.
        const { count: paidCount, error: paidCountErr } = await supabaseAdmin
            .from('subscription_payments')
            .select('id', { count: 'exact', head: true })
            .eq('subscription_id', subscription.id)
            .eq('status', 'paid')

        if (paidCountErr) return res.status(500).json({ error: paidCountErr.message })

        const maxPaidSlots = Math.max(0, MAX_FAMILY_MEMBERS - FREE_SLOTS)
        const reconciledPaidSlots = Math.min(Math.max(subscription.paid_slots || 0, paidCount || 0, usedSlots - FREE_SLOTS), maxPaidSlots)
        const reconciledTotalSlots = Math.min(MAX_FAMILY_MEMBERS, Math.max(FREE_SLOTS + reconciledPaidSlots, usedSlots))

        if (
            subscription.paid_slots !== reconciledPaidSlots ||
            subscription.total_slots !== reconciledTotalSlots ||
            subscription.plan_type !== (reconciledPaidSlots > 0 ? 'paid' : 'free')
        ) {
            const { data: reconciledSub, error: reconcileErr } = await supabaseAdmin
                .from('subscriptions')
                .update({
                    paid_slots: reconciledPaidSlots,
                    total_slots: reconciledTotalSlots,
                    plan_type: reconciledPaidSlots > 0 ? 'paid' : 'free'
                })
                .eq('id', subscription.id)
                .select()
                .single()

            if (reconcileErr) return res.status(500).json({ error: reconcileErr.message })
            subscription = reconciledSub
        }

        return res.status(200).json({
            subscription,
            plan: {
                type: subscription.plan_type,
                total_slots: subscription.total_slots,
                paid_slots: subscription.paid_slots,
                used_slots: usedSlots,
                available_slots: Math.max(0, subscription.total_slots - usedSlots),
                slot_price: SLOT_PRICE,
                max_slots: MAX_FAMILY_MEMBERS
            }
        })
    }

    // ─── POST: Actions (initialize, purchase-slot, etc.) ───
    if (req.method === 'POST') {
        const { action } = req.body

        // ─── INITIALIZE: Create free subscription for a TENANT ───
        if (action === 'initialize') {
            const { tenant_id } = req.body

            if (!tenant_id) {
                return res.status(400).json({ error: 'tenant_id required' })
            }

            // Check if subscription already exists for this tenant
            const { data: existing } = await supabaseAdmin
                .from('subscriptions')
                .select('*')
                .eq('tenant_id', tenant_id)
                .maybeSingle()

            if (existing) {
                return res.status(200).json({ subscription: existing, message: 'Subscription already exists' })
            }

            // Create free plan subscription (permanent — tied to tenant, not occupancy)
            const { data: subscription, error } = await supabaseAdmin
                .from('subscriptions')
                .insert({
                    tenant_id,
                    plan_type: 'free',
                    total_slots: FREE_SLOTS,
                    paid_slots: 0,
                    status: 'active'
                })
                .select()
                .single()

            if (error) return res.status(500).json({ error: error.message })

            return res.status(200).json({ subscription })
        }

        // ─── PURCHASE-SLOT: Buy an additional family member slot (₱50) ───
        if (action === 'purchase-slot') {
            const { tenant_id, payment_method, payment_reference, occupancy_id } = req.body

            if (!tenant_id) {
                return res.status(400).json({ error: 'tenant_id required' })
            }

            // Get or create subscription for this tenant
            let { data: subscription } = await supabaseAdmin
                .from('subscriptions')
                .select('*')
                .eq('tenant_id', tenant_id)
                .maybeSingle()

            if (!subscription) {
                // Auto-create free plan if none exists
                const { data: newSub, error: createErr } = await supabaseAdmin
                    .from('subscriptions')
                    .insert({
                        tenant_id,
                        plan_type: 'free',
                        total_slots: FREE_SLOTS,
                        paid_slots: 0,
                        status: 'active'
                    })
                    .select()
                    .single()

                if (createErr) return res.status(500).json({ error: createErr.message })
                subscription = newSub
            }

            // Check if max slots reached
            if (subscription.total_slots >= MAX_FAMILY_MEMBERS) {
                return res.status(400).json({ error: `Maximum ${MAX_FAMILY_MEMBERS} family member slots reached` })
            }

            // Create payment record (occupancy_id is optional, for audit only)
            const { data: payment, error: payErr } = await supabaseAdmin
                .from('subscription_payments')
                .insert({
                    subscription_id: subscription.id,
                    tenant_id,
                    occupancy_id: occupancy_id || null, // optional audit reference
                    amount: SLOT_PRICE,
                    currency: 'PHP',
                    payment_method: payment_method || 'pending',
                    payment_reference: payment_reference || null,
                    status: payment_method ? 'paid' : 'pending',
                    paid_at: payment_method ? new Date().toISOString() : null
                })
                .select()
                .single()

            if (payErr) return res.status(500).json({ error: payErr.message })

            // If payment method is provided (direct payment), upgrade the subscription immediately
            if (payment_method) {
                const newPaidSlots = subscription.paid_slots + 1
                const newTotalSlots = FREE_SLOTS + newPaidSlots

                const { data: updatedSub, error: updateErr } = await supabaseAdmin
                    .from('subscriptions')
                    .update({
                        paid_slots: newPaidSlots,
                        total_slots: newTotalSlots,
                        plan_type: newPaidSlots > 0 ? 'paid' : 'free'
                    })
                    .eq('id', subscription.id)
                    .select()
                    .single()

                if (updateErr) return res.status(500).json({ error: updateErr.message })

                return res.status(200).json({
                    success: true,
                    subscription: updatedSub,
                    payment,
                    message: `Family member slot purchased! You now have ${newTotalSlots} slot(s).`
                })
            }

            // If no payment method, return pending payment for further processing
            return res.status(200).json({
                success: true,
                payment,
                subscription,
                requires_payment: true,
                amount: SLOT_PRICE,
                message: 'Payment required to unlock additional slot'
            })
        }

        // ─── CONFIRM-PAYMENT: Called after PayMongo/external payment success ───
        if (action === 'confirm-payment') {
            const { payment_id, payment_reference, payment_method } = req.body

            if (!payment_id) {
                return res.status(400).json({ error: 'payment_id required' })
            }

            // Get payment (allow pending OR already-paid to keep this endpoint idempotent)
            const { data: payment, error: paymentErr } = await supabaseAdmin
                .from('subscription_payments')
                .select('*, subscription:subscriptions(*)')
                .eq('id', payment_id)
                .maybeSingle()

            if (paymentErr) {
                return res.status(500).json({ error: paymentErr.message })
            }

            if (!payment) {
                return res.status(404).json({ error: 'Payment not found' })
            }

            if (!payment.subscription?.id) {
                return res.status(400).json({ error: 'Subscription not found for payment' })
            }

            // Mark as paid if still pending.
            if (payment.status !== 'paid') {
                await supabaseAdmin
                    .from('subscription_payments')
                    .update({
                        status: 'paid',
                        payment_method: payment_method || 'paymongo',
                        payment_reference: payment_reference || payment.payment_reference || null,
                        paid_at: new Date().toISOString()
                    })
                    .eq('id', payment_id)
            }

            // Reconcile slots from the source of truth: all paid subscription payments.
            const { count: paidCount, error: paidCountErr } = await supabaseAdmin
                .from('subscription_payments')
                .select('id', { count: 'exact', head: true })
                .eq('subscription_id', payment.subscription.id)
                .eq('status', 'paid')

            if (paidCountErr) {
                return res.status(500).json({ error: paidCountErr.message })
            }

            const maxPaidSlots = Math.max(0, MAX_FAMILY_MEMBERS - FREE_SLOTS)
            const newPaidSlots = Math.min(paidCount || 0, maxPaidSlots)
            const newTotalSlots = Math.min(MAX_FAMILY_MEMBERS, FREE_SLOTS + newPaidSlots)

            const { data: updatedSub, error: updateErr } = await supabaseAdmin
                .from('subscriptions')
                .update({
                    paid_slots: newPaidSlots,
                    total_slots: newTotalSlots,
                    plan_type: newPaidSlots > 0 ? 'paid' : 'free'
                })
                .eq('id', payment.subscription.id)
                .select()
                .single()

            if (updateErr) return res.status(500).json({ error: updateErr.message })

            return res.status(200).json({
                success: true,
                subscription: updatedSub,
                message: `Slot unlocked! You now have ${newTotalSlots} family member slot(s).`
            })
        }

        // ─── GET-PAYMENT-HISTORY: Get all subscription payments for a tenant ───
        if (action === 'payment-history') {
            const { tenant_id } = req.body

            if (!tenant_id) {
                return res.status(400).json({ error: 'tenant_id required' })
            }

            const { data, error } = await supabaseAdmin
                .from('subscription_payments')
                .select('*')
                .eq('tenant_id', tenant_id)
                .order('created_at', { ascending: false })

            if (error) return res.status(500).json({ error: error.message })

            return res.status(200).json({ payments: data || [] })
        }

        // ─── CHECK-CAN-ADD: Check if tenant can add another family member ───
        if (action === 'check-can-add') {
            const { tenant_id, occupancy_id } = req.body

            if (!tenant_id || !occupancy_id) {
                return res.status(400).json({ error: 'tenant_id and occupancy_id required' })
            }

            // Get tenant's permanent subscription
            const { data: subscription } = await supabaseAdmin
                .from('subscriptions')
                .select('*')
                .eq('tenant_id', tenant_id)
                .maybeSingle()

            // Count current family members for THIS occupancy
            const { data: members } = await supabaseAdmin
                .from('family_members')
                .select('id')
                .eq('parent_occupancy_id', occupancy_id)

            const usedSlots = (members || []).length
            const totalSlots = Math.min(MAX_FAMILY_MEMBERS, Math.max(subscription?.total_slots || FREE_SLOTS, usedSlots))
            const canAdd = usedSlots < totalSlots
            const needsPayment = usedSlots >= totalSlots && totalSlots < MAX_FAMILY_MEMBERS
            const maxReached = totalSlots >= MAX_FAMILY_MEMBERS && usedSlots >= MAX_FAMILY_MEMBERS

            return res.status(200).json({
                can_add: canAdd,
                needs_payment: needsPayment,
                max_reached: maxReached,
                used_slots: usedSlots,
                total_slots: totalSlots,
                slot_price: SLOT_PRICE,
                max_slots: MAX_FAMILY_MEMBERS
            })
        }

        // ─── CANCEL-PAYMENT: Cancel a pending subscription payment ───
        if (action === 'cancel-payment') {
            const { tenant_id } = req.body

            if (!tenant_id) {
                return res.status(400).json({ error: 'tenant_id required' })
            }

            // Cancel all pending subscription payments for this tenant
            const { data, error } = await supabaseAdmin
                .from('subscription_payments')
                .update({ status: 'cancelled' })
                .eq('tenant_id', tenant_id)
                .eq('status', 'pending')
                .select()

            if (error) return res.status(500).json({ error: error.message })

            return res.status(200).json({
                success: true,
                cancelled_count: (data || []).length,
                message: 'Pending payments cancelled'
            })
        }

        return res.status(400).json({ error: 'Invalid action' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
