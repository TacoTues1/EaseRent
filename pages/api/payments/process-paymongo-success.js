import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { paymentRequestId, sessionId } = req.body;

    if (!paymentRequestId || !sessionId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 1. Verify Payment with PayMongo
        const encoded = Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');
        const options = {
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: `Basic ${encoded}`
            }
        };

        // Try as Checkout Session first (legacy compat)
        // Or if ID starts with 'cs_'
        let amountPaid = 0;
        let transactionId = '';

        if (sessionId.startsWith('link_') || !sessionId.startsWith('cs_')) {
            // Assume Link
            const response = await fetch(`https://api.paymongo.com/v1/links/${sessionId}`, options);
            const linkData = await response.json();

            if (linkData.errors) throw new Error(linkData.errors[0]?.detail || 'PayMongo Verification Failed');

            if (linkData.data?.attributes?.status !== 'paid') {
                return res.status(400).json({ error: 'Payment not paid yet.' });
            }

            // For Links, we often have to fetch the related payments
            const payments = linkData.data?.attributes?.payments || [];

            // If payments array is empty but status is paid, might be in a different relation or delayed
            // But usually included.
            const successPay = payments.find(p => p.data.attributes.status === 'paid') || payments[0]; // fallback

            if (successPay) {
                amountPaid = successPay.data.attributes.amount / 100;
                transactionId = successPay.data.id;
            } else {
                // Fallback if payments not populated in link response (sometimes happens)
                // Use link amount
                amountPaid = linkData.data.attributes.amount / 100;
                transactionId = linkData.data.id; // Use Link ID as reference
            }

        } else {
            // Assume Checkout Session
            const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${sessionId}`, options);
            const sessionData = await response.json();

            if (sessionData.errors) {
                throw new Error(sessionData.errors[0]?.detail || 'PayMongo Verification Failed');
            }

            const payments = sessionData.data?.attributes?.payments || [];
            const successfulPayment = payments.find(p => p.attributes.status === 'paid');

            if (!successfulPayment) {
                return res.status(400).json({ error: 'Payment not verified or not paid.' });
            }

            amountPaid = successfulPayment.attributes.amount / 100;
            transactionId = successfulPayment.id;
        }


        // 2. Get Payment Request Details
        const { data: request, error: requestError } = await supabase
            .from('payment_requests')
            .select('*, properties(title)')
            .eq('id', paymentRequestId)
            .single();

        if (requestError || !request) {
            throw new Error('Payment request not found');
        }

        // Avoid Double Processing
        if (request.status === 'paid' && request.payment_method === 'paymongo' && request.tenant_reference_number === transactionId) {
            return res.status(200).json({ success: true, message: 'Already processed' });
        }

        const requestTotal = (
            parseFloat(request.rent_amount || 0) +
            parseFloat(request.advance_amount || 0) +
            parseFloat(request.security_deposit_amount || 0) +
            parseFloat(request.water_bill || 0) +
            parseFloat(request.electrical_bill || 0) +
            parseFloat(request.wifi_bill || 0) +
            parseFloat(request.other_bills || 0)
        );

        // 3. Update Tenant Balance (Handle Excess OR Deduction)
        const { data: balanceRecord, error: balanceError } = await supabase
            .from('tenant_balances')
            .select('*')
            .eq('tenant_id', request.tenant)
            .eq('occupancy_id', request.occupancy_id)
            .maybeSingle();

        let balanceChange = 0;
        let availableExcess = amountPaid - requestTotal;

        if (availableExcess > 0) {
            balanceChange = availableExcess;
        } else if (availableExcess < 0) {
            const needed = Math.abs(availableExcess);
            const currentBalance = balanceRecord?.amount || 0;
            if (currentBalance >= needed) {
                balanceChange = -needed;
            } else {
                if (currentBalance > 0) balanceChange = -currentBalance;
            }
        }

        if (balanceChange !== 0 && request.occupancy_id) {
            const newBalance = (balanceRecord?.amount || 0) + balanceChange;
            await supabase.from('tenant_balances')
                .upsert({
                    tenant_id: request.tenant,
                    occupancy_id: request.occupancy_id,
                    amount: newBalance,
                    last_updated: new Date().toISOString()
                }, { onConflict: 'tenant_id,occupancy_id' });
        }

        // 4. Create Payment Record (Ledger)
        const { data: paymentRecord, error: paymentError } = await supabase
            .from('payments')
            .insert({
                property_id: request.property_id,
                tenant: request.tenant,
                landlord: request.landlord,
                amount: amountPaid,
                water_bill: request.water_bill,
                electrical_bill: request.electrical_bill,
                other_bills: request.other_bills,
                bills_description: request.bills_description,
                method: 'paymongo',
                status: 'recorded',
                paid_at: new Date().toISOString(),
                currency: 'PHP'
            })
            .select()
            .single();

        if (paymentError) console.error("Failed to create payment record:", paymentError);

        // 5. Update Original Payment Request Status (append payment method to description)
        const updatedDescription = request.bills_description
            ? `${request.bills_description} (Via PayMongo)`
            : 'Payment (Via PayMongo)';

        const { error: updateError } = await supabase
            .from('payment_requests')
            .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                payment_method: 'paymongo',
                bills_description: updatedDescription,
                tenant_reference_number: transactionId,
                payment_id: paymentRecord?.id
            })
            .eq('id', paymentRequestId);

        if (updateError) throw updateError;


        // 6. Handle Advance Payment Records
        let monthlyRent = parseFloat(request.rent_amount || 0);
        let extraMonths = 0;
        if (monthlyRent > 0) {
            const advanceAmount = parseFloat(request.advance_amount || 0);
            if (advanceAmount > 0) {
                extraMonths = Math.floor(advanceAmount / monthlyRent);
            }
        }

        if (extraMonths > 0 && request.occupancy_id) {
            const baseDueDate = new Date(request.due_date);
            for (let i = 1; i <= extraMonths; i++) {
                const futureDueDate = new Date(baseDueDate);
                const currentMonth = futureDueDate.getMonth();
                const currentYear = futureDueDate.getFullYear();
                const currentDay = futureDueDate.getDate();

                const targetMonth = currentMonth + i;
                const targetYear = currentYear + Math.floor(targetMonth / 12);
                let finalMonth = targetMonth % 12;
                if (finalMonth < 0) finalMonth += 12;

                futureDueDate.setFullYear(targetYear);
                futureDueDate.setMonth(finalMonth);
                futureDueDate.setDate(currentDay);

                await supabase.from('payment_requests').insert({
                    landlord: request.landlord,
                    tenant: request.tenant,
                    property_id: request.property_id,
                    occupancy_id: request.occupancy_id,
                    rent_amount: monthlyRent,
                    water_bill: 0,
                    electrical_bill: 0,
                    other_bills: 0,
                    bills_description: `Advance Payment (Month ${i + 1} of ${extraMonths + 1}) - via PayMongo`,
                    due_date: futureDueDate.toISOString(),
                    status: 'paid',
                    paid_at: new Date().toISOString(),
                    payment_method: 'paymongo',
                    is_advance_payment: true,
                    payment_id: paymentRecord?.id
                });
            }

            if (request.is_renewal_payment) {
                await supabase.from('tenant_occupancies')
                    .update({ renewal_status: null, renewal_requested: false })
                    .eq('id', request.occupancy_id);
            }
        }

        // 7. Notifications
        try {
            const { data: tenantProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', request.tenant)
                .single();

            const message = `Payment of ₱${amountPaid.toLocaleString()} for "${request.properties?.title}" received (Via PayMongo).`;

            // Use absolute URL or fallback to localhost for development
            const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

            if (tenantProfile?.phone) {
                try {
                    await fetch(`${baseUrl}/api/send-sms`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            phoneNumber: tenantProfile.phone,
                            message: message
                        })
                    });
                } catch (smsErr) {
                    console.error('SMS send error:', smsErr);
                }
            }

            try {
                await fetch(`${baseUrl}/api/send-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recipientId: request.tenant,
                        subject: 'Payment Successful (Via PayMongo)',
                        html: `<p>Dear ${tenantProfile?.first_name || 'Tenant'},</p>
                               <p>We confirm that your payment of <strong>₱${amountPaid.toLocaleString()}</strong> has been successfully processed via PayMongo.</p>
                               <p>Property: ${request.properties?.title}</p>
                               <p>Transaction ID: ${transactionId}</p>
                               <p>Thank you!</p>`
                    })
                });
            } catch (emailErr) {
                console.error('Email send error:', emailErr);
            }

            // Notify Landlord too
            await supabase.from('notifications').insert({
                recipient: request.landlord,
                actor: request.tenant, // Assuming actor logic works or we use hardcoded
                // Actually, in the other file it used session.user.id. Here we don't have session.
                // We can use request.tenant as actor.
                type: 'payment_confirmation_needed', // reuse this type or 'payment_received'
                message: `Tenant paid ₱${amountPaid.toLocaleString()} for ${request.properties?.title} via PayMongo (Transaction: ${transactionId}).`,
                link: '/payments',
                data: { payment_request_id: request.id }
            })

        } catch (notifyErr) {
            console.error('Notification Error:', notifyErr);
        }

        res.status(200).json({ success: true, excessAmount: availableExcess > 0 ? availableExcess : 0 });

    } catch (err) {
        console.error('Process PayMongo Payment Error:', err);
        res.status(500).json({ error: err.message });
    }
}
