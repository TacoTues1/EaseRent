import { createClient } from '@supabase/supabase-js'
import { sendNotificationEmail } from '../../lib/email'
import { sendBookingReminder, sendUnreadMessageNotification } from '../../lib/sms'

// Initialize Admin Client
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
  const results = { bookings_processed: 0, messages_processed: 0, errors: 0 }

  try {
    // ====================================================
    // A. BOOKING REMINDERS (12 Hours Before)
    // ====================================================
    const twelveHoursFromNow = new Date();
    twelveHoursFromNow.setHours(twelveHoursFromNow.getHours() + 12);
    
    // Fetch bookings with Email AND Phone
    const { data: upcomingBookings } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        property:properties(title),
        tenant_profile:profiles!tenant(email, first_name, phone) 
      `)
      .eq('status', 'approved')
      .eq('reminder_sent', false)
      .lte('booking_date', twelveHoursFromNow.toISOString())
      .gt('booking_date', new Date().toISOString())

    if (upcomingBookings && upcomingBookings.length > 0) {
      for (const booking of upcomingBookings) {
        const email = booking.tenant_profile?.email
        const phone = formatPhoneNumber(booking.tenant_profile?.phone)
        const name = booking.tenant_profile?.first_name || 'Tenant'
        
        let sentAny = false

        // 1. Send EMAIL (Free)
        if (email) {
          try {
            const subject = `📅 Reminder: Viewing for ${booking.property?.title}`
            const htmlContent = `
              <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                <h2>Upcoming Viewing Reminder</h2>
                <p>Hi <strong>${name}</strong>,</p>
                <p>This is a friendly reminder about your viewing schedule:</p>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>🏠 Property:</strong> ${booking.property?.title}</p>
                  <p style="margin: 5px 0;"><strong>📅 Date:</strong> ${new Date(booking.booking_date).toLocaleDateString()}</p>
                  <p style="margin: 5px 0;"><strong>⏰ Time:</strong> ${new Date(booking.booking_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
                <p>Please log in to your dashboard if you need to reschedule.</p>
              </div>
            `
            await sendNotificationEmail({ to: email, subject, message: htmlContent })
            sentAny = true
          } catch (err) {
            console.error(`Email failed for ${email}:`, err.message)
          }
        }

        // 2. Send SMS (Paid - Skipped if fails)
        if (phone) {
          try {
            await sendBookingReminder(phone, {
              propertyName: booking.property?.title,
              date: new Date(booking.booking_date).toLocaleDateString(),
              time: new Date(booking.booking_date).toLocaleTimeString(),
            })
            sentAny = true
          } catch (err) {
            console.error(`SMS failed for ${phone}:`, err.message)
          }
        }

        // 3. Update DB if EITHER sent
        if (sentAny) {
          await supabaseAdmin.from('bookings').update({ reminder_sent: true }).eq('id', booking.id)
          results.bookings_processed++
        }
      }
    }

    // ====================================================
    // B. UNREAD MESSAGES (6 Hours Old)
    // ====================================================
    const sixHoursAgo = new Date();
    sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);

    const { data: unreadMessages } = await supabaseAdmin
      .from('messages')
      .select(`
        *,
        receiver:profiles!receiver_id(id, email, first_name, phone),
        sender:profiles!sender_id(first_name, last_name)
      `)
      .eq('read', false) 
      .eq('reminder_sent', false)
      .lte('created_at', sixHoursAgo.toISOString())

    if (unreadMessages && unreadMessages.length > 0) {
      const grouped = {}
      
      unreadMessages.forEach(msg => {
        const userId = msg.receiver_id;
        if (!grouped[userId]) {
          grouped[userId] = { 
            email: msg.receiver?.email,
            phone: formatPhoneNumber(msg.receiver?.phone),
            name: msg.receiver?.first_name || 'User',
            senders: new Set(), 
            ids: [] 
          }
        }
        grouped[userId].ids.push(msg.id)
        grouped[userId].senders.add(msg.sender?.first_name || 'Someone')
      })

      for (const userId in grouped) {
        const item = grouped[userId]
        let sentAny = false
        const senderNames = Array.from(item.senders).join(', ')

        // 1. Send EMAIL
        if (item.email) {
          try {
            const subject = `💬 You have ${item.ids.length} unread message(s)`
            const htmlContent = `
              <div style="font-family: sans-serif; color: #333;">
                <h2>Unread Messages</h2>
                <p>Hi <strong>${item.name}</strong>,</p>
                <p>You have unread messages from: <strong>${senderNames}</strong>.</p>
                <p>Please log in to your dashboard to reply.</p>
              </div>
            `
            await sendNotificationEmail({ to: item.email, subject, message: htmlContent })
            sentAny = true
          } catch (err) {
            console.error(`Message Email failed for ${item.email}:`, err.message)
          }
        }

        // 2. Send SMS
        if (item.phone) {
          try {
            await sendUnreadMessageNotification(item.phone, item.ids.length, senderNames)
            sentAny = true
          } catch (err) {
            console.error(`Message SMS failed for ${item.phone}:`, err.message)
          }
        }

        // 3. Update DB
        if (sentAny) {
          await supabaseAdmin.from('messages').update({ reminder_sent: true }).in('id', item.ids)
          results.messages_processed += item.ids.length
        }
      }
    }

    res.status(200).json({ success: true, report: results })

  } catch (error) {
    console.error('Manual Reminder Error:', error)
    res.status(500).json({ error: error.message })
  }
}