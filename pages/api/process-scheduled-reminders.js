// pages/api/process-scheduled-reminders.js
// Processes any due reminders from the scheduled_reminders queue
// Called automatically when any user visits the site

import { createClient } from '@supabase/supabase-js'
import { sendNotificationEmail } from '../../lib/email'
import { sendUnreadMessageNotification, sendBookingReminder } from '../../lib/sms'

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
    const results = { processed: 0, messages: 0, bookings: 0, errors: 0 }

    try {
        // 1. Fetch all due reminders (send_at <= NOW and not sent)
        const { data: dueReminders, error } = await supabaseAdmin
            .from('scheduled_reminders')
            .select('*')
            .eq('sent', false)
            .lte('send_at', new Date().toISOString())
            .limit(50) // Process max 50 at a time

        if (error) {
            console.error('Error fetching reminders:', error)
            return res.status(500).json({ error: error.message })
        }

        if (!dueReminders || dueReminders.length === 0) {
            return res.status(200).json({ success: true, message: 'No due reminders', results })
        }

        // 2. Process each reminder
        for (const reminder of dueReminders) {
            try {
                if (reminder.type === 'unread_message') {
                    await processUnreadMessageReminder(reminder)
                    results.messages++
                } else if (reminder.type === 'booking_reminder') {
                    await processBookingReminder(reminder)
                    results.bookings++
                }

                // Mark as sent
                await supabaseAdmin
                    .from('scheduled_reminders')
                    .update({ sent: true })
                    .eq('id', reminder.id)

                results.processed++
            } catch (err) {
                console.error(`Error processing reminder ${reminder.id}:`, err)
                results.errors++
            }
        }

        return res.status(200).json({ success: true, results })

    } catch (error) {
        console.error('Process reminders error:', error)
        return res.status(500).json({ error: error.message })
    }
}

// Process unread message reminders
async function processUnreadMessageReminder(reminder) {
    // Fetch the message
    const { data: message } = await supabaseAdmin
        .from('messages')
        .select(`
      *,
      receiver:profiles!receiver_id(id, first_name, phone),
      sender:profiles!sender_id(first_name, last_name)
    `)
        .eq('id', reminder.target_id)
        .single()

    if (!message) return

    // Skip if already read or reminder already sent via old system
    if (message.read || message.reminder_sent) {
        return
    }

    // Get receiver email
    const { data: receiverEmail } = await supabaseAdmin.rpc('get_user_email', {
        user_id: message.receiver_id
    })

    const receiver = message.receiver
    const senderName = `${message.sender?.first_name || ''} ${message.sender?.last_name || ''}`.trim() || 'Someone'
    const phone = formatPhoneNumber(receiver?.phone)

    let sentAny = false

    // Send Email
    if (receiverEmail) {
        try {
            const subject = `💬 You have an unread message from ${senderName}`
            const htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f9fafb; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
            <h2 style="color: #111827; margin-top: 0;">💬 Unread Message</h2>
            <p>Hi <strong>${receiver?.first_name || 'there'}</strong>,</p>
            <p>You have an unread message from <strong>${senderName}</strong> that's been waiting for 6+ hours.</p>
            <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/messages" 
               style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 16px;">
              View Message
            </a>
          </div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
            This is an automated reminder from RentSphere.
          </p>
        </div>
      `
            await sendNotificationEmail({ to: receiverEmail, subject, message: htmlContent })
            sentAny = true
            console.log(`✅ Email sent to ${receiverEmail} for unread message`)
        } catch (err) {
            console.error(`Email failed for ${receiverEmail}:`, err.message)
        }
    }

    // Send SMS
    if (phone) {
        try {
            await sendUnreadMessageNotification(phone, 1, senderName)
            sentAny = true
            console.log(`✅ SMS sent to ${phone} for unread message`)
        } catch (err) {
            console.error(`SMS failed for ${phone}:`, err.message)
        }
    }

    // Mark message as reminder_sent
    if (sentAny) {
        await supabaseAdmin
            .from('messages')
            .update({ reminder_sent: true })
            .eq('id', message.id)
    }
}

// Process booking reminders (12 hours before)
async function processBookingReminder(reminder) {
    // Fetch the booking
    const { data: booking } = await supabaseAdmin
        .from('bookings')
        .select(`
      *,
      property:properties(title),
      tenant_profile:profiles!bookings_tenant_fkey(first_name, phone)
    `)
        .eq('id', reminder.target_id)
        .single()

    if (!booking) return

    // Skip if already sent or cancelled/rejected
    if (booking.reminder_sent || !['pending', 'approved', 'accepted'].includes(booking.status)) {
        return
    }

    // Get tenant email
    const { data: tenantEmail } = await supabaseAdmin.rpc('get_user_email', {
        user_id: booking.tenant
    })

    const tenant = booking.tenant_profile
    const phone = formatPhoneNumber(tenant?.phone)
    const propertyTitle = booking.property?.title || 'Property'

    let sentAny = false

    // Send Email
    if (tenantEmail) {
        try {
            const bookingDate = new Date(booking.booking_date)
            const subject = `📅 Reminder: Viewing tomorrow for ${propertyTitle}`
            const htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #eff6ff; border-radius: 12px; padding: 24px; border: 1px solid #bfdbfe;">
            <h2 style="color: #1e40af; margin-top: 0;">📅 Viewing Reminder</h2>
            <p>Hi <strong>${tenant?.first_name || 'there'}</strong>,</p>
            <p>This is a reminder about your upcoming viewing:</p>
            <div style="background: white; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Property:</strong> ${propertyTitle}</p>
              <p style="margin: 4px 0;"><strong>Date:</strong> ${bookingDate.toLocaleDateString()}</p>
              <p style="margin: 4px 0;"><strong>Time:</strong> ${bookingDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <p>Please be on time. See you there!</p>
            <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/bookings" 
               style="display: inline-block; background-color: #1e40af; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 16px;">
              View Booking Details
            </a>
          </div>
        </div>
      `
            await sendNotificationEmail({ to: tenantEmail, subject, message: htmlContent })
            sentAny = true
            console.log(`✅ Email sent to ${tenantEmail} for booking reminder`)
        } catch (err) {
            console.error(`Email failed for ${tenantEmail}:`, err.message)
        }
    }

    // Send SMS
    if (phone) {
        try {
            await sendBookingReminder(phone, {
                propertyName: propertyTitle,
                date: new Date(booking.booking_date).toLocaleDateString(),
                time: new Date(booking.booking_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            })
            sentAny = true
            console.log(`✅ SMS sent to ${phone} for booking reminder`)
        } catch (err) {
            console.error(`SMS failed for ${phone}:`, err.message)
        }
    }

    // Mark booking as reminder_sent
    if (sentAny) {
        await supabaseAdmin
            .from('bookings')
            .update({ reminder_sent: true })
            .eq('id', booking.id)
    }
}
