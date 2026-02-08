// pages/api/notify.js
// Centralized API for sending SMS and Email notifications

import { createClient } from '@supabase/supabase-js'
import { sendBillNotification, sendNewBookingNotification } from '../../lib/sms'
import { sendNewPaymentBillEmail, sendNewBookingNotificationEmail, sendCashPaymentNotificationEmail } from '../../lib/email'

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

            const tenant = paymentRequest.tenant_profile
            const phone = formatPhoneNumber(tenant?.phone)
            const propertyTitle = paymentRequest.properties?.title || 'Property'
            const tenantName = `${tenant?.first_name || ''} ${tenant?.last_name || ''}`.trim() || 'Tenant'

            // Get tenant email
            const { data: tenantEmail } = await supabaseAdmin.rpc('get_user_email', {
                user_id: paymentRequest.tenant
            })

            // Determine bill type and amount
            let billType = 'other'
            let amount = 0
            let dueDate = paymentRequest.due_date

            if (paymentRequest.rent_amount > 0) {
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
            const { landlordEmail, landlordName, tenantName, propertyTitle, amount, monthsCovered, paymentMethod } = req.body

            if (!landlordEmail) {
                return res.status(400).json({ error: 'Missing landlordEmail' })
            }

            const results = { email: false }

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

            return res.status(200).json({ success: true, type: 'cash_payment', results })
        }

        return res.status(400).json({ error: `Unknown notification type: ${type}` })

    } catch (error) {
        console.error('Notify API Error:', error)
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}
