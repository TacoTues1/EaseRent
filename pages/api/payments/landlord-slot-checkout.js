    import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const SLOT_PRICE = 50
const FREE_SLOTS = 3
const MAX_PROPERTY_SLOTS = 10

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST'])
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` })
    }

    const { landlord_id, allowedMethods, redirect_to } = req.body

    if (!landlord_id) {
        return res.status(400).json({ error: 'landlord_id required' })
    }

    if (!process.env.PAYMONGO_SECRET_KEY) {
        return res.status(500).json({ error: 'PayMongo Secret Key is missing. Set PAYMONGO_SECRET_KEY in .env.local' })
    }

    const { data: landlord } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('id', landlord_id)
        .single()

    if (!landlord) {
        return res.status(404).json({ error: 'Landlord not found' })
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

    if (subscription.total_slots >= MAX_PROPERTY_SLOTS) {
        return res.status(400).json({ error: `Maximum ${MAX_PROPERTY_SLOTS} property slots already reached` })
    }

    // Create pending payment record
    const { data: payment, error: payErr } = await supabaseAdmin
        .from('landlord_slot_payments')
        .insert({
            subscription_id: subscription.id,
            landlord_id,
            amount: SLOT_PRICE,
            currency: 'PHP',
            payment_method: 'paymongo',
            status: 'pending'
        })
        .select()
        .single()

    if (payErr) return res.status(500).json({ error: payErr.message })

    const encoded = Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64')
    const amountInCentavos = Math.round(SLOT_PRICE * 100)

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'https://www.abalay-rent.me')

    const cleanBaseUrl = baseUrl.replace(/\/+$/, '')

    const successUrl = redirect_to === 'settings'
        ? `${cleanBaseUrl}/settings?landlord_slot_success=true&landlord_payment_id=${payment.id}`
        : `${cleanBaseUrl}/dashboard?slot_purchase_success=true&payment_id=${payment.id}`
    const cancelUrl = redirect_to === 'settings'
        ? `${cleanBaseUrl}/settings?landlord_slot_cancelled=true`
        : `${cleanBaseUrl}/dashboard?slot_purchase_cancelled=true`

    const landlordName = `${landlord.first_name || ''} ${landlord.last_name || ''}`.trim()
    const paymentMethodTypes = allowedMethods && allowedMethods.length > 0
        ? allowedMethods
        : ['gcash', 'paymaya', 'card', 'qrph', 'grab_pay']

    try {
        const checkoutResponse = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                authorization: `Basic ${encoded}`
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        send_email_receipt: false,
                        show_description: true,
                        show_line_items: true,
                        description: `Property Slot - Additional property slot for ${landlordName}`,
                        line_items: [
                            {
                                currency: 'PHP',
                                amount: amountInCentavos,
                                name: 'Property Slot (+1)',
                                description: 'Additional property listing slot for your Abalay Rent landlord account',
                                quantity: 1
                            }
                        ],
                        payment_method_types: paymentMethodTypes,
                        success_url: successUrl,
                        cancel_url: cancelUrl,
                        metadata: {
                            type: 'landlord_property_slot',
                            landlord_slot_payment_id: payment.id,
                            landlord_subscription_id: subscription.id,
                            landlord_id: landlord_id
                        }
                    }
                }
            })
        })

        const checkoutData = await checkoutResponse.json()

        if (checkoutData.errors) {
            console.error('PayMongo Checkout Error:', JSON.stringify(checkoutData.errors, null, 2))

            await supabaseAdmin
                .from('landlord_slot_payments')
                .update({ status: 'failed' })
                .eq('id', payment.id)

            throw new Error(checkoutData.errors[0]?.detail || 'PayMongo checkout creation failed')
        }

        const checkoutUrl = checkoutData.data?.attributes?.checkout_url
        const checkoutSessionId = checkoutData.data?.id

        await supabaseAdmin
            .from('landlord_slot_payments')
            .update({ payment_reference: checkoutSessionId })
            .eq('id', payment.id)

        return res.status(200).json({
            checkoutUrl,
            checkoutSessionId,
            payment_id: payment.id,
            subscription_id: subscription.id
        })

    } catch (error) {
        console.error('Landlord Slot Checkout Error:', error)
        return res.status(500).json({ error: error.message })
    }
}
