import { createClient } from '@supabase/supabase-js'
import { sendNotificationEmail } from '../../lib/email'
import { sendSMS, sendBookingReminder, sendUnreadMessageNotification } from '../../lib/sms'

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
  const results = { bookings_processed: 0, messages_processed: 0, rent_reminders_sent: 0, wifi_reminders_sent: 0, electricity_reminders_sent: 0, errors: 0, skipped: null }

  try {
    // ====================================================
    // TIME CHECK: Only run bill reminders between 7:00 AM - 9:00 AM (Philippine Time)
    // ====================================================
    const now = new Date();
    const phTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const currentHour = phTime.getHours();

    // Check if already ran today for bill reminders
    const todayStart = new Date(phTime);
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayRun } = await supabaseAdmin
      .from('notifications')
      .select('id')
      .eq('type', 'daily_reminder_check')
      .gte('created_at', todayStart.toISOString())
      .limit(1);

    const alreadyRanToday = todayRun && todayRun.length > 0;
    const isReminderTime = currentHour >= 7 && currentHour < 9; // 7:00 AM - 9:00 AM window

    console.log(`[Reminder Check] PH Time: ${phTime.toLocaleString()}, Hour: ${currentHour}, Is Reminder Time: ${isReminderTime}, Already Ran Today: ${alreadyRanToday}`);

    // Skip bill reminders if not in time window OR already ran today
    const shouldSendBillReminders = isReminderTime && !alreadyRanToday;

    if (!shouldSendBillReminders) {
      console.log(`[Reminder Check] Skipping bill reminders - Time: ${currentHour}:00, Already ran: ${alreadyRanToday}`);
      results.skipped = `Bill reminders skipped. Current hour: ${currentHour}, Already ran today: ${alreadyRanToday}`;
    } else {
      // Mark that we ran today (create a system notification)
      await supabaseAdmin.from('notifications').insert({
        recipient: '00000000-0000-0000-0000-000000000000', // System placeholder
        actor: '00000000-0000-0000-0000-000000000000',
        type: 'daily_reminder_check',
        message: `Daily reminder check ran at ${phTime.toLocaleString()}`,
        is_read: true
      });
    }

    // ====================================================
    // A. BOOKING REMINDERS (12 Hours Before) - Always runs
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
                  <p style="margin: 5px 0;"><strong>⏰ Time:</strong> ${new Date(booking.booking_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
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

    // ====================================================
    // C. RENT BILL REMINDERS (3 Days Before Due Date - Daily Reminders)
    // Sends notifications every day at 8:00 AM during the 3 days before due date
    // ====================================================
    if (shouldSendBillReminders) {
      // Rent is due on the same day of the month as the contract start date
      // Send reminders on days 3, 2, and 1 before the due date
      const today = new Date();
      const todayDay = today.getDate();
      const todayMonth = today.getMonth();
      const todayYear = today.getFullYear();

      console.log(`[Rent Reminder] ========================================`);
      console.log(`[Rent Reminder] Today: ${today.toDateString()}`);

      // Get all active occupancies
      const { data: allOccupancies, error: occError } = await supabaseAdmin
        .from('tenant_occupancies')
        .select(`
        id,
        tenant_id,
        landlord_id,
        start_date,
        late_payment_fee,
        wifi_due_day,
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone),
        property:properties(id, title, price)
      `)
        .eq('status', 'active');

      if (occError) {
        console.error('[Rent Reminder] Error fetching occupancies:', occError);
      }

      console.log(`[Rent Reminder] Total active occupancies: ${allOccupancies?.length || 0}`);

      // Filter occupancies where today is 1, 2, or 3 days before the due date
      const rentOccupancies = (allOccupancies || []).filter(occ => {
        if (!occ.start_date) return false;
        const startDate = new Date(occ.start_date);
        const dueDay = startDate.getDate();

        // Calculate due date for current month
        const currentMonthDueDate = new Date(todayYear, todayMonth, dueDay);
        const daysUntilDue = Math.floor((currentMonthDueDate - today) / (1000 * 60 * 60 * 24));

        // Check if today is 1, 2, or 3 days before due date
        return daysUntilDue >= 1 && daysUntilDue <= 3;
      });

      console.log(`[Rent Reminder] Matching occupancies (1-3 days before due): ${rentOccupancies.length}`);

      if (rentOccupancies && rentOccupancies.length > 0) {
        for (const occ of rentOccupancies) {
          if (!occ.tenant) continue;

          const startDate = new Date(occ.start_date);
          const dueDay = startDate.getDate();
          const currentMonthDueDate = new Date(todayYear, todayMonth, dueDay);
          const daysUntilDue = Math.floor((currentMonthDueDate - today) / (1000 * 60 * 60 * 24));

          // Check if notification already sent TODAY (not this month)
          const todayStart = new Date(todayYear, todayMonth, todayDay, 0, 0, 0, 0);
          const todayEnd = new Date(todayYear, todayMonth, todayDay, 23, 59, 59, 999);

          const { data: todayNotification } = await supabaseAdmin
            .from('notifications')
            .select('id')
            .eq('recipient', occ.tenant_id)
            .eq('type', 'rent_bill_reminder')
            .gte('created_at', todayStart.toISOString())
            .lte('created_at', todayEnd.toISOString())
            .limit(1);

          const alreadySentToday = todayNotification && todayNotification.length > 0;

          console.log(`[Rent Reminder] Processing ${occ.tenant?.first_name}: daysUntilDue=${daysUntilDue}, alreadySentToday=${alreadySentToday}`);

          if (!alreadySentToday) {
            const rentAmount = occ.property?.price || 0;
            const dueDate = new Date(currentMonthDueDate);
            dueDate.setHours(23, 59, 59, 999);
            const dueDateStr = dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            const monthName = dueDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

            // --- CREATE PAYMENT REQUEST (Rent Bill) - Only on day 3 (first day) ---
            if (daysUntilDue === 3) {
              // Check if bill already exists for this month
              const { data: existingBill } = await supabaseAdmin
                .from('payment_requests')
                .select('id')
                .eq('tenant', occ.tenant_id)
                .eq('property_id', occ.property?.id)
                .gte('due_date', new Date(todayYear, todayMonth, 1).toISOString())
                .lte('due_date', new Date(todayYear, todayMonth + 1, 0).toISOString())
                .eq('status', 'pending')
                .limit(1);

              if (!existingBill || existingBill.length === 0) {
                try {
                  const { error: billError } = await supabaseAdmin.from('payment_requests').insert({
                    landlord: occ.landlord_id,
                    tenant: occ.tenant_id,
                    property_id: occ.property?.id,
                    occupancy_id: occ.id,
                    rent_amount: rentAmount,
                    water_bill: 0,
                    electrical_bill: 0,
                    other_bills: 0,
                    bills_description: `Monthly Rent for ${monthName}`,
                    due_date: dueDate.toISOString(),
                    status: 'pending'
                  });

                  if (billError) {
                    console.error(`[Rent Reminder] Failed to create payment request:`, billError);
                  } else {
                    console.log(`[Rent Reminder] ✅ Payment request created for ${occ.tenant?.first_name}`);
                  }
                } catch (err) {
                  console.error(`[Rent Reminder] Payment request exception:`, err);
                }
              } else {
                console.log(`[Rent Reminder] ⏭️ Payment request already exists for this month`);
              }
            }

            const daysText = daysUntilDue === 3 ? '3 days' : daysUntilDue === 2 ? '2 days' : '1 day';
            const rentMessage = `Rent Bill Reminder (${daysText} before due): Your monthly rent of ₱${Number(rentAmount).toLocaleString()} for "${occ.property?.title || 'your property'}" is due on ${dueDateStr}.${occ.late_payment_fee > 0 ? ` Late payment fee: ₱${Number(occ.late_payment_fee).toLocaleString()}` : ''} Please check your Payments page.`;

            console.log(`[Rent Reminder] Sending notification (${daysText} before): ${rentMessage}`);

            occ.tenant.profile_id = occ.tenant.id;
            await sendUtilityReminder(supabaseAdmin, occ.tenant, 'rent_bill_reminder',
              rentMessage,
              `🏠 Rent Bill Reminder (${daysText} before due)`
            );
            results.rent_reminders_sent++;
            console.log(`[Rent Reminder] ✅ Notification sent to ${occ.tenant?.first_name}`);
          } else {
            console.log(`[Rent Reminder] ⏭️ Skipped ${occ.tenant?.first_name} - already sent today`);
          }
        }
      } else {
        console.log(`[Rent Reminder] No tenants with due dates 1-3 days away`);
      }

      console.log(`[Rent Reminder] ========================================`);

      // ====================================================
      // D. WIFI DUE DATE NOTIFICATIONS (3 Days Before - Daily Reminders)
      // Sends notifications every day at 8:00 AM during the 3 days before due date
      // ====================================================
      // Wifi notifications - just notify, no payment bill created
      console.log(`[Wifi Reminder] ========================================`);

      // Filter occupancies where today is 1, 2, or 3 days before the WiFi due date
      const wifiOccupancies = (allOccupancies || []).filter(occ => {
        if (!occ.wifi_due_day) return false;

        const wifiDueDay = occ.wifi_due_day;
        const currentMonthDueDate = new Date(todayYear, todayMonth, wifiDueDay);
        const daysUntilDue = Math.floor((currentMonthDueDate - today) / (1000 * 60 * 60 * 24));

        // Check if today is 1, 2, or 3 days before due date
        return daysUntilDue >= 1 && daysUntilDue <= 3;
      });

      console.log(`[Wifi Reminder] Matching occupancies (1-3 days before due): ${wifiOccupancies.length}`);

      if (wifiOccupancies.length > 0) {
        for (const occ of wifiOccupancies) {
          if (!occ.tenant) continue;

          const wifiDueDay = occ.wifi_due_day;
          const currentMonthDueDate = new Date(todayYear, todayMonth, wifiDueDay);
          const daysUntilDue = Math.floor((currentMonthDueDate - today) / (1000 * 60 * 60 * 24));

          // Check if notification already sent TODAY
          const todayStart = new Date(todayYear, todayMonth, todayDay, 0, 0, 0, 0);
          const todayEnd = new Date(todayYear, todayMonth, todayDay, 23, 59, 59, 999);

          const { data: todayNotification } = await supabaseAdmin
            .from('notifications')
            .select('id')
            .eq('recipient', occ.tenant_id)
            .eq('type', 'wifi_due_reminder')
            .gte('created_at', todayStart.toISOString())
            .lte('created_at', todayEnd.toISOString())
            .limit(1);

          const alreadySentToday = todayNotification && todayNotification.length > 0;

          console.log(`[Wifi Reminder] Processing ${occ.tenant?.first_name}: daysUntilDue=${daysUntilDue}, alreadySentToday=${alreadySentToday}`);

          if (!alreadySentToday) {
            const dueDate = new Date(currentMonthDueDate);
            const dueDateStr = `${wifiDueDay}${[11, 12, 13].includes(wifiDueDay) ? 'th' : ['st', 'nd', 'rd'][wifiDueDay % 10 - 1] || 'th'} of ${dueDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
            const daysText = daysUntilDue === 3 ? '3 days' : daysUntilDue === 2 ? '2 days' : '1 day';

            const wifiMessage = `WiFi Bill Reminder (${daysText} before due): Your WiFi bill for "${occ.property?.title || 'your property'}" is due on ${dueDateStr}. Please ensure timely payment to avoid service interruption.`;

            console.log(`[Wifi Reminder] Sending reminder (${daysText} before): ${wifiMessage}`);

            occ.tenant.profile_id = occ.tenant.id;
            await sendUtilityReminder(supabaseAdmin, occ.tenant, 'wifi_due_reminder',
              wifiMessage,
              `📶 WiFi Bill Due Reminder (${daysText} before due)`
            );
            results.wifi_reminders_sent = (results.wifi_reminders_sent || 0) + 1;
            console.log(`[Wifi Reminder] ✅ Reminder sent to ${occ.tenant?.first_name}`);
          } else {
            console.log(`[Wifi Reminder] ⏭️ Skipped ${occ.tenant?.first_name} - already sent today`);
          }
        }
      } else {
        console.log(`[Wifi Reminder] No tenants with WiFi due dates 1-3 days away`);
      }

      console.log(`[Wifi Reminder] ========================================`);

      // ====================================================
      // E. ELECTRICITY DUE DATE NOTIFICATIONS (First Week of Month - Daily Reminders)
      // Sends notifications every day at 8:00 AM on days 1, 2, 3 of the month
      // Electricity is due in the first week, so we remind at the start of that week
      // ====================================================
      console.log(`[Electric Reminder] ========================================`);
      console.log(`[Electric Reminder] Today is day ${todayDay} of the month`);

      // Send electricity reminders on days 1, 2, 3 of every month (start of first week)
      if (todayDay >= 1 && todayDay <= 3) {
        console.log(`[Electric Reminder] First 3 days of month - sending to ALL active tenants`);

        for (const occ of (allOccupancies || [])) {
          if (!occ.tenant) continue;

          // Check if notification already sent TODAY
          const todayStart = new Date(todayYear, todayMonth, todayDay, 0, 0, 0, 0);
          const todayEnd = new Date(todayYear, todayMonth, todayDay, 23, 59, 59, 999);

          const { data: todayNotification } = await supabaseAdmin
            .from('notifications')
            .select('id')
            .eq('recipient', occ.tenant_id)
            .eq('type', 'electricity_due_reminder')
            .gte('created_at', todayStart.toISOString())
            .lte('created_at', todayEnd.toISOString())
            .limit(1);

          const alreadySentToday = todayNotification && todayNotification.length > 0;

          console.log(`[Electric Reminder] Processing ${occ.tenant?.first_name}: alreadySentToday=${alreadySentToday}`);

          if (!alreadySentToday) {
            const monthYear = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const daysText = todayDay === 1 ? '3 days' : todayDay === 2 ? '2 days' : '1 day';

            const electricMessage = `Electricity Bill Reminder (${daysText} into first week): Your electricity bill for "${occ.property?.title || 'your property'}" is due in the first week of ${monthYear}. Please ensure timely payment to avoid service interruption.`;

            console.log(`[Electric Reminder] Sending reminder (day ${todayDay}): ${electricMessage}`);

            occ.tenant.profile_id = occ.tenant.id;
            await sendUtilityReminder(supabaseAdmin, occ.tenant, 'electricity_due_reminder',
              electricMessage,
              `⚡ Electricity Bill Due Reminder (${daysText} into first week)`
            );
            results.electricity_reminders_sent = (results.electricity_reminders_sent || 0) + 1;
            console.log(`[Electric Reminder] ✅ Reminder sent to ${occ.tenant?.first_name}`);
          } else {
            console.log(`[Electric Reminder] ⏭️ Skipped ${occ.tenant?.first_name} - already sent today`);
          }
        }
      } else {
        console.log(`[Electric Reminder] Not first 3 days of month - skipping electricity reminders`);
      }

      console.log(`[Electric Reminder] ========================================`);
    } // End of shouldSendBillReminders check

    // ====================================================
    // F. CONTRACT EXPIRY REMINDERS (29 Days Before End)
    // ====================================================
    console.log(`[Contract Expiry] ========================================`);
    console.log(`[Contract Expiry] Checking for contracts expiring in 29 days...`);

    try {
      // Calculate the date 29 days from now
      const reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + 29);
      const reminderDateStr = reminderDate.toISOString().split('T')[0];

      // Find active occupancies expiring in 29 days
      const { data: expiringOccupancies, error: expiryError } = await supabaseAdmin
        .from('tenant_occupancies')
        .select(`
          id,
          tenant_id,
          landlord_id,
          contract_end_date,
          property:properties(id, title),
          tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone, email)
        `)
        .eq('status', 'active')
        .gte('contract_end_date', reminderDateStr)
        .lte('contract_end_date', reminderDateStr + 'T23:59:59');

      if (expiryError) {
        console.error('[Contract Expiry] Error:', expiryError);
      } else if (expiringOccupancies && expiringOccupancies.length > 0) {
        results.contract_expiry_reminders_sent = 0;

        for (const occupancy of expiringOccupancies) {
          const tenantName = `${occupancy.tenant?.first_name || ''} ${occupancy.tenant?.last_name || ''}`.trim();
          const propertyTitle = occupancy.property?.title || 'your rental property';
          const endDate = new Date(occupancy.contract_end_date).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric'
          });

          // Check if already sent this reminder today
          const todayStr = new Date().toISOString().split('T')[0];
          const { data: existingNotif } = await supabaseAdmin
            .from('notifications')
            .select('id')
            .eq('recipient', occupancy.tenant_id)
            .eq('type', 'contract_expiry_reminder')
            .gte('created_at', todayStr)
            .maybeSingle();

          if (existingNotif) {
            console.log(`[Contract Expiry] Already reminded ${tenantName} today, skipping`);
            continue;
          }

          // Create in-app notification
          await supabaseAdmin.from('notifications').insert({
            recipient: occupancy.tenant_id,
            actor: occupancy.landlord_id,
            type: 'contract_expiry_reminder',
            message: `Your rental contract for "${propertyTitle}" will expire on ${endDate} (29 days from now). Please contact your landlord if you wish to extend or renew your contract.`,
            link: '/dashboard'
          });

          // Send SMS
          const phone = formatPhoneNumber(occupancy.tenant?.phone);
          if (phone) {
            try {
              const smsMsg = `Hi ${tenantName}! Your rental contract for "${propertyTitle}" expires on ${endDate} (29 days). Contact your landlord to renew or extend. - EaseRent`;
              await sendSMS(phone, smsMsg);
              console.log(`[Contract Expiry] SMS sent to ${phone}`);
            } catch (smsErr) {
              console.error('[Contract Expiry] SMS error:', smsErr);
            }
          }

          // Send Email
          const email = occupancy.tenant?.email;
          if (email) {
            try {
              await sendNotificationEmail({
                to: email,
                subject: `⏰ Contract Expiry Reminder - ${propertyTitle}`,
                message: `
                  <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                    <div style="padding: 20px; background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px;">
                      <h2 style="color: #92400e; margin-top: 0;">📅 Contract Expiry Reminder</h2>
                      <p>Dear <strong>${tenantName}</strong>,</p>
                      <p>This is a friendly reminder that your rental contract for <strong>"${propertyTitle}"</strong> will expire on <strong>${endDate}</strong> (29 days from now).</p>
                      <p>If you wish to extend your stay or renew your contract, please contact your landlord as soon as possible to discuss the terms.</p>
                      <p>Thank you for being a valued tenant!</p>
                      <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/dashboard" 
                         style="display: inline-block; background-color: #92400e; color: white; padding: 10px 20px; margin-top: 15px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                         Go to Dashboard
                      </a>
                    </div>
                  </div>
                `
              });
              console.log(`[Contract Expiry] Email sent to ${email}`);
            } catch (emailErr) {
              console.error('[Contract Expiry] Email error:', emailErr);
            }
          }

          results.contract_expiry_reminders_sent++;
          console.log(`[Contract Expiry] ✅ Reminder sent to ${tenantName}`);
        }
      } else {
        console.log(`[Contract Expiry] No contracts expiring in 29 days`);
      }
    } catch (expiryErr) {
      console.error('[Contract Expiry] Error:', expiryErr);
    }

    console.log(`[Contract Expiry] ========================================`);

    // ====================================================
    // G. APPLY LATE FEES (Day after due date)
    // Run daily to check for overdue bills and apply penalty
    // ====================================================
    console.log(`[Late Fee Check] ========================================`);

    // Only run this check if we are running bill reminders (7-9 AM) to avoid double application
    // checking `shouldSendBillReminders` which is true only once per day
    if (shouldSendBillReminders) {
      try {
        const todayISO = new Date().toISOString();

        // Fetch all PENDING bills that are PAST DUE
        // And have an occupancy linked
        const { data: overdueBills, error: overdueError } = await supabaseAdmin
          .from('payment_requests')
          .select(`
            *,
            occupancy:tenant_occupancies(id, late_payment_fee, tenant_id),
            property:properties(title)
          `)
          .eq('status', 'pending')
          .lt('due_date', todayISO) // Due date is in the past
          .gt('rent_amount', 0); // Only apply to RENT bills (usually have rent_amount > 0)

        if (overdueError) {
          console.error('[Late Fee Check] Error fetching overdue bills:', overdueError);
        } else if (overdueBills && overdueBills.length > 0) {
          console.log(`[Late Fee Check] Found ${overdueBills.length} overdue bills.`);

          for (const bill of overdueBills) {
            // Check if occupancy has a late fee set
            const lateFee = parseFloat(bill.occupancy?.late_payment_fee || 0);

            if (lateFee > 0) {
              const description = bill.bills_description || '';

              // Check if late fee already applied (prevent duplicate)
              if (!description.includes('Late Fee')) {
                console.log(`[Late Fee Check] Applying ₱${lateFee} penalty to Bill #${bill.id} (Tenant: ${bill.tenant})`);

                // Calculate new totals
                const newOtherBills = (parseFloat(bill.other_bills) || 0) + lateFee;
                const newDescription = `${description} (Includes Late Fee: ₱${lateFee.toLocaleString()})`;

                // Update the bill
                const { error: updateError } = await supabaseAdmin
                  .from('payment_requests')
                  .update({
                    other_bills: newOtherBills,
                    bills_description: newDescription
                  })
                  .eq('id', bill.id);

                if (updateError) {
                  console.error(`[Late Fee Check] Failed to update bill ${bill.id}:`, updateError);
                } else {
                  results.late_fees_applied = (results.late_fees_applied || 0) + 1;

                  // Notify Tenant
                  const message = `A late payment fee of ₱${lateFee.toLocaleString()} has been added to your rent bill for "${bill.property?.title}". Total due: ₱${(
                    (parseFloat(bill.rent_amount) || 0) +
                    (parseFloat(bill.water_bill) || 0) +
                    (parseFloat(bill.electrical_bill) || 0) +
                    (parseFloat(bill.wifi_bill) || 0) +
                    newOtherBills
                  ).toLocaleString()}. Please pay immediately.`;

                  await supabaseAdmin.from('notifications').insert({
                    recipient: bill.tenant,
                    actor: bill.landlord, // Landlord or System
                    type: 'payment_late_fee', // You might need to handle this type in frontend or just use generic
                    message: message,
                    link: '/payments'
                  });

                  // Try to send SMS if we have tenant phone (would need extra fetch or join)
                  // For now, in-app notification is critical.
                  console.log(`[Late Fee Check] Applied late fee to bill ${bill.id}`);
                }
              } else {
                console.log(`[Late Fee Check] Bill ${bill.id} already has late fee applied.`);
              }
            }
          }
        } else {
          console.log(`[Late Fee Check] No overdue pending bills found.`);
        }
      } catch (err) {
        console.error('[Late Fee Check] Exception:', err);
      }
    } else {
      console.log(`[Late Fee Check] Skipped (not reminder time).`);
    }
    console.log(`[Late Fee Check] ========================================`);

    res.status(200).json({ success: true, report: results })

  } catch (error) {
    console.error('Manual Reminder Error:', error)
    res.status(500).json({ error: error.message })
  }
}

// Check if a specific notification type was sent to a user in the current month
async function checkNotificationSentThisMonth(supabase, userId, type) {
  const date = new Date();
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();

  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('recipient', userId)
    .eq('type', type)
    .gte('created_at', firstDay)
    .limit(1);

  return data && data.length > 0;
}

// Send Utility Reminder (Email + SMS + In-App)
async function sendUtilityReminder(supabase, tenant, type, message, subject) {
  const phone = formatPhoneNumber(tenant.phone);
  const userId = tenant.profile_id || tenant.tenant_id || tenant.id; // Handle different join structures

  // Fetch email from auth.users since profiles doesn't have email
  let email = null;
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    email = userData?.user?.email;
  } catch (e) {
    console.error("Failed to fetch user email:", e);
  }

  console.log(`[Utility Reminder] Sending ${type} to user ${userId}, email: ${email}, phone: ${phone}`);

  // 1. In-App Notification
  try {
    await supabase.from('notifications').insert({
      recipient: userId,
      actor: userId, // System notification
      type: type,
      message: message,
      link: '/payments',
      is_read: false
    });
    console.log(`[Utility Reminder] In-app notification created for ${userId}`);
  } catch (e) {
    console.error("In-app notification error:", e);
  }

  // 2. Email
  if (email) {
    try {
      await sendNotificationEmail({
        to: email,
        subject: subject,
        message: `
                    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                        <div style="padding: 20px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                            <h2 style="color: #166534; margin-top: 0;">${subject}</h2>
                            <p>${message}</p>
                            <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/payments" 
                               style="display: inline-block; background-color: #166534; color: white; padding: 10px 20px; margin-top: 15px; text-decoration: none; rounded: 5px; font-weight: bold;">
                               View Payments
                            </a>
                        </div>
                    </div>
                `
      });
      console.log(`[Utility Reminder] Email sent to ${email}`);
    } catch (e) { console.error("Email error:", e); }
  } else {
    console.log(`[Utility Reminder] No email found for user ${userId}`);
  }

  // 3. SMS
  if (phone) {
    try {
      await sendSMS(phone, `[EaseRent] ${message}`);
      console.log(`[Utility Reminder] SMS sent to ${phone}`);
    } catch (e) { console.error("SMS error:", e); }
  } else {
    console.log(`[Utility Reminder] No phone found for user ${userId}`);
  }
}
