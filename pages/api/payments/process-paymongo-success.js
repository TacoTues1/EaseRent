import { createClient } from '@supabase/supabase-js';
import { sendNotificationEmail, sendOnlinePaymentReceivedEmail } from '@/lib/email';
import { sendSMS, sendPaymentReceivedNotification } from '@/lib/sms';

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
        let tenantPaymentMethod = 'unknown'; // Track what method tenant actually used (gcash, paymaya, card, grab_pay, qrph)

        if (sessionId.startsWith('link_') || !sessionId.startsWith('cs_')) {
            // Assume Link
            const response = await fetch(`https://api.paymongo.com/v1/links/${sessionId}`, options);
            const linkData = await response.json();

            if (linkData.errors) {
                const errDetail = linkData.errors[0]?.detail || 'PayMongo Verification Failed';
                // If the link is not found (expired/deleted), return a clean 400 instead of a 500
                if (errDetail.includes('No such link') || errDetail.includes('not found')) {
                    return res.status(400).json({ error: 'Session expired or invalid. Please try again.', expired: true });
                }
                throw new Error(errDetail);
            }

            if (linkData.data?.attributes?.status !== 'paid') {
                return res.status(400).json({ error: 'Payment not paid yet.' });
            }

            // Get the PayMongo checkout reference number (displayed on the payment page)
            const linkReferenceNumber = linkData.data?.attributes?.reference_number || '';
            console.log('PayMongo Link reference_number:', linkReferenceNumber);
            console.log('PayMongo Link full attributes:', JSON.stringify(linkData.data?.attributes, null, 2));

            // For Links, we often have to fetch the related payments
            const payments = linkData.data?.attributes?.payments || [];

            const successPay = payments.find(p => p.data?.attributes?.status === 'paid') || payments[0]; // fallback

            if (successPay) {
                amountPaid = successPay.data.attributes.amount / 100;

                // Detect what payment method tenant actually used
                tenantPaymentMethod = successPay.data?.attributes?.source?.type
                    || successPay.data?.attributes?.payment_method_type
                    || 'unknown';
                console.log('Tenant payment method detected (link):', tenantPaymentMethod);

                const externalRef = successPay.data?.attributes?.external_reference_number || '';
                console.log('PayMongo payment external_reference_number:', externalRef);

                transactionId = externalRef || linkReferenceNumber || successPay.data.id;
            } else {
                // Fallback if payments not populated in link response
                amountPaid = linkData.data.attributes.amount / 100;
                transactionId = linkReferenceNumber || linkData.data.id;
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

            // Detect what payment method tenant actually used
            tenantPaymentMethod = successfulPayment.attributes?.source?.type
                || successfulPayment.attributes?.payment_method_type
                || 'unknown';
            console.log('Tenant payment method detected (checkout):', tenantPaymentMethod);

            // Use external ref or checkout session reference, fallback to payment ID
            const externalRef = successfulPayment.attributes?.external_reference_number || '';
            const sessionRef = sessionData.data?.attributes?.reference_number || '';
            transactionId = externalRef || sessionRef || successfulPayment.id;
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

        // Avoid Double Processing - if already paid via paymongo, skip
        if (request.status === 'paid' && request.payment_method === 'paymongo') {
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
                wifi_bill: request.wifi_bill,
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
        // IMPORTANT: Skip for move-in payments! Move-in advance is a deposit, not a prepayment for future months.
        // Only renewal payments should create future "paid" bill records.
        let monthlyRent = parseFloat(request.rent_amount || 0);
        let extraMonths = 0;
        if (monthlyRent > 0 && !request.is_move_in_payment) {
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
                    payment_id: paymentRecord?.id,
                    tenant_reference_number: transactionId // Include reference number
                });
            }

        }

        // 7. Notifications
        try {
            const { data: tenantProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', request.tenant)
                .single();

            // Detect if payer is a family member (different from primary tenant)
            // PayerId comes from checkout metadata or we can check family_members table
            let payerId = null;
            let payerProfile = null;
            let isFamilyPayer = false;

            // Try to get payer_id from checkout session metadata
            try {
                const encoded2 = Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');
                if (sessionId.startsWith('cs_')) {
                    const metaRes = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${sessionId}`, {
                        headers: { accept: 'application/json', authorization: `Basic ${encoded2}` }
                    });
                    const metaData = await metaRes.json();
                    payerId = metaData?.data?.attributes?.metadata?.payer_id;
                }
            } catch (metaErr) {
                console.error('Failed to fetch payer metadata:', metaErr);
            }

            // If payerId exists and is different from tenant, it's a family member
            if (payerId && payerId !== request.tenant) {
                const { data: pp } = await supabase.from('profiles').select('first_name, last_name').eq('id', payerId).single();
                if (pp) {
                    payerProfile = pp;
                    isFamilyPayer = true;
                }
            }

            const tenantName = tenantProfile ? `${tenantProfile.first_name} ${tenantProfile.last_name}`.trim() : 'Tenant';
            const payerName = payerProfile ? `${payerProfile.first_name} ${payerProfile.last_name}`.trim() : tenantName;

            // Build display name for notifications
            // Family member: "Juan Dela Cruz from Maria Dela Cruz"
            // Primary tenant: "Maria Dela Cruz"
            const displayName = isFamilyPayer ? `${payerName} from ${tenantName}` : tenantName;

            const message = `Payment of ₱${amountPaid.toLocaleString()} for "${request.properties?.title}" received (Via PayMongo).`;

            // 1. Send SMS to primary tenant
            if (tenantProfile?.phone) {
                try {
                    if (isFamilyPayer) {
                        await sendSMS(tenantProfile.phone, `[EaseRent] Your family member ${payerName} paid ₱${amountPaid.toLocaleString()} for "${request.properties?.title}" via PayMongo.`);
                    } else {
                        await sendSMS(tenantProfile.phone, message);
                    }
                } catch (smsErr) {
                    console.error('SMS send error:', smsErr);
                }
            }

            // 2. Send Email to primary tenant
            try {
                const { data: userData } = await supabase.auth.admin.getUserById(request.tenant);
                const tenantEmail = userData?.user?.email;

                if (tenantEmail) {
                    const emailMessage = isFamilyPayer
                        ? `<div style="font-family: sans-serif; color: #333;">
                               <p>Dear ${tenantProfile?.first_name || 'Tenant'},</p>
                               <p>Your family member <strong>${payerName}</strong> has paid <strong>₱${amountPaid.toLocaleString()}</strong> for ${request.properties?.title} via PayMongo.</p>
                               <p>Transaction ID: ${transactionId}</p>
                               <p>Thank you!</p>
                               </div>`
                        : `<div style="font-family: sans-serif; color: #333;">
                               <p>Dear ${tenantProfile?.first_name || 'Tenant'},</p>
                               <p>We confirm that your payment of <strong>₱${amountPaid.toLocaleString()}</strong> has been successfully processed via PayMongo.</p>
                               <p>Property: ${request.properties?.title}</p>
                               <p>Transaction ID: ${transactionId}</p>
                               <p>Thank you!</p>
                               </div>`;
                    await sendNotificationEmail({
                        to: tenantEmail,
                        subject: isFamilyPayer ? `Family Payment - ${payerName} paid ₱${amountPaid.toLocaleString()}` : 'Payment Successful (Via PayMongo)',
                        message: emailMessage
                    });
                } else {
                    console.error('Email send error: No email found for user', request.tenant);
                }
            } catch (emailErr) {
                console.error('Email send error:', emailErr);
            }

            // Notify Landlord (in-app)
            await supabase.from('notifications').insert({
                recipient: request.landlord,
                actor: request.tenant,
                type: 'payment_received',
                message: `You have received a payment from ${displayName} for ${request.properties?.title} via PayMongo.`,
                link: '/payments',
                data: { payment_request_id: request.id }
            });

            // Send Email to Landlord
            try {
                const { data: landlordEmail } = await supabase.rpc('get_user_email', { user_id: request.landlord });

                // Fetch landlord profile for name/phone
                const { data: landlordProfile } = await supabase
                    .from('profiles')
                    .select('first_name, last_name, phone')
                    .eq('id', request.landlord)
                    .single();

                const landlordName = landlordProfile ? `${landlordProfile.first_name} ${landlordProfile.last_name}` : 'Landlord';

                if (landlordEmail) {
                    await sendOnlinePaymentReceivedEmail({
                        to: landlordEmail,
                        landlordName,
                        tenantName: displayName,
                        propertyTitle: request.properties?.title || 'Property',
                        amount: amountPaid,
                        paymentMethod: 'paymongo',
                        transactionId: transactionId
                    });
                    console.log(`✅ PayMongo Landlord Email sent to ${landlordEmail}`);
                }

                // Send SMS to Landlord
                if (landlordProfile?.phone) {
                    await sendPaymentReceivedNotification(landlordProfile.phone, {
                        method: 'paymongo',
                        tenantName: displayName,
                        amount: amountPaid.toLocaleString(),
                        propertyTitle: request.properties?.title || 'Property'
                    });
                    console.log(`✅ PayMongo Landlord SMS sent to ${landlordProfile.phone}`);
                }

            } catch (llErr) {
                console.error('Landlord Notification Error:', llErr);
            }

        } catch (notifyErr) {
            console.error('Notification Error:', notifyErr);
        }

        // 8. AUTO-PAYOUT: Send full amount to landlord
        // In test mode, we simulate the payout (auto-complete). In production, use PayMongo Payout API.
        try {
            const platformFee = 0;
            const payoutAmount = amountPaid; // 100% to landlord

            // Fetch landlord's accepted_payments to get destination wallet
            const { data: landlordPayments } = await supabase
                .from('profiles')
                .select('accepted_payments')
                .eq('id', request.landlord)
                .single();

            const accepted = landlordPayments?.accepted_payments || {};

            // Determine payout method based on what tenant actually used
            const methodMap = {
                'gcash': 'gcash',
                'grab_pay': 'gcash',
                'paymaya': 'maya',
                'maya': 'maya',
                'card': 'gcash',
                'qrph': 'gcash',
            };

            let payoutMethod = methodMap[tenantPaymentMethod] || 'gcash';
            let payoutDestination = '';

            if (payoutMethod === 'gcash' && accepted.gcash?.number) {
                payoutDestination = accepted.gcash.number;
            } else if (payoutMethod === 'maya' && accepted.maya?.number) {
                payoutDestination = accepted.maya.number;
            } else if (accepted.gcash?.number) {
                payoutMethod = 'gcash';
                payoutDestination = accepted.gcash.number;
            } else if (accepted.maya?.number) {
                payoutMethod = 'maya';
                payoutDestination = accepted.maya.number;
            }
            // Generate a simulated payout reference number (test mode)
            const payoutRefNumber = `PO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

            // Create payout record as COMPLETED (simulated in test mode)
            const { data: payoutRecord, error: payoutError } = await supabase
                .from('payouts')
                .insert({
                    payment_request_id: paymentRequestId,
                    payment_id: paymentRecord?.id,
                    landlord_id: request.landlord,
                    tenant_id: request.tenant,
                    total_amount: amountPaid,
                    platform_fee: platformFee,
                    payout_amount: payoutAmount,
                    payout_method: payoutMethod,
                    payout_destination: payoutDestination,
                    status: 'completed', // Auto-completed in test mode
                    paymongo_payout_id: payoutRefNumber,
                    completed_at: new Date().toISOString()
                })
                .select()
                .single();

            if (payoutError) {
                console.error('Payout record creation failed:', payoutError);
            } else {
                const methodLabel = payoutMethod === 'maya' ? 'Maya' : 'GCash';

                // Notify landlord about payout received
                const { data: tenantProfile2 } = await supabase
                    .from('profiles')
                    .select('first_name, last_name')
                    .eq('id', request.tenant)
                    .single();

                const { data: landlordProfile2 } = await supabase
                    .from('profiles')
                    .select('first_name, last_name, phone')
                    .eq('id', request.landlord)
                    .single();

                const tenantFullName = tenantProfile2 ? `${tenantProfile2.first_name} ${tenantProfile2.last_name}` : 'Tenant';
                const landlordFullName = landlordProfile2 ? `${landlordProfile2.first_name} ${landlordProfile2.last_name}` : 'Landlord';

                // Use the same displayName logic from earlier for consistency in payout messages
                const payoutDisplayName = isFamilyPayer ? `${payerName} from ${tenantName}` : tenantFullName;

                // In-app notification
                await supabase.from('notifications').insert({
                    recipient: request.landlord,
                    actor: request.tenant,
                    type: 'payout_received',
                    message: `₱${payoutAmount.toLocaleString()} has been sent to your ${methodLabel} (${payoutDestination}) from ${payoutDisplayName}'s payment. Ref: ${payoutRefNumber}`,
                    link: '/payments',
                    data: { payout_id: payoutRecord?.id, reference_number: payoutRefNumber }
                });

                // Email notification to landlord about payout
                try {
                    const { data: landlordEmail2 } = await supabase.rpc('get_user_email', { user_id: request.landlord });
                    if (landlordEmail2) {
                        await sendNotificationEmail({
                            to: landlordEmail2,
                            subject: `₱${payoutAmount.toLocaleString()} Sent to Your ${methodLabel}`,
                            message: `<div style="font-family: sans-serif; color: #333;">
                                <p>Dear ${landlordFullName},</p>
                                <p>We have sent <strong>₱${payoutAmount.toLocaleString()}</strong> to your ${methodLabel} account <strong>(${payoutDestination})</strong>.</p>
                                <table style="width:100%;border-collapse:collapse;margin:15px 0;">
                                    <tr><td style="padding:8px 0;color:#333;font-weight:bold;">Amount Sent to You</td><td style="padding:8px 0;font-weight:bold;text-align:right;color:#00BFA5;">₱${payoutAmount.toLocaleString()}</td></tr>
                                </table>
                                <p>Property: ${request.properties?.title || 'Property'}</p>
                                <p>Tenant: ${payoutDisplayName}</p>
                                <p>Reference Number: <strong>${payoutRefNumber}</strong></p>
                                <p>Transaction ID: <strong>${transactionId}</strong></p>
                                <p>Thank you for using EaseRent!</p>
                            </div>`
                        });
                        console.log(`✅ Payout notification email sent to ${landlordEmail2}`);
                    }
                } catch (emailErr) {
                    console.error('Payout email error:', emailErr);
                }

                // SMS notification to landlord about payout
                if (landlordProfile2?.phone) {
                    try {
                        await sendSMS(
                            landlordProfile2.phone,
                            `EaseRent: ₱${payoutAmount.toLocaleString()} sent to your ${methodLabel} (${payoutDestination}) from ${payoutDisplayName}'s payment for "${request.properties?.title}". Ref: ${payoutRefNumber}`
                        );
                        console.log(`✅ Payout SMS sent to ${landlordProfile2.phone}`);
                    } catch (smsErr) {
                        console.error('Payout SMS error:', smsErr);
                    }
                }
            }
        } catch (payoutErr) {
            console.error('Payout processing error:', payoutErr);
        }

        res.status(200).json({ success: true, excessAmount: availableExcess > 0 ? availableExcess : 0 });

    } catch (err) {
        console.error('Process PayMongo Payment Error:', err);
        res.status(500).json({ error: err.message });
    }
}
