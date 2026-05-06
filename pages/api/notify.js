// pages/api/notify.js
// Centralized API for sending SMS and Email notifications

import { createClient } from '@supabase/supabase-js'
import { sendBillNotification, sendNewBookingNotification, sendMoveInNotification, sendRenewalStatus, sendRenewalRequest, sendEndContractNotification, sendPaymentReceivedNotification, sendPaymentConfirmedNotification, sendMaintenanceDoneNotification, sendMaintenanceUpdate, sendSMS } from '../../lib/sms'
import { sendNewPaymentBillEmail, sendNewBookingNotificationEmail, sendCashPaymentNotificationEmail, sendMoveInEmail, sendRenewalStatusEmail, sendRenewalRequestEmail, sendEndContractEmail, sendOnlinePaymentReceivedEmail, sendPaymentConfirmedEmail, sendNotificationEmail } from '../../lib/email'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)
const PHILIPPINE_TIME_ZONE = 'Asia/Manila'
const HAS_EXPLICIT_TZ_REGEX = /(?:[zZ]|[+\-]\d{2}:?\d{2})$/
const LOCAL_DATETIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

// Helper: Format Phone Number
function formatPhoneNumber(phone) {
    if (!phone) return null;
    let clean = phone.replace(/\D/g, '');
    if (clean.length < 10) return null;
    if (clean.startsWith('09')) return '+63' + clean.substring(1);
    if (clean.startsWith('63')) return '+' + clean;
    return '+' + clean;
}

function parseDateInPhilippineTime(value) {
    if (value === null || value === undefined || value === '') return null

    const raw = String(value).trim()
    if (!raw) return null

    const normalized = raw.replace(' ', 'T')
    if (!HAS_EXPLICIT_TZ_REGEX.test(normalized)) {
        const match = normalized.match(LOCAL_DATETIME_REGEX)
        if (match) {
            const year = Number(match[1])
            const month = Number(match[2])
            const day = Number(match[3])
            const hour = Number(match[4])
            const minute = Number(match[5])
            const second = Number(match[6] || '0')
            const millisecond = Number((match[7] || '0').padEnd(3, '0'))
            const utcMillis = Date.UTC(year, month - 1, day, hour - 8, minute, second, millisecond)
            return new Date(utcMillis)
        }
    }

    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatPhilippineDateTime(dateLike, options) {
    const parsed = parseDateInPhilippineTime(dateLike)
    if (!parsed) return ''

    return new Intl.DateTimeFormat('en-US', {
        timeZone: PHILIPPINE_TIME_ZONE,
        ...options
    }).format(parsed)
}

function buildTimeRangeLabel(startValue, endValue) {
    const startLabel = formatPhilippineDateTime(startValue, { hour: 'numeric', minute: '2-digit' })
    if (!startLabel) return ''

    const endLabel = formatPhilippineDateTime(endValue, { hour: 'numeric', minute: '2-digit' })
    return endLabel ? `${startLabel} - ${endLabel}` : startLabel
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

// Helper: Get family members for a tenant's occupancy on a property
// Returns array of { id, phone, email, name } for each family member
async function getFamilyMembersForNotification(tenantId, propertyId, occupancyId = null) {
    if ((!tenantId || !propertyId) && !occupancyId) return []
    try {
        let primaryOcc = null

        if (occupancyId) {
            // If we have exact occupancy ID, fetch it directly regardless of status
            const { data } = await supabaseAdmin
                .from('tenant_occupancies')
                .select('id, is_family_member, parent_occupancy_id')
                .eq('id', occupancyId)
                .single()
            primaryOcc = data
        } else {
            // Find the primary occupancy for this tenant on this property
            const { data } = await supabaseAdmin
                .from('tenant_occupancies')
                .select('id, is_family_member, parent_occupancy_id')
                .eq('tenant_id', tenantId)
                .eq('property_id', propertyId)
                .in('status', ['active', 'pending_end', 'ended'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            primaryOcc = data
        }

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

        for (const fm of familyMembers) {
            if (fm.member_id === tenantId) continue
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
async function notifyFamilyMembers({ tenantId, propertyId, occupancyId = null, smsFn, emailFn }) {
    const members = await getFamilyMembersForNotification(tenantId, propertyId, occupancyId)
    if (members.length === 0) return

    for (const member of members) {
        // SMS
        if (smsFn && member.phone) {
            const phone = formatPhoneNumber(member.phone)
            if (phone) {
                try {
                    await smsFn(phone, member)
                } catch (err) {
                    console.error(`Family SMS failed for ${phone}:`, err.message)
                }
            }
        }
        // Email
        if (emailFn && member.email) {
            try {
                await emailFn(member.email, member)
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
            const scheduleStart = booking.start_time || booking.booking_date
            const timeSlot = buildTimeRangeLabel(scheduleStart, booking.end_time)
            const scheduleDate = formatPhilippineDateTime(scheduleStart, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }) || 'Not specified'

            const results = { sms: false, email: false }

            // Send SMS to Landlord
            if (landlordPhone) {
                try {
                    await sendNewBookingNotification(landlordPhone, {
                        tenantName,
                        propertyName: propertyTitle,
                        date: scheduleDate,
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
                        bookingDate: scheduleStart,
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
        // NOTIFICATION TYPE: BOOKING REJECTED (For Tenant)
        // ============================================
        if (type === 'booking_rejected') {
            const reason = String(req.body.reason || '').trim()
            if (!reason) {
                return res.status(400).json({ error: 'Missing rejection reason' })
            }

            const { data: booking, error } = await supabaseAdmin
                .from('bookings')
                .select(`
                    id,
                    tenant,
                    booking_date,
                    property:properties(title),
                    tenant_profile:profiles!bookings_tenant_fkey(first_name, last_name, phone)
                `)
                .eq('id', recordId)
                .single()

            if (error || !booking) {
                console.error('Booking not found for rejection notification:', error)
                return res.status(404).json({ error: 'Booking not found' })
            }

            const propertyTitle = booking.property?.title || 'Property'
            const tenantName = `${booking.tenant_profile?.first_name || ''} ${booking.tenant_profile?.last_name || ''}`.trim() || 'Tenant'
            const tenantPhone = formatPhoneNumber(booking.tenant_profile?.phone)

            let tenantEmail = null
            if (booking.tenant) {
                try {
                    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(booking.tenant)
                    tenantEmail = userData?.user?.email || null
                } catch (err) {
                    console.error('Failed to fetch tenant email via auth admin:', err)
                }

                if (!tenantEmail) {
                    try {
                        const { data } = await supabaseAdmin.rpc('get_user_email', { user_id: booking.tenant })
                        tenantEmail = data || null
                    } catch (err) {
                        console.error('Failed to fetch tenant email via RPC:', err)
                    }
                }
            }

            let landlordName = 'Landlord'
            if (actorId) {
                try {
                    const { data: actorProfile } = await supabaseAdmin
                        .from('profiles')
                        .select('first_name, last_name')
                        .eq('id', actorId)
                        .maybeSingle()
                    if (actorProfile) {
                        landlordName = `${actorProfile.first_name || ''} ${actorProfile.last_name || ''}`.trim() || 'Landlord'
                    }
                } catch (err) {
                    console.error('Failed to resolve landlord name for rejection notification:', err)
                }
            }

            const safeReason = escapeHtml(reason)
            const smsReason = reason.length > 220 ? `${reason.slice(0, 217)}...` : reason
            const results = { sms: false, email: false }

            if (tenantPhone) {
                try {
                    await sendSMS(tenantPhone, `Abalay: Your viewing request for "${propertyTitle}" was rejected. Reason: ${smsReason}`)
                    results.sms = true
                    console.log(`✅ Rejection SMS sent to tenant ${tenantPhone}`)
                } catch (err) {
                    console.error(`Rejection SMS failed for ${tenantPhone}:`, err.message)
                }
            }

            if (tenantEmail) {
                try {
                    await sendNotificationEmail({
                        to: tenantEmail,
                        subject: `Viewing Request Rejected - ${propertyTitle}`,
                        message: `
                            <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
                                <h2 style="margin: 0 0 12px; color: #b91c1c;">Viewing Request Rejected</h2>
                                <p>Hi <strong>${escapeHtml(tenantName)}</strong>,</p>
                                <p>Your viewing request for <strong>${escapeHtml(propertyTitle)}</strong> was rejected by ${escapeHtml(landlordName)}.</p>
                                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 12px; margin: 16px 0;">
                                    <p style="margin: 0 0 6px; font-weight: 700; color: #7f1d1d;">Reason from landlord:</p>
                                    <p style="margin: 0; color: #991b1b;">${safeReason}</p>
                                </div>
                                <p style="margin: 0;">You can check your booking page for details and book another viewing schedule if needed.</p>
                            </div>
                        `
                    })
                    results.email = true
                    console.log(`✅ Rejection email sent to tenant ${tenantEmail}`)
                } catch (err) {
                    console.error(`Rejection email failed for ${tenantEmail}:`, err.message)
                }
            }

            return res.status(200).json({ success: true, type: 'booking_rejected', results })
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
                    // Note: PayMongo flow doesn't give us occupancy ID directly, so it relies on tenant/property
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
                        startDate: formatPhilippineDateTime(startDate, { year: 'numeric', month: 'numeric', day: 'numeric' }),
                        endDate: formatPhilippineDateTime(endDate, { year: 'numeric', month: 'numeric', day: 'numeric' }),
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
                        occupancyId: recordId, // Pass the explicit exact occupancy ID
                        smsFn: async (memberPhone) => {
                            await sendMoveInNotification(memberPhone, {
                                propertyName: propertyTitle || 'Property',
                                startDate: formatPhilippineDateTime(startDate, { year: 'numeric', month: 'numeric', day: 'numeric' }),
                                endDate: formatPhilippineDateTime(endDate, { year: 'numeric', month: 'numeric', day: 'numeric' }),
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
                        newEndDate: newEndDate ? formatPhilippineDateTime(newEndDate, { year: 'numeric', month: 'long', day: 'numeric' }) : '',
                        signingDate: signingDate ? formatPhilippineDateTime(signingDate, { year: 'numeric', month: 'long', day: 'numeric' }) : '',
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
                        newEndDate: newEndDate ? formatPhilippineDateTime(newEndDate, { year: 'numeric', month: 'numeric', day: 'numeric' }) : '',
                        signingDate: signingDate ? formatPhilippineDateTime(signingDate, { year: 'numeric', month: 'numeric', day: 'numeric' }) : ''
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
                        occupancyId: recordId, // Pass the explicit exact occupancy ID
                        smsFn: async (memberPhone) => {
                            await sendRenewalStatus(memberPhone, {
                                propertyTitle: propertyTitle || 'Property',
                                status,
                                newEndDate: newEndDate ? formatPhilippineDateTime(newEndDate, { year: 'numeric', month: 'numeric', day: 'numeric' }) : '',
                                signingDate: signingDate ? formatPhilippineDateTime(signingDate, { year: 'numeric', month: 'numeric', day: 'numeric' }) : ''
                            })
                        },
                        emailFn: async (memberEmail, member) => {
                            await sendRenewalStatusEmail({
                                to: memberEmail,
                                tenantName: member.name || 'Tenant',
                                propertyTitle: propertyTitle || 'Property',
                                status,
                                newEndDate: newEndDate ? formatPhilippineDateTime(newEndDate, { year: 'numeric', month: 'long', day: 'numeric' }) : '',
                                signingDate: signingDate ? formatPhilippineDateTime(signingDate, { year: 'numeric', month: 'long', day: 'numeric' }) : '',
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

            if (recordId && (!tenantId || !propertyTitle || !endDate)) {
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
                    endDate = endDate || occ.end_request_date || occ.end_date || occ.contract_end_date || new Date().toISOString()
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
                        occupancyId: recordId, // Pass explicit occupancy ID to ensure we find "ended" ones
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
        // NOTIFICATION TYPE: MAINTENANCE COST LOGGED (For Tenant)
        // ============================================
        if (type === 'maintenance_cost_logged') {
            const { data: request, error } = await supabaseAdmin
                .from('maintenance_requests')
                .select(`
                    id,
                    title,
                    tenant,
                    maintenance_cost,
                    cost_deducted_from_deposit,
                    properties(title),
                    tenant_profile:profiles!maintenance_requests_tenant_fkey(first_name, last_name, phone)
                `)
                .eq('id', recordId)
                .single()

            if (error || !request) {
                console.error('Maintenance request not found for maintenance_cost_logged:', error)
                return res.status(404).json({ error: 'Maintenance request not found' })
            }

            const tenantPhone = formatPhoneNumber(request.tenant_profile?.phone)
            let tenantEmail = null
            try {
                const { data: userData } = await supabaseAdmin.auth.admin.getUserById(request.tenant)
                tenantEmail = userData?.user?.email || null
            } catch (e) {
                console.error('Failed to fetch tenant email for maintenance cost logged:', e)
            }

            const tenantName = `${request.tenant_profile?.first_name || ''} ${request.tenant_profile?.last_name || ''}`.trim() || 'Tenant'
            const propertyTitle = request.properties?.title || 'Property'
            const amount = Number(request.maintenance_cost || 0)
            const wasDeducted = !!request.cost_deducted_from_deposit
            const modeLabel = wasDeducted ? 'deducted from your security deposit' : 'sent as a payment cost bill'

            const results = { sms: false, email: false }

            if (tenantPhone) {
                try {
                    await sendMaintenanceUpdate(tenantPhone, {
                        title: request.title,
                        status: 'completed',
                        note: `Cost ₱${amount.toLocaleString()} was ${modeLabel}.`
                    })
                    results.sms = true
                } catch (err) {
                    console.error(`Maintenance cost SMS failed for ${tenantPhone}:`, err.message)
                }
            }

            if (tenantEmail) {
                try {
                    await sendNotificationEmail({
                        to: tenantEmail,
                        subject: `Maintenance Cost Logged - ${propertyTitle}`,
                        message: `
                            <div style="font-family: Helvetica, Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                                <h2 style="margin-bottom: 8px; color: #111;">Maintenance Cost Logged</h2>
                                <p>Hi <strong>${tenantName}</strong>,</p>
                                <p>Your landlord logged a maintenance cost for <strong>${request.title}</strong> at <strong>${propertyTitle}</strong>.</p>
                                <p style="margin: 12px 0;"><strong>Amount:</strong> ₱${amount.toLocaleString()}</p>
                                <p style="margin: 12px 0;"><strong>Handling:</strong> ${wasDeducted ? 'Deducted from your security deposit' : 'Sent as a payment cost bill'}</p>
                                <p>Please check your dashboard for details.</p>
                            </div>
                        `
                    })
                    results.email = true
                } catch (err) {
                    console.error(`Maintenance cost email failed for ${tenantEmail}:`, err.message)
                }
            }

            return res.status(200).json({ success: true, type: 'maintenance_cost_logged', results })
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
        // ============================================
        // NOTIFICATION TYPE: FAMILY MEMBER PAYMENT (For Primary Tenant / Mother)
        // ============================================
        if (type === 'family_payment') {
            const { recipientEmail, recipientPhone, recipientName, familyMemberName, propertyTitle, amount, paymentMethod } = req.body

            const results = { email: false, sms: false }
            const methodLabel = paymentMethod === 'qr_code' ? 'QR Code' : paymentMethod === 'credit' ? 'Credit Balance' : paymentMethod || 'Cash'

            // Send Email to Primary Tenant
            if (recipientEmail) {
                try {
                    const { sendNotificationEmail } = await import('../../lib/email')
                    await sendNotificationEmail({
                        to: recipientEmail,
                        subject: `Family Payment - ${familyMemberName || 'A family member'} paid ₱${(amount || 0).toLocaleString()}`,
                        message: `Hi ${recipientName || 'Tenant'},\n\nYour family member ${familyMemberName || 'a family member'} has paid ₱${(amount || 0).toLocaleString()} for ${propertyTitle || 'your property'} via ${methodLabel}.\n\nThe payment is now awaiting landlord confirmation.\n\nThank you,\Abalay`
                    })
                    results.email = true
                    console.log(`✅ Family payment email sent to ${recipientEmail}`)
                } catch (err) {
                    console.error(`Family payment email failed for ${recipientEmail}:`, err.message)
                }
            }

            // Send SMS to Primary Tenant
            if (recipientPhone) {
                const phone = formatPhoneNumber(recipientPhone)
                if (phone) {
                    try {
                        const { sendSMS } = await import('../../lib/sms')
                        await sendSMS(phone, `[Abalay] Your family member ${familyMemberName || 'someone'} paid ₱${(amount || 0).toLocaleString()} for ${propertyTitle || 'your property'} via ${methodLabel}. Awaiting landlord confirmation.`)
                        results.sms = true
                        console.log(`✅ Family payment SMS sent to ${phone}`)
                    } catch (err) {
                        console.error(`Family payment SMS failed for ${phone}:`, err.message)
                    }
                }
            }

            return res.status(200).json({ success: true, type: 'family_payment', results })
        }

        return res.status(400).json({ error: `Unknown notification type: ${type}` })

    } catch (error) {
        console.error('Notify API Error:', error)
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}
