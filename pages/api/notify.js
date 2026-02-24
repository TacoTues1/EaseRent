// pages/api/notify.js
// Centralized API for sending SMS and Email notifications

import { createClient } from '@supabase/supabase-js'
import { sendBillNotification, sendNewBookingNotification, sendMoveInNotification, sendRenewalStatus, sendRenewalRequest, sendEndContractNotification, sendPaymentReceivedNotification, sendPaymentConfirmedNotification, sendMaintenanceDoneNotification } from '../../lib/sms'
import { sendNewPaymentBillEmail, sendNewBookingNotificationEmail, sendCashPaymentNotificationEmail, sendMoveInEmail, sendRenewalStatusEmail, sendRenewalRequestEmail, sendEndContractEmail, sendOnlinePaymentReceivedEmail, sendPaymentConfirmedEmail } from '../../lib/email'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Helper: Format Phone Number
function formatPhoneNumber(phone) {
    if (!phone) return null;
    let clean = phone.replace(/\D/g, '');
    if (clean.length < 10) return null;
    if (clean.startsWith('09')) return '+63' + clean.substring(1);
    if (clean.startsWith('63')) return '+' + clean;
    return '+' + clean;
}

// Helper: Get family members for a tenant's occupancy on a property
// Returns array of { id, phone, email, name } for each family member
async function getFamilyMembersForNotification(tenantId, propertyId) {
    if (!tenantId || !propertyId) return []
    try {
        // Find the primary occupancy for this tenant on this property
        const { data: primaryOcc } = await supabaseAdmin
            .from('tenant_occupancies')
            .select('id, is_family_member, parent_occupancy_id')
            .eq('tenant_id', tenantId)
            .eq('property_id', propertyId)
            .in('status', ['active', 'pending_end'])
            .limit(1)
            .maybeSingle()

        if (!primaryOcc) return []

        // Determine the parent occupancy ID
        const parentOccId = primaryOcc.is_family_member ? primaryOcc.parent_occupancy_id : primaryOcc.id
        if (!parentOccId) return []

        // Get all family members linked to this parent occupancy
        const { data: familyMembers } = await supabaseAdmin
            .from('family_members')
            .select('member_id, member_profile:profiles!family_members_member_id_fkey(first_name, last_name, phone)')
            .eq('parent_occupancy_id', parentOccId)

        if (!familyMembers || familyMembers.length === 0) return []

        // Also get the primary tenant if the current tenant is a family member
        let allRecipients = []

        // If the notified tenant is the mother, send to family members
        // If the notified tenant is a family member, send to the mother + other family members
        if (primaryOcc.is_family_member) {
            // Current tenant is a family member - get the mother too
            const { data: motherOcc } = await supabaseAdmin
                .from('tenant_occupancies')
                .select('tenant_id')
                .eq('id', parentOccId)
                .single()
            if (motherOcc && motherOcc.tenant_id !== tenantId) {
                const { data: motherProfile } = await supabaseAdmin
                    .from('profiles')
                    .select('first_name, last_name, phone')
                    .eq('id', motherOcc.tenant_id)
                    .single()
                if (motherProfile) {
                    let motherEmail = null
                    try {
                        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(motherOcc.tenant_id)
                        motherEmail = userData?.user?.email
                    } catch (e) { }
                    allRecipients.push({
                        id: motherOcc.tenant_id,
                        phone: motherProfile.phone,
                        email: motherEmail,
                        name: `${motherProfile.first_name || ''} ${motherProfile.last_name || ''}`.trim()
                    })
                }
            }
        }

        // Add all family members (excluding the current tenant)
        for (const fm of familyMembers) {
            if (fm.member_id === tenantId) continue // Skip the tenant who already got notified
            let memberEmail = null
            try {
                const { data: userData } = await supabaseAdmin.auth.admin.getUserById(fm.member_id)
                memberEmail = userData?.user?.email
            } catch (e) { }
            allRecipients.push({
                id: fm.member_id,
                phone: fm.member_profile?.phone,
                email: memberEmail,
                name: `${fm.member_profile?.first_name || ''} ${fm.member_profile?.last_name || ''}`.trim()
            })
        }

        return allRecipients
    } catch (err) {
        console.error('getFamilyMembersForNotification error:', err)
        return []
    }
}

// Helper: Send same SMS and email to all family members
async function notifyFamilyMembers({ tenantId, propertyId, smsFn, emailFn }) {
    const members = await getFamilyMembersForNotification(tenantId, propertyId)
    if (members.length === 0) return

    for (const member of members) {
        // SMS
        if (smsFn && member.phone) {
            const phone = formatPhoneNumber(member.phone)
            if (phone) {
                try {
                    await smsFn(phone, member)
                    console.log(`✅ Family SMS sent to ${phone} (${member.name})`)
                } catch (err) {
                    console.error(`Family SMS failed for ${phone}:`, err.message)
                }
            }
        }
        // Email
        if (emailFn && member.email) {
            try {
                await emailFn(member.email, member)
                console.log(`✅ Family email sent to ${member.email} (${member.name})`)
            } catch (err) {
                console.error(`Family email failed for ${member.email}:`, err.message)
            }
        }
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { type, recordId, actorId } = req.body

    if (!type || !recordId) {
        return res.status(400).json({ error: 'Missing type or recordId' })
    }

    try {
        // ============================================
        // NOTIFICATION TYPE: NEW PAYMENT BILL
        // ============================================
        if (type === 'payment_bill') {
            // Fetch the payment request with tenant info
            const { data: paymentRequest, error } = await supabaseAdmin
                .from('payment_requests')
                .select(`
          *,
          properties(title),
          tenant_profile:profiles!payment_requests_tenant_fkey(first_name, last_name, phone)
        `)
                .eq('id', recordId)
                .single()

            if (error || !paymentRequest) {
                console.error('Payment request not found:', error)
                return res.status(404).json({ error: 'Payment request not found' })
            }

            // Fallback: Fetch tenant profile if join failed
            let tenant = paymentRequest.tenant_profile
            if (!tenant && paymentRequest.tenant) {
                const { data: tp } = await supabaseAdmin.from('profiles').select('*').eq('id', paymentRequest.tenant).single()
                tenant = tp
            }

            const phone = formatPhoneNumber(tenant?.phone)
            const propertyTitle = paymentRequest.properties?.title || 'Property'
            const tenantName = `${tenant?.first_name || ''} ${tenant?.last_name || ''}`.trim() || 'Tenant'

            // Get tenant email
            let tenantEmail = null
            if (paymentRequest.tenant) {
                try {
                    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(paymentRequest.tenant)
                    tenantEmail = userData?.user?.email
                } catch (e) {
                    console.error('Failed to fetch tenant email for bill:', e)
                }
            }

            // Determine bill type and amount
            let billType = 'other'
            let amount = 0
            let dueDate = paymentRequest.due_date

            // Check for composite bills first (Move-in / Renewal)
            if (paymentRequest.is_move_in_payment || paymentRequest.is_renewal_payment) {
                billType = paymentRequest.is_move_in_payment ? 'move-in' : 'renewal'
                amount = (paymentRequest.rent_amount || 0) +
                    (paymentRequest.advance_amount || 0) +
                    (paymentRequest.security_deposit_amount || 0)
            }
            // Standard single-item bills
            else if (paymentRequest.rent_amount > 0) {
                billType = 'rent'
                amount = paymentRequest.rent_amount
            } else if (paymentRequest.electrical_bill > 0) {
                billType = 'electricity'
                amount = paymentRequest.electrical_bill
                dueDate = paymentRequest.electrical_due_date || dueDate
            } else if (paymentRequest.water_bill > 0) {
                billType = 'water'
                amount = paymentRequest.water_bill
                dueDate = paymentRequest.water_due_date || dueDate
            } else if (paymentRequest.wifi_bill > 0) {
                billType = 'wifi'
                amount = paymentRequest.wifi_bill
                dueDate = paymentRequest.wifi_due_date || dueDate
            } else if (paymentRequest.other_bills > 0) {
                billType = 'other'
                amount = paymentRequest.other_bills
                dueDate = paymentRequest.other_due_date || dueDate
            }

            const results = { sms: false, email: false }

            // Send SMS
            if (phone) {
                try {
                    await sendBillNotification(phone, {
                        propertyName: propertyTitle,
                        amount: amount.toLocaleString(),
                        dueDate: dueDate ? new Date(dueDate).toLocaleDateString() : 'ASAP'
                    })
                    results.sms = true
                    console.log(`✅ SMS sent to ${phone} for payment bill`)
                } catch (err) {
                    console.error(`SMS failed for ${phone}:`, err.message)
                }
            }

            // Send Email
            if (tenantEmail) {
                try {
                    await sendNewPaymentBillEmail({
                        to: tenantEmail,
                        tenantName,
                        propertyTitle,
                        billType,
                        amount,
                        dueDate,
                        description: paymentRequest.bills_description
                    })
                    results.email = true
                    console.log(`✅ Email sent to ${tenantEmail} for payment bill`)
                } catch (err) {
                    console.error(`Email failed for ${tenantEmail}:`, err.message)
                }
            }

            // Notify family members with the same bill notification
            if (paymentRequest.tenant && paymentRequest.property_id) {
                await notifyFamilyMembers({
                    tenantId: paymentRequest.tenant,
                    propertyId: paymentRequest.property_id,
                    smsFn: async (memberPhone) => {
                        await sendBillNotification(memberPhone, {
                            propertyName: propertyTitle,
                            amount: amount.toLocaleString(),
                            dueDate: dueDate ? new Date(dueDate).toLocaleDateString() : 'ASAP'
                        })
                    },
                    emailFn: async (memberEmail, member) => {
                        await sendNewPaymentBillEmail({
                            to: memberEmail,
                            tenantName: member.name || 'Tenant',
                            propertyTitle,
                            billType,
                            amount,
                            dueDate,
                            description: paymentRequest.bills_description
                        })
                    }
                })
            }

            return res.status(200).json({ success: true, type: 'payment_bill', results })
        }

        // ============================================
        // NOTIFICATION TYPE: NEW BOOKING (For Landlord)
        // ============================================
        if (type === 'booking_new') {
            // Fetch the booking with landlord and tenant info
            const { data: booking, error } = await supabaseAdmin
                .from('bookings')
                .select(`
          *,
          property:properties(title, landlord),
          tenant_profile:profiles!bookings_tenant_fkey(first_name, last_name, phone)
        `)
                .eq('id', recordId)
                .single()

            if (error || !booking) {
                console.error('Booking not found:', error)
                return res.status(404).json({ error: 'Booking not found' })
            }

            // Get landlord profile
            const { data: landlordProfile } = await supabaseAdmin
                .from('profiles')
                .select('first_name, last_name, phone')
                .eq('id', booking.property?.landlord)
                .single()

            // Get landlord email
            const { data: landlordEmail } = await supabaseAdmin.rpc('get_user_email', {
                user_id: booking.property?.landlord
            })

            const landlordPhone = formatPhoneNumber(landlordProfile?.phone)
            const landlordName = `${landlordProfile?.first_name || ''} ${landlordProfile?.last_name || ''}`.trim() || 'Landlord'
            const tenantName = `${booking.tenant_profile?.first_name || ''} ${booking.tenant_profile?.last_name || ''}`.trim() || 'Tenant'
            const propertyTitle = booking.property?.title || 'Property'

            // Determine time slot label
            let timeSlot = ''
            if (booking.booking_date) {
                const hour = new Date(booking.booking_date).getHours()
                if (hour === 8) timeSlot = 'Morning (8:00 AM - 11:00 AM)'
                else if (hour === 13) timeSlot = 'Afternoon (1:00 PM - 5:30 PM)'
                else timeSlot = new Date(booking.booking_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            }

            const results = { sms: false, email: false }

            // Send SMS to Landlord
            if (landlordPhone) {
                try {
                    await sendNewBookingNotification(landlordPhone, {
                        tenantName,
                        propertyName: propertyTitle,
                        date: booking.booking_date ? new Date(booking.booking_date).toLocaleDateString() : 'Not specified',
                        time: timeSlot
                    })
                    results.sms = true
                    console.log(`✅ SMS sent to landlord ${landlordPhone} for new booking`)
                } catch (err) {
                    console.error(`SMS failed for landlord ${landlordPhone}:`, err.message)
                }
            }

            // Send Email to Landlord
            if (landlordEmail) {
                try {
                    await sendNewBookingNotificationEmail({
                        to: landlordEmail,
                        landlordName,
                        tenantName,
                        tenantPhone: booking.tenant_profile?.phone,
                        propertyTitle,
                        bookingDate: booking.booking_date,
                        timeSlot
                    })
                    results.email = true
                    console.log(`✅ Email sent to landlord ${landlordEmail} for new booking`)
                } catch (err) {
                    console.error(`Email failed for landlord ${landlordEmail}:`, err.message)
                }
            }

            return res.status(200).json({ success: true, type: 'booking_new', results })
        }

        // ============================================
        // NOTIFICATION TYPE: BOOKING STATUS CHANGE
        // ============================================
        if (type === 'booking_status') {
            // This already exists - just return success
            return res.status(200).json({ success: true, type: 'booking_status', message: 'Handled by existing logic' })
        }

        // ============================================
        // NOTIFICATION TYPE: CASH PAYMENT (For Landlord)
        // ============================================
        if (type === 'cash_payment') {
            const { landlordEmail, landlordName, tenantName, propertyTitle, amount, monthsCovered, paymentMethod, landlordPhone } = req.body

            if (!landlordEmail && !landlordPhone) {
                return res.status(400).json({ error: 'Missing landlordEmail or landlordPhone' })
            }

            const results = { email: false, sms: false }

            // Send Email
            if (landlordEmail) {
                try {
                    await sendCashPaymentNotificationEmail({
                        to: landlordEmail,
                        landlordName: landlordName || 'Landlord',
                        tenantName: tenantName || 'Tenant',
                        propertyTitle: propertyTitle || 'Property',
                        amount: amount || 0,
                        monthsCovered: monthsCovered || 1,
                        paymentMethod: paymentMethod || 'cash'
                    })
                    results.email = true
                    console.log(`✅ Cash payment email sent to landlord ${landlordEmail}`)
                } catch (err) {
                    console.error(`Cash payment email failed for ${landlordEmail}:`, err.message)
                }
            }

            // Send SMS (if phone provided)
            if (landlordPhone) {
                try {
                    await sendPaymentReceivedNotification(formatPhoneNumber(landlordPhone), {
                        method: paymentMethod || 'cash',
                        tenantName: tenantName || 'Tenant',
                        amount: (amount || 0).toLocaleString(),
                        propertyTitle: propertyTitle || 'Property'
                    })
                    results.sms = true
                    console.log(`✅ Cash payment SMS sent to landlord ${landlordPhone}`)
                } catch (err) {
                    console.error(`Cash payment SMS failed for ${landlordPhone}:`, err.message)
                }
            }

            return res.status(200).json({ success: true, type: 'cash_payment', results })
        }

        // ============================================
        // NOTIFICATION TYPE: ONLINE PAYMENT RECEIVED (For Landlord)
        // ============================================
        if (type === 'online_payment_received') {
            const { landlordId, tenantName, propertyTitle, amount, paymentMethod, transactionId } = req.body

            const results = { email: false, sms: false }

            // Fetch landlord details
            let landlordEmail = null
            let landlordPhone = null
            let landlordName = 'Landlord'

            if (landlordId) {
                try {
                    // Get phone and name
                    const { data: profile } = await supabaseAdmin
                        .from('profiles')
                        .select('first_name, last_name, phone')
                        .eq('id', landlordId)
                        .single()

                    if (profile) {
                        landlordPhone = formatPhoneNumber(profile.phone)
                        landlordName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                    }

                    // Get email
                    const { data: emailData } = await supabaseAdmin.auth.admin.getUserById(landlordId)
                    landlordEmail = emailData?.user?.email
                } catch (e) {
                    console.error('Failed to fetch landlord details for payment:', e)
                }
            }

            // Send Email
            if (landlordEmail) {
                try {
                    await sendOnlinePaymentReceivedEmail({
                        to: landlordEmail,
                        landlordName,
                        tenantName: tenantName || 'Tenant',
                        propertyTitle: propertyTitle || 'Property',
                        amount: amount || 0,
                        paymentMethod: paymentMethod || 'stripe',
                        transactionId: transactionId || 'N/A'
                    })
                    results.email = true
                    console.log(`✅ Online payment email sent to ${landlordEmail}`)
                } catch (err) {
                    console.error(`Online payment email failed for ${landlordEmail}:`, err.message)
                }
            }

            // Send SMS
            if (landlordPhone) {
                try {
                    await sendPaymentReceivedNotification(landlordPhone, {
                        method: paymentMethod || 'stripe',
                        tenantName: tenantName || 'Tenant',
                        amount: (amount || 0).toLocaleString(),
                        propertyTitle: propertyTitle || 'Property'
                    })
                    results.sms = true
                    console.log(`✅ Online payment SMS sent to ${landlordPhone}`)
                } catch (err) {
                    console.error(`Online payment SMS failed for ${landlordPhone}:`, err.message)
                }
            }

            return res.status(200).json({ success: true, type: 'online_payment_received', results })
        }

        // ============================================
        // NOTIFICATION TYPE: PAYMENT CONFIRMED (For Tenant)
        // ============================================
        if (type === 'payment_confirmed') {
            // Fetch payment request details
            const { data: request, error } = await supabaseAdmin
                .from('payment_requests')
                .select(`
                    *,
                    properties(title),
                    tenant_profile:profiles!payment_requests_tenant_fkey(first_name, last_name, phone)
                `)
                .eq('id', recordId)
                .single();

            if (error || !request) {
                return res.status(404).json({ error: 'Payment request not found for confirmation' });
            }

            const results = { email: false, sms: false };
            const propertyTitle = request.properties?.title || 'Property';
            const amount = request.amount_paid || 0; // The total paid
            const method = request.payment_method || 'cash';

            // Get tenant details
            let tenantPhone = request.tenant_profile?.phone;
            let tenantName = `${request.tenant_profile?.first_name || ''} ${request.tenant_profile?.last_name || ''}`.trim();
            let tenantEmail = null;

            if (request.tenant) {
                try {
                    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(request.tenant);
                    tenantEmail = userData?.user?.email;
                } catch (e) { console.error('Error fetching tenant email:', e); }
            }

            // Send Email
            if (tenantEmail) {
                try {
                    await sendPaymentConfirmedEmail({
                        to: tenantEmail,
                        tenantName: tenantName || 'Tenant',
                        propertyTitle,
                        amount,
                        paymentMethod: method,
                        date: new Date().toLocaleDateString()
                    });
                    results.email = true;
                    console.log(`✅ Payment confirmed email sent to ${tenantEmail}`);
                } catch (e) { console.error('Payment confirmed email error:', e); }
            }

            // Send SMS
            const phone = formatPhoneNumber(tenantPhone);
            if (phone) {
                try {
                    await sendPaymentConfirmedNotification(phone, {
                        propertyTitle,
                        amount: amount.toLocaleString(),
                        method
                    });
                    results.sms = true;
                    console.log(`✅ Payment confirmed SMS sent to ${phone}`);
                } catch (e) { console.error('Payment confirmed SMS error:', e); }
            }

            // Notify family members with the same payment confirmed notification
            if (request.tenant && request.property_id) {
                await notifyFamilyMembers({
                    tenantId: request.tenant,
                    propertyId: request.property_id,
                    smsFn: async (memberPhone) => {
                        await sendPaymentConfirmedNotification(memberPhone, {
                            propertyTitle,
                            amount: amount.toLocaleString(),
                            method
                        })
                    },
                    emailFn: async (memberEmail, member) => {
                        await sendPaymentConfirmedEmail({
                            to: memberEmail,
                            tenantName: member.name || 'Tenant',
                            propertyTitle,
                            amount,
                            paymentMethod: method,
                            date: new Date().toLocaleDateString()
                        })
                    }
                })
            }

            return res.status(200).json({ success: true, type: 'payment_confirmed', results });
        }

        // ============================================
        // NOTIFICATION TYPE: MOVE-IN (For Tenant)
        // ============================================
        if (type === 'move_in') {
            let { tenantEmail, tenantName, tenantPhone, propertyTitle, propertyAddress, startDate, endDate, landlordName, landlordPhone, securityDeposit, rentAmount } = req.body

            // Helper to get tenant info if missing
            if (recordId && (!tenantPhone || !tenantEmail || !tenantName)) {
                try {
                    const { data: occ } = await supabaseAdmin
                        .from('tenant_occupancies')
                        .select(`
                            tenant_id,
                            tenant_profile:profiles!tenant_occupancies_tenant_id_fkey(first_name, last_name, phone)
                        `)
                        .eq('id', recordId)
                        .maybeSingle()

                    if (occ) {
                        if (!tenantPhone) tenantPhone = occ.tenant_profile?.phone
                        if (!tenantName) tenantName = `${occ.tenant_profile?.first_name || ''} ${occ.tenant_profile?.last_name || ''}`.trim()

                        // Also try to get email if still missing
                        if (!tenantEmail && occ.tenant_id) {
                            const { data: userData } = await supabaseAdmin.auth.admin.getUserById(occ.tenant_id)
                            tenantEmail = userData?.user?.email
                        }
                    }
                } catch (e) {
                    console.error('Failed to fetch tenant details for move_in:', e)
                }
            }

            const results = { email: false, sms: false }

            // Resolve tenant email (legacy fallback if strictly just email is missing but phone was present)
            let resolvedEmail = tenantEmail
            if (!resolvedEmail && recordId) {
                try {
                    const { data: occ } = await supabaseAdmin
                        .from('tenant_occupancies')
                        .select('tenant_id')
                        .eq('id', recordId)
                        .maybeSingle()
                    if (occ?.tenant_id) {
                        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(occ.tenant_id)
                        resolvedEmail = userData?.user?.email
                    }
                } catch (e) {
                    console.error('Failed to fetch tenant email fallback:', e)
                }
            }

            // Send Move-In Email
            if (resolvedEmail) {
                try {
                    await sendMoveInEmail({
                        to: resolvedEmail,
                        tenantName: tenantName || 'Tenant',
                        propertyTitle: propertyTitle || 'Property',
                        propertyAddress: propertyAddress || '',
                        startDate: startDate,
                        endDate: endDate,
                        landlordName: landlordName || '',
                        landlordPhone: landlordPhone || '',
                        securityDeposit: securityDeposit || 0,
                        rentAmount: rentAmount || 0
                    })
                    results.email = true
                    console.log(`✅ Move-in email sent to ${resolvedEmail}`)
                } catch (err) {
                    console.error(`Move-in email failed for ${resolvedEmail}:`, err.message)
                }
            }

            // Send Move-In SMS
            const phone = formatPhoneNumber(tenantPhone)
            if (phone) {
                try {
                    await sendMoveInNotification(phone, {
                        propertyName: propertyTitle || 'Property',
                        startDate: new Date(startDate).toLocaleDateString('en-US'),
                        endDate: new Date(endDate).toLocaleDateString('en-US'),
                        rentAmount: Number(rentAmount || 0).toLocaleString()
                    })
                    results.sms = true
                    console.log(`✅ Move-in SMS sent to ${phone}`)
                } catch (err) {
                    console.error(`Move-in SMS failed for ${phone}:`, err.message)
                }
            }

            // Notify family members with the same move-in notification
            if (recordId) {
                const { data: occForFamily } = await supabaseAdmin
                    .from('tenant_occupancies')
                    .select('tenant_id, property_id')
                    .eq('id', recordId)
                    .maybeSingle()
                if (occForFamily) {
                    await notifyFamilyMembers({
                        tenantId: occForFamily.tenant_id,
                        propertyId: occForFamily.property_id,
                        smsFn: async (memberPhone) => {
                            await sendMoveInNotification(memberPhone, {
                                propertyName: propertyTitle || 'Property',
                                startDate: new Date(startDate).toLocaleDateString('en-US'),
                                endDate: new Date(endDate).toLocaleDateString('en-US'),
                                rentAmount: Number(rentAmount || 0).toLocaleString()
                            })
                        },
                        emailFn: async (memberEmail, member) => {
                            await sendMoveInEmail({
                                to: memberEmail,
                                tenantName: member.name || 'Tenant',
                                propertyTitle: propertyTitle || 'Property',
                                propertyAddress: propertyAddress || '',
                                startDate,
                                endDate,
                                landlordName: landlordName || '',
                                landlordPhone: landlordPhone || '',
                                securityDeposit: securityDeposit || 0,
                                rentAmount: rentAmount || 0
                            })
                        }
                    })
                }
            }

            return res.status(200).json({ success: true, type: 'move_in', results })
        }

        // ============================================
        // NOTIFICATION TYPE: RENEWAL STATUS (For Tenant)
        // ============================================
        if (type === 'renewal_status') {
            let { tenantId, tenantName, tenantPhone, propertyTitle, status, newEndDate, signingDate, landlordName } = req.body

            // Resolve Tenant Details if missing (Safety check)
            if (tenantId && (!tenantPhone || !tenantName)) {
                try {
                    const { data: tenantProfile } = await supabaseAdmin
                        .from('profiles')
                        .select('first_name, last_name, phone')
                        .eq('id', tenantId)
                        .single()

                    if (tenantProfile) {
                        if (!tenantPhone) tenantPhone = tenantProfile.phone
                        if (!tenantName) tenantName = `${tenantProfile.first_name || ''} ${tenantProfile.last_name || ''}`.trim()
                    }
                } catch (err) {
                    console.error('Failed to fetch tenant details for renewal status:', err)
                }
            }

            const results = { email: false, sms: false }

            // Resolve tenant email
            let resolvedEmail = null
            if (tenantId) {
                try {
                    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(tenantId)
                    resolvedEmail = userData?.user?.email
                } catch (e) {
                    console.error('Failed to fetch tenant email:', e)
                }
            }

            // Send Email
            if (resolvedEmail) {
                try {
                    await sendRenewalStatusEmail({
                        to: resolvedEmail,
                        tenantName: tenantName || 'Tenant',
                        propertyTitle: propertyTitle || 'Property',
                        status,
                        newEndDate: newEndDate ? new Date(newEndDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
                        signingDate: signingDate ? new Date(signingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
                        landlordName: landlordName || 'Landlord'
                    })
                    results.email = true
                    console.log(`✅ Renewal status email sent to ${resolvedEmail}`)
                } catch (err) {
                    console.error(`Renewal status email failed for ${resolvedEmail}:`, err.message)
                }
            }

            // Send SMS
            const phone = formatPhoneNumber(tenantPhone)
            if (phone) {
                try {
                    await sendRenewalStatus(phone, {
                        propertyTitle: propertyTitle || 'Property',
                        status,
                        newEndDate: newEndDate ? new Date(newEndDate).toLocaleDateString('en-US') : '',
                        signingDate: signingDate ? new Date(signingDate).toLocaleDateString('en-US') : ''
                    })
                    results.sms = true
                    console.log(`✅ Renewal status SMS sent to ${phone}`)
                } catch (err) {
                    console.error(`Renewal status SMS failed for ${phone}:`, err.message)
                }
            }

            // Notify family members with the same renewal status
            if (tenantId && recordId) {
                const { data: occForFamily } = await supabaseAdmin
                    .from('tenant_occupancies')
                    .select('property_id')
                    .eq('id', recordId)
                    .maybeSingle()
                if (occForFamily) {
                    await notifyFamilyMembers({
                        tenantId,
                        propertyId: occForFamily.property_id,
                        smsFn: async (memberPhone) => {
                            await sendRenewalStatus(memberPhone, {
                                propertyTitle: propertyTitle || 'Property',
                                status,
                                newEndDate: newEndDate ? new Date(newEndDate).toLocaleDateString('en-US') : '',
                                signingDate: signingDate ? new Date(signingDate).toLocaleDateString('en-US') : ''
                            })
                        },
                        emailFn: async (memberEmail, member) => {
                            await sendRenewalStatusEmail({
                                to: memberEmail,
                                tenantName: member.name || 'Tenant',
                                propertyTitle: propertyTitle || 'Property',
                                status,
                                newEndDate: newEndDate ? new Date(newEndDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
                                signingDate: signingDate ? new Date(signingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
                                landlordName: landlordName || 'Landlord'
                            })
                        }
                    })
                }
            }

            return res.status(200).json({ success: true, type: 'renewal_status', results })
        }

        // ============================================
        // NOTIFICATION TYPE: RENEWAL REQUEST (For Landlord)
        // ============================================
        if (type === 'renewal_request') {
            const { landlordId, tenantName, propertyTitle, proposedDate } = req.body

            const results = { email: false, sms: false }

            // Get landlord profile & email
            let landlordEmail = null
            let landlordPhone = null
            let landlordName = 'Landlord'

            if (landlordId) {
                try {
                    // Get phone and name
                    const { data: profile } = await supabaseAdmin
                        .from('profiles')
                        .select('first_name, last_name, phone')
                        .eq('id', landlordId)
                        .single()

                    if (profile) {
                        landlordPhone = formatPhoneNumber(profile.phone)
                        landlordName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                    }

                    // Get email
                    const { data: emailData } = await supabaseAdmin.auth.admin.getUserById(landlordId)
                    landlordEmail = emailData?.user?.email
                } catch (e) {
                    console.error('Failed to fetch landlord details:', e)
                }
            }

            // Send Email
            if (landlordEmail) {
                try {
                    await sendRenewalRequestEmail({
                        to: landlordEmail,
                        landlordName,
                        tenantName: tenantName || 'Tenant',
                        propertyTitle: propertyTitle || 'Property',
                        proposedDate: proposedDate ? new Date(proposedDate).toLocaleDateString() : 'Not specified'
                    })
                    results.email = true
                    console.log(`✅ Renewal request email sent to ${landlordEmail}`)
                } catch (err) {
                    console.error(`Renewal request email failed for ${landlordEmail}:`, err.message)
                }
            }

            // Send SMS
            if (landlordPhone) {
                try {
                    await sendRenewalRequest(landlordPhone, {
                        tenantName: tenantName || 'Tenant',
                        propertyTitle: propertyTitle || 'Property',
                        proposedDate: proposedDate ? new Date(proposedDate).toLocaleDateString() : 'Not specified'
                    })
                    results.sms = true
                    console.log(`✅ Renewal request SMS sent to ${landlordPhone}`)
                } catch (err) {
                    console.error(`Renewal request SMS failed for ${landlordPhone}:`, err.message)
                }
            }

            return res.status(200).json({ success: true, type: 'renewal_request', results })
        }

        // ============================================
        // NOTIFICATION TYPE: END CONTRACT (For Tenant)
        // ============================================
        if (type === 'end_contract') {
            const { recordId, reason } = req.body

            // Allow manual overrides if passed, otherwise fetch from DB
            let { tenantId, tenantName, tenantPhone, propertyTitle, endDate } = req.body

            const results = { email: false, sms: false }

            if (recordId && (!tenantId || !propertyTitle)) {
                // Fetch details from occupancy
                const { data: occ, error } = await supabaseAdmin
                    .from('tenant_occupancies')
                    .select(`
                        *,
                        property:properties(title), 
                        tenant_profile:profiles!tenant_occupancies_tenant_id_fkey(first_name, last_name, phone)
                    `)
                    .eq('id', recordId)
                    .single()

                if (occ) {
                    tenantId = occ.tenant_id
                    tenantName = `${occ.tenant_profile?.first_name || ''} ${occ.tenant_profile?.last_name || ''}`.trim()
                    tenantPhone = occ.tenant_profile?.phone
                    propertyTitle = occ.property?.title
                    endDate = occ.end_date || new Date().toISOString()
                }
            }

            // Resolve email
            let tenantEmail = null
            if (tenantId) {
                try {
                    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(tenantId)
                    tenantEmail = userData?.user?.email
                } catch (e) {
                    console.error('Failed to fetch tenant email:', e)
                }
            }

            // Send Email
            if (tenantEmail) {
                try {
                    await sendEndContractEmail({
                        to: tenantEmail,
                        tenantName: tenantName || 'Tenant',
                        propertyTitle: propertyTitle || 'Property',
                        endDate: endDate,
                        customMessage: reason
                    })
                    results.email = true
                    console.log(`✅ End contract email sent to ${tenantEmail}`)
                } catch (err) {
                    console.error(`End contract email failed:`, err.message)
                }
            }

            // Send SMS
            const phone = formatPhoneNumber(tenantPhone)
            if (phone) {
                try {
                    await sendEndContractNotification(phone, {
                        propertyName: propertyTitle || 'Property',
                        reason: reason
                    })
                    results.sms = true
                    console.log(`✅ End contract SMS sent to ${phone}`)
                } catch (err) {
                    console.error(`End contract SMS failed:`, err.message)
                }
            }

            // Notify family members with the same end contract notification
            if (tenantId && recordId) {
                const { data: occForFamily } = await supabaseAdmin
                    .from('tenant_occupancies')
                    .select('property_id')
                    .eq('id', recordId)
                    .maybeSingle()
                if (occForFamily) {
                    await notifyFamilyMembers({
                        tenantId,
                        propertyId: occForFamily.property_id,
                        smsFn: async (memberPhone) => {
                            await sendEndContractNotification(memberPhone, {
                                propertyName: propertyTitle || 'Property',
                                reason
                            })
                        },
                        emailFn: async (memberEmail, member) => {
                            await sendEndContractEmail({
                                to: memberEmail,
                                tenantName: member.name || 'Tenant',
                                propertyTitle: propertyTitle || 'Property',
                                endDate,
                                customMessage: reason
                            })
                        }
                    })
                }
            }

            return res.status(200).json({ success: true, type: 'end_contract', results })
        }

        // ============================================
        // NOTIFICATION TYPE: MAINTENANCE STATUS
        // ============================================
        if (type === 'maintenance_status') {
            const { recordId, actorId } = req.body;

            if (recordId && actorId) {
                // Fetch request and actor role
                const { data: request } = await supabaseAdmin
                    .from('maintenance_requests')
                    .select(`
                        title,
                        status,
                        properties(landlord),
                        tenant_profile:profiles!maintenance_requests_tenant_fkey(first_name, last_name)
                     `)
                    .eq('id', recordId)
                    .single();

                const { data: actorProfile } = await supabaseAdmin
                    .from('profiles')
                    .select('role')
                    .eq('id', actorId)
                    .single();

                if (request && actorProfile) {
                    // If tenant marked it as completed
                    if (actorProfile.role === 'tenant' && request.status === 'completed' && request.properties?.landlord) {
                        const tenantName = `${request.tenant_profile?.first_name || ''} ${request.tenant_profile?.last_name || ''}`.trim();
                        const { data: landlordProfile } = await supabaseAdmin
                            .from('profiles')
                            .select('phone')
                            .eq('id', request.properties.landlord)
                            .single();

                        const landlordPhone = formatPhoneNumber(landlordProfile?.phone);
                        if (landlordPhone) {
                            try {
                                await sendMaintenanceDoneNotification(landlordPhone, {
                                    tenantName,
                                    title: request.title
                                });
                                console.log(`✅ Maintenance Done SMS sent to landlord ${landlordPhone}`);
                            } catch (e) {
                                console.error(`Maintenance Done SMS failed:`, e.message);
                            }
                        }
                    }
                }
            }
            return res.status(200).json({ success: true, type: 'maintenance_status' });
        }

        return res.status(400).json({ error: `Unknown notification type: ${type}` })

    } catch (error) {
        console.error('Notify API Error:', error)
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}
