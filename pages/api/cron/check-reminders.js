import { createClient } from '@supabase/supabase-js'
import { sendBookingReminder, sendUnreadMessageNotification } from '../../../lib/sms'

// Initialize Admin Client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// --- HELPER: Fix Phone Number Format ---
function formatPhoneNumber(phone) {
  if (!phone) return null;
  
  // Remove all non-numeric characters
  let clean = phone.replace(/\D/g, '');

  // Must have a reasonable length (e.g., 10-15 digits)
  if (clean.length < 10) return null; // Reject short numbers like "123"

  // Standardize to +63 format for PH
  if (clean.startsWith('09')) {
    return '+63' + clean.substring(1);
  }
  if (clean.startsWith('63')) {
    return '+' + clean;
  }
  
  // If it looks like an international number already, return it with +
  return '+' + clean;
}

export default async function handler(req, res) {
  // 1. Security Check
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { bookings_sent: 0, bookings_failed: 0, messages_sent: 0, messages_failed: 0 }

  try {
    // ====================================================
    // A. BOOKING REMINDERS (12 Hours Before)
    // ====================================================
    const twelveHoursFromNow = new Date();
    twelveHoursFromNow.setHours(twelveHoursFromNow.getHours() + 12);
    
    const { data: upcomingBookings } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        property:properties(title),
        tenant_profile:profiles!tenant(phone, first_name, phone_verified) 
      `)
      .eq('status', 'approved')
      .eq('reminder_sent', false)
      .lte('booking_date', twelveHoursFromNow.toISOString())
      .gt('booking_date', new Date().toISOString())

    if (upcomingBookings && upcomingBookings.length > 0) {
      for (const booking of upcomingBookings) {
        // Validation
        if (!booking.tenant_profile?.phone || !booking.tenant_profile?.phone_verified) {
           console.log(`Skipping booking ${booking.id}: User unverified or no phone`);
           continue; 
        }

        const validPhone = formatPhoneNumber(booking.tenant_profile.phone);
        if (!validPhone) {
           console.log(`Skipping booking ${booking.id}: Invalid phone format (${booking.tenant_profile.phone})`);
           results.bookings_failed++;
           continue;
        }

        // Try to send SMS - Catch errors individually so the job doesn't crash
        try {
          await sendBookingReminder(validPhone, {
            propertyName: booking.property?.title,
            date: new Date(booking.booking_date).toLocaleDateString(),
            time: new Date(booking.booking_date).toLocaleTimeString(),
          })

          // Mark as sent
          await supabaseAdmin
            .from('bookings')
            .update({ reminder_sent: true })
            .eq('id', booking.id)
            
          results.bookings_sent++;
        } catch (err) {
          console.error(`Failed to send booking SMS to ${validPhone}:`, err.message);
          results.bookings_failed++;
          // We continue to the next iteration!
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
        receiver:profiles!receiver_id(id, phone, first_name, phone_verified),
        sender:profiles!sender_id(first_name, last_name)
      `)
      .eq('read', false) 
      .eq('reminder_sent', false)
      .lte('created_at', sixHoursAgo.toISOString())

    if (unreadMessages && unreadMessages.length > 0) {
      const grouped = {}
      
      // Group messages by receiver
      unreadMessages.forEach(msg => {
        const userId = msg.receiver_id;
        if (!grouped[userId]) {
          grouped[userId] = { 
            phone: msg.receiver?.phone,
            verified: msg.receiver?.phone_verified,
            senders: new Set(), 
            ids: [] 
          }
        }
        grouped[userId].ids.push(msg.id)
        grouped[userId].senders.add(msg.sender?.first_name || 'Someone')
      })

      for (const userId in grouped) {
        const item = grouped[userId]
        
        // Validation
        if (!item.phone || !item.verified) continue;

        const validPhone = formatPhoneNumber(item.phone);
        if (!validPhone) {
           console.log(`Skipping message alert for user ${userId}: Invalid phone`);
           results.messages_failed++;
           continue;
        }

        // Try to send SMS
        try {
          const senderNames = Array.from(item.senders).join(', ')
          
          await sendUnreadMessageNotification(
            validPhone, 
            item.ids.length, 
            senderNames
          )

          // Mark as sent
          await supabaseAdmin
            .from('messages')
            .update({ reminder_sent: true })
            .in('id', item.ids)

          results.messages_sent += item.ids.length;
        } catch (err) {
          console.error(`Failed to send message SMS to ${validPhone}:`, err.message);
          results.messages_failed += item.ids.length;
        }
      }
    }

    res.status(200).json({ success: true, report: results })

  } catch (error) {
    console.error('Critical Cron Error:', error)
    res.status(500).json({ error: error.message })
  }
}