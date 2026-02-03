
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { paymentRequestId, tenantId } = req.body;

    if (!paymentRequestId || !tenantId) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        // 1. Get Payment Request
        const { data: request, error: requestError } = await supabase
            .from('payment_requests')
            .select('*')
            .eq('id', paymentRequestId)
            .single();

        if (requestError || !request) throw new Error('Request not found');

        const totalBill = (
            parseFloat(request.rent_amount || 0) +
            parseFloat(request.water_bill || 0) +
            parseFloat(request.electrical_bill || 0) +
            parseFloat(request.wifi_bill || 0) +
            parseFloat(request.other_bills || 0)
        );

        // 2. Get Tenant Balance
        const { data: balanceRecord, error: balanceError } = await supabase
            .from('tenant_balances')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle();

        const currentBalance = balanceRecord?.amount || 0;

        if (currentBalance < totalBill) {
            return res.status(400).json({ error: 'Insufficient credit balance' });
        }

        // 3. Deduct Balance
        const newBalance = currentBalance - totalBill;

        const { error: updateBalanceError } = await supabase
            .from('tenant_balances')
            .update({ amount: newBalance, last_updated: new Date().toISOString() })
            .eq('tenant_id', tenantId);

        if (updateBalanceError) throw updateBalanceError;

        // 4. Mark Bill as Paid
        const { error: updateBillError } = await supabase
            .from('payment_requests')
            .update({
                status: 'pending_confirmation', // Or 'paid' if purely credit? detailed logic
                paid_at: new Date().toISOString(),
                payment_method: 'credit_balance',
                tenant_reference_number: 'CREDIT_APPLIED'
            })
            .eq('id', paymentRequestId);

        if (updateBillError) throw updateBillError;

        res.status(200).json({ success: true, newBalance });

    } catch (err) {
        console.error('Pay with Credit Error:', err);
        res.status(500).json({ error: err.message });
    }
}
