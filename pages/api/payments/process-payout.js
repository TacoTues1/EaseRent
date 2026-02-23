import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Process Payout to Landlord
 * 
 * Flow:
 * 1. Tenant pays via PayMongo (GCash/Maya) → money goes to system's PayMongo account
 * 2. System verifies payment and deducts 1% platform fee
 * 3. System sends 99% to landlord's GCash/Maya via PayMongo Payout API
 * 
 * PayMongo Payout API: https://developers.paymongo.com/reference/create-a-payout
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { payoutId } = req.body;

    if (!payoutId) {
        return res.status(400).json({ error: 'Missing payoutId' });
    }

    try {
        // 1. Get payout record
        const { data: payout, error: payoutError } = await supabase
            .from('payouts')
            .select('*')
            .eq('id', payoutId)
            .single();

        if (payoutError || !payout) {
            return res.status(404).json({ error: 'Payout record not found' });
        }

        // Skip if already completed or processing
        if (payout.status === 'completed' || payout.status === 'processing') {
            return res.status(200).json({ success: true, message: `Payout already ${payout.status}` });
        }

        // Skip if no destination
        if (!payout.payout_destination) {
            await supabase.from('payouts').update({
                status: 'manual_required',
                error_message: 'No payout destination configured for landlord'
            }).eq('id', payoutId);
            return res.status(200).json({ success: false, message: 'No payout destination - manual transfer required' });
        }

        // 2. Mark as processing
        await supabase.from('payouts').update({ status: 'processing' }).eq('id', payoutId);

        // 3. Send payout via PayMongo
        const encoded = Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');
        const amountInCentavos = Math.round(payout.payout_amount * 100);

        // Determine the payout channel based on method
        const payoutChannel = payout.payout_method === 'maya' ? 'paymaya' : 'gcash';

        console.log(`Processing payout: ₱${payout.payout_amount} to ${payoutChannel} (${payout.payout_destination})`);

        // Try PayMongo Payout API
        const payoutResponse = await fetch('https://api.paymongo.com/v1/payouts', {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                authorization: `Basic ${encoded}`
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        amount: amountInCentavos,
                        description: `Rental payment payout - ${payout.payment_request_id}`,
                        metadata: {
                            payout_id: payoutId,
                            payment_request_id: payout.payment_request_id,
                            landlord_id: payout.landlord_id
                        },
                        payout_type: payoutChannel,
                        // For e-wallet payouts
                        ...(payoutChannel === 'gcash' || payoutChannel === 'paymaya' ? {
                            mobile_number: payout.payout_destination
                        } : {})
                    }
                }
            })
        });

        const payoutData = await payoutResponse.json();

        if (payoutData.errors) {
            const errorMsg = payoutData.errors[0]?.detail || 'PayMongo Payout API Error';
            console.error('PayMongo Payout Error:', JSON.stringify(payoutData.errors, null, 2));

            // If PayMongo doesn't support direct payouts yet, mark for manual processing
            await supabase.from('payouts').update({
                status: 'manual_required',
                error_message: `PayMongo API: ${errorMsg}. Manual transfer needed: ₱${payout.payout_amount} to ${payoutChannel} ${payout.payout_destination}`
            }).eq('id', payoutId);

            // Notify admin/system about manual payout needed
            console.log(`⚠️ MANUAL PAYOUT REQUIRED: ₱${payout.payout_amount} to ${payoutChannel} ${payout.payout_destination}`);

            return res.status(200).json({
                success: false,
                message: 'Manual payout required - PayMongo payout API unavailable',
                payout: {
                    amount: payout.payout_amount,
                    method: payoutChannel,
                    destination: payout.payout_destination,
                    platformFee: payout.platform_fee
                }
            });
        }

        // 4. Success - update payout record
        const paymongoPayoutId = payoutData.data?.id || '';

        await supabase.from('payouts').update({
            status: 'completed',
            paymongo_payout_id: paymongoPayoutId,
            completed_at: new Date().toISOString()
        }).eq('id', payoutId);

        console.log(`✅ Payout completed: ₱${payout.payout_amount} to ${payoutChannel} (${payout.payout_destination})`);

        // 5. Notify landlord about payout
        await supabase.from('notifications').insert({
            recipient: payout.landlord_id,
            actor: payout.tenant_id,
            type: 'payout_received',
            message: `₱${payout.payout_amount.toLocaleString()} has been sent to your ${payoutChannel === 'gcash' ? 'GCash' : 'Maya'} (${payout.payout_destination}). Platform fee: ₱${payout.platform_fee.toLocaleString()}.`,
            link: '/payments',
            data: { payout_id: payoutId }
        });

        return res.status(200).json({
            success: true,
            message: 'Payout completed',
            paymongoPayoutId,
            amount: payout.payout_amount,
            platformFee: payout.platform_fee
        });

    } catch (err) {
        console.error('Process Payout Error:', err);

        // Mark as failed but don't lose the record
        try {
            await supabase.from('payouts').update({
                status: 'failed',
                error_message: err.message
            }).eq('id', payoutId);
        } catch (e) {
            console.error('Failed to update payout status:', e);
        }

        return res.status(500).json({ error: err.message });
    }
}
