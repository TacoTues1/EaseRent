import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const SLOT_PRICE = 1

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST'])
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` })
    }

    const { tenant_id, occupancy_id } = req.body

    if (!tenant_id) {
        return res.status(400).json({ error: 'tenant_id required' })
    }

    if (!process.env.PAYMONGO_SECRET_KEY_LIVE) {
        return res.status(500).json({ error: 'PayMongo Live Secret Key is missing. Set PAYMONGO_SECRET_KEY_LIVE in .env.local' })
    }

    const { data: tenant } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('id', tenant_id)
        .single()

    if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' })
    }

    let { data: subscription } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('tenant_id', tenant_id)
        .maybeSingle()

    if (!subscription) {
        const { data: newSub, error: createErr } = await supabaseAdmin
            .from('subscriptions')
            .insert({
                tenant_id,
                plan_type: 'free',
                total_slots: 1,
                paid_slots: 0,
                status: 'active'
            })
            .select()
            .single()

        if (createErr) return res.status(500).json({ error: createErr.message })
        subscription = newSub
    }

    if (subscription.total_slots >= 4) {
        return res.status(400).json({ error: 'Maximum 4 family member slots already reached' })
    }

    const { data: payment, error: payErr } = await supabaseAdmin
        .from('subscription_payments')
        .insert({
            subscription_id: subscription.id,
            tenant_id,
            occupancy_id: occupancy_id || null,
            amount: SLOT_PRICE,
            currency: 'PHP',
            payment_method: 'paymongo_qrph',
            status: 'pending'
        })
        .select()
        .single()

    if (payErr) return res.status(500).json({ error: payErr.message })

    const encoded = Buffer.from(`${process.env.PAYMONGO_SECRET_KEY_LIVE}:`).toString('base64')
    const amountInCentavos = Math.round(SLOT_PRICE * 100)

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000')

    const cleanBaseUrl = baseUrl.replace(/\/+$/, '')

    const successUrl = `${cleanBaseUrl}/settings?subscription_success=true&payment_id=${payment.id}`
    const cancelUrl = `${cleanBaseUrl}/settings?subscription_cancelled=true`

    const tenantName = `${tenant.first_name || ''} ${tenant.last_name || ''}`.trim()

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
                        description: `Family Member Slot - Additional slot for ${tenantName}`,
                        line_items: [
                            {
                                currency: 'PHP',
                                amount: amountInCentavos,
                                name: 'Family Member Slot (+1)',
                                description: 'Additional family member slot for your Abalay Rent occupancy',
                                quantity: 1
                            }
                        ],
                        payment_method_types: ['qrph'],
                        success_url: successUrl,
                        cancel_url: cancelUrl,
                        metadata: {
                            type: 'subscription_slot',
                            subscription_payment_id: payment.id,
                            subscription_id: subscription.id,
                            tenant_id: tenant_id
                        }
                    }
                }
            })
        })

        const checkoutData = await checkoutResponse.json()

        if (checkoutData.errors) {
            console.error('PayMongo Checkout Error:', JSON.stringify(checkoutData.errors, null, 2))

            await supabaseAdmin
                .from('subscription_payments')
                .update({ status: 'failed' })
                .eq('id', payment.id)

            throw new Error(checkoutData.errors[0]?.detail || 'PayMongo checkout creation failed')
        }

        const checkoutUrl = checkoutData.data?.attributes?.checkout_url
        const checkoutSessionId = checkoutData.data?.id

        await supabaseAdmin
            .from('subscription_payments')
            .update({ payment_reference: checkoutSessionId })
            .eq('id', payment.id)

        return res.status(200).json({
            checkoutUrl,
            checkoutSessionId,
            payment_id: payment.id,
            subscription_id: subscription.id
        })

    } catch (error) {
        console.error('Subscription Checkout Error:', error)
        return res.status(500).json({ error: error.message })
    }
}
