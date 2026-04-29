import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const SLOT_PRICE = 50         // ₱50 per additional slot
const FREE_SLOTS = 3          // 3 free property slots
const MAX_PROPERTY_SLOTS = 10 // Maximum 10 slots total

export default async function handler(req, res) {
    // ─── GET: Fetch landlord's subscription & slot info ───
    if (req.method === 'GET') {
        const { landlord_id } = req.query

        if (!landlord_id) {
            return res.status(400).json({ error: 'landlord_id required' })
        }

        // Get subscription
        let { data: subscription, error } = await supabaseAdmin
            .from('landlord_subscriptions')
            .select('*')
            .eq('landlord_id', landlord_id)
            .maybeSingle()

        if (error) return res.status(500).json({ error: error.message })

        // Count current properties
        const { count: propertyCount, error: countErr } = await supabaseAdmin
            .from('properties')
            .select('id', { count: 'exact', head: true })
            .eq('landlord', landlord_id)
            .eq('is_deleted', false)

        if (countErr) return res.status(500).json({ error: countErr.message })

        const usedSlots = propertyCount || 0

        // If no subscription exists, return default free plan info
        if (!subscription) {
            const totalSlots = Math.min(MAX_PROPERTY_SLOTS, Math.max(FREE_SLOTS, usedSlots))
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
                    max_slots: MAX_PROPERTY_SLOTS
                }
            })
        }

        // Self-heal: reconcile slots from paid payments
        const { count: paidCount, error: paidCountErr } = await supabaseAdmin
            .from('landlord_slot_payments')
            .select('id', { count: 'exact', head: true })
            .eq('subscription_id', subscription.id)
            .eq('status', 'paid')

        if (paidCountErr) return res.status(500).json({ error: paidCountErr.message })

        const maxPaidSlots = Math.max(0, MAX_PROPERTY_SLOTS - FREE_SLOTS)
        const reconciledPaidSlots = Math.min(Math.max(subscription.paid_slots || 0, paidCount || 0, usedSlots - FREE_SLOTS), maxPaidSlots)
        const reconciledTotalSlots = Math.min(MAX_PROPERTY_SLOTS, Math.max(FREE_SLOTS + reconciledPaidSlots, usedSlots))

        if (
            subscription.paid_slots !== reconciledPaidSlots ||
            subscription.total_slots !== reconciledTotalSlots ||
            subscription.plan_type !== (reconciledPaidSlots > 0 ? 'paid' : 'free')
        ) {
            const { data: reconciledSub, error: reconcileErr } = await supabaseAdmin
                .from('landlord_subscriptions')
                .update({
                    paid_slots: reconciledPaidSlots,
                    total_slots: reconciledTotalSlots,
                    plan_type: reconciledPaidSlots > 0 ? 'paid' : 'free',
                    updated_at: new Date().toISOString()
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
                max_slots: MAX_PROPERTY_SLOTS
            }
        })
    }

    // ─── POST: Actions ───
    if (req.method === 'POST') {
        const { action } = req.body

        // ─── INITIALIZE: Create free subscription for a landlord ───
        if (action === 'initialize') {
            const { landlord_id } = req.body

            if (!landlord_id) {
                return res.status(400).json({ error: 'landlord_id required' })
            }

            const { data: existing } = await supabaseAdmin
                .from('landlord_subscriptions')
                .select('*')
                .eq('landlord_id', landlord_id)
                .maybeSingle()

            if (existing) {
                return res.status(200).json({ subscription: existing, message: 'Subscription already exists' })
            }

            const { data: subscription, error } = await supabaseAdmin
                .from('landlord_subscriptions')
                .insert({
                    landlord_id,
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

        // ─── PURCHASE-SLOT: Buy an additional property slot (₱50) ───
        if (action === 'purchase-slot') {
            const { landlord_id, payment_method, payment_reference } = req.body

            if (!landlord_id) {
                return res.status(400).json({ error: 'landlord_id required' })
            }

            // Get or create subscription
            let { data: subscription } = await supabaseAdmin
                .from('landlord_subscriptions')
                .select('*')
                .eq('landlord_id', landlord_id)
                .maybeSingle()

            if (!subscription) {
                const { data: newSub, error: createErr } = await supabaseAdmin
                    .from('landlord_subscriptions')
                    .insert({
                        landlord_id,
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

            const { count: propertyCountForPurchase, error: propertyCountForPurchaseErr } = await supabaseAdmin
                .from('properties')
                .select('id', { count: 'exact', head: true })
                .eq('landlord', landlord_id)
                .eq('is_deleted', false)

            if (propertyCountForPurchaseErr) return res.status(500).json({ error: propertyCountForPurchaseErr.message })

            const usedSlotsForPurchase = propertyCountForPurchase || 0
            const currentTotalSlots = Math.min(MAX_PROPERTY_SLOTS, Math.max(subscription.total_slots || FREE_SLOTS, usedSlotsForPurchase))

            if (currentTotalSlots >= MAX_PROPERTY_SLOTS) {
                return res.status(400).json({ error: `Maximum ${MAX_PROPERTY_SLOTS} property slots reached` })
            }

            // Create payment record
            const { data: payment, error: payErr } = await supabaseAdmin
                .from('landlord_slot_payments')
                .insert({
                    subscription_id: subscription.id,
                    landlord_id,
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

            // If payment method is provided, upgrade immediately
            if (payment_method) {
                const newTotalSlots = Math.min(MAX_PROPERTY_SLOTS, currentTotalSlots + 1)
                const newPaidSlots = Math.max(0, newTotalSlots - FREE_SLOTS)

                const { data: updatedSub, error: updateErr } = await supabaseAdmin
                    .from('landlord_subscriptions')
                    .update({
                        paid_slots: newPaidSlots,
                        total_slots: newTotalSlots,
                        plan_type: 'paid',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', subscription.id)
                    .select()
                    .single()

                if (updateErr) return res.status(500).json({ error: updateErr.message })

                return res.status(200).json({
                    success: true,
                    subscription: updatedSub,
                    payment,
                    message: `Property slot purchased! You now have ${newTotalSlots} slot(s).`
                })
            }

            return res.status(200).json({
                success: true,
                payment,
                subscription,
                requires_payment: true,
                amount: SLOT_PRICE,
                message: 'Payment required to unlock additional property slot'
            })
        }

        // ─── CONFIRM-PAYMENT: After PayMongo payment success ───
        if (action === 'confirm-payment') {
            const { payment_id, payment_reference, payment_method } = req.body

            if (!payment_id) {
                return res.status(400).json({ error: 'payment_id required' })
            }

            const { data: payment, error: paymentErr } = await supabaseAdmin
                .from('landlord_slot_payments')
                .select('*, subscription:landlord_subscriptions(*)')
                .eq('id', payment_id)
                .maybeSingle()

            if (paymentErr) return res.status(500).json({ error: paymentErr.message })
            if (!payment) return res.status(404).json({ error: 'Payment not found' })
            if (!payment.subscription?.id) return res.status(400).json({ error: 'Subscription not found for payment' })

            // Mark as paid if still pending
            if (payment.status !== 'paid') {
                await supabaseAdmin
                    .from('landlord_slot_payments')
                    .update({
                        status: 'paid',
                        payment_method: payment_method || 'paymongo',
                        payment_reference: payment_reference || payment.payment_reference || null,
                        paid_at: new Date().toISOString()
                    })
                    .eq('id', payment_id)
            }

            // Reconcile slots
            const { count: paidCount, error: paidCountErr } = await supabaseAdmin
                .from('landlord_slot_payments')
                .select('id', { count: 'exact', head: true })
                .eq('subscription_id', payment.subscription.id)
                .eq('status', 'paid')

            if (paidCountErr) return res.status(500).json({ error: paidCountErr.message })

            const { count: propertyCountForConfirm, error: propertyCountForConfirmErr } = await supabaseAdmin
                .from('properties')
                .select('id', { count: 'exact', head: true })
                .eq('landlord', payment.landlord_id)
                .eq('is_deleted', false)

            if (propertyCountForConfirmErr) return res.status(500).json({ error: propertyCountForConfirmErr.message })

            const usedSlotsForConfirm = propertyCountForConfirm || 0
            const maxPaidSlots = Math.max(0, MAX_PROPERTY_SLOTS - FREE_SLOTS)
            const newPaidSlots = Math.min(Math.max(payment.subscription.paid_slots || 0, paidCount || 0, usedSlotsForConfirm - FREE_SLOTS), maxPaidSlots)
            const newTotalSlots = Math.min(MAX_PROPERTY_SLOTS, Math.max(FREE_SLOTS + newPaidSlots, usedSlotsForConfirm))

            const { data: updatedSub, error: updateErr } = await supabaseAdmin
                .from('landlord_subscriptions')
                .update({
                    paid_slots: newPaidSlots,
                    total_slots: newTotalSlots,
                    plan_type: newPaidSlots > 0 ? 'paid' : 'free',
                    updated_at: new Date().toISOString()
                })
                .eq('id', payment.subscription.id)
                .select()
                .single()

            if (updateErr) return res.status(500).json({ error: updateErr.message })

            return res.status(200).json({
                success: true,
                subscription: updatedSub,
                message: `Property slot unlocked! You now have ${newTotalSlots} slot(s).`
            })
        }

        // ─── CHECK-CAN-ADD: Check if landlord can add another property ───
        if (action === 'check-can-add') {
            const { landlord_id } = req.body

            if (!landlord_id) {
                return res.status(400).json({ error: 'landlord_id required' })
            }

            const { data: subscription } = await supabaseAdmin
                .from('landlord_subscriptions')
                .select('*')
                .eq('landlord_id', landlord_id)
                .maybeSingle()

            const { count: propertyCount } = await supabaseAdmin
                .from('properties')
                .select('id', { count: 'exact', head: true })
                .eq('landlord', landlord_id)
                .eq('is_deleted', false)

            const usedSlots = propertyCount || 0
            const totalSlots = Math.min(MAX_PROPERTY_SLOTS, Math.max(subscription?.total_slots || FREE_SLOTS, usedSlots))
            const canAdd = usedSlots < totalSlots
            const needsPayment = usedSlots >= totalSlots && totalSlots < MAX_PROPERTY_SLOTS
            const maxReached = totalSlots >= MAX_PROPERTY_SLOTS && usedSlots >= MAX_PROPERTY_SLOTS

            return res.status(200).json({
                can_add: canAdd,
                needs_payment: needsPayment,
                max_reached: maxReached,
                used_slots: usedSlots,
                total_slots: totalSlots,
                slot_price: SLOT_PRICE,
                max_slots: MAX_PROPERTY_SLOTS
            })
        }

        // ─── PAYMENT-HISTORY ───
        if (action === 'payment-history') {
            const { landlord_id } = req.body

            if (!landlord_id) {
                return res.status(400).json({ error: 'landlord_id required' })
            }

            const { data, error } = await supabaseAdmin
                .from('landlord_slot_payments')
                .select('*')
                .eq('landlord_id', landlord_id)
                .order('created_at', { ascending: false })

            if (error) return res.status(500).json({ error: error.message })

            return res.status(200).json({ payments: data || [] })
        }

        return res.status(400).json({ error: 'Invalid action' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
