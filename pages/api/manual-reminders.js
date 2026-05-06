import { createClient } from '@supabase/supabase-js';
import { sendContractNearingEndEmail, sendNotificationEmail, sendNewPaymentBillEmail } from '../../lib/email';
import { sendBookingReminder, sendContractNearingEnd, sendSMS, sendUnreadMessageNotification, sendBillNotification } from '../../lib/sms';

// Initialize Admin Client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const REMINDER_TIME_ZONE = 'Asia/Manila'
const HAS_EXPLICIT_TZ_REGEX = /(?:[zZ]|[+\-]\d{2}:?\d{2})$/
const LOCAL_DATETIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
const TENANT_PREFERRED_PREFIXES = [
  'TENANTS PREFEREED SCHEDULE:',
  'TENANTS PREFERRED SCHEDULE:'
]

// Helper: Format Phone Number
function formatPhoneNumber(phone) {
  if (!phone) return null;
  let clean = phone.replace(/\D/g, '');
  if (clean.length < 10) return null;
  if (clean.startsWith('09')) return '+63' + clean.substring(1);
  if (clean.startsWith('63')) return '+' + clean;
  return '+' + clean;
}

function toValidDate(value) {
  if (!value) return null

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
      const parsedLocal = new Date(utcMillis)
      return Number.isNaN(parsedLocal.getTime()) ? null : parsedLocal
    }
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getTimeZoneDateParts(date, timeZone = REMINDER_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)

  const lookup = {}
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value
  }

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day)
  }
}

function getDayOffsetFromToday(date, timeZone = REMINDER_TIME_ZONE) {
  const todayParts = getTimeZoneDateParts(new Date(), timeZone)
  const targetParts = getTimeZoneDateParts(date, timeZone)

  const todaySerial = Math.floor(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day) / 86400000)
  const targetSerial = Math.floor(Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day) / 86400000)

  return targetSerial - todaySerial
}

function extractTenantPreferredScheduleText(notesValue) {
  if (!notesValue) return ''

  const lines = String(notesValue).split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    const upper = trimmed.toUpperCase()

    for (const prefix of TENANT_PREFERRED_PREFIXES) {
      if (upper.startsWith(prefix)) {
        return trimmed.slice(prefix.length).trim()
      }
    }
  }

  return ''
}

function parsePreferredScheduleText(preferredScheduleText) {
  if (!preferredScheduleText) return null

  const trimmedText = String(preferredScheduleText).trim()
  const rangeSeparatorIndex = trimmedText.lastIndexOf(' - ')
  if (rangeSeparatorIndex < 0) return null

  const startText = trimmedText.slice(0, rangeSeparatorIndex).trim()
  const endTimeText = trimmedText.slice(rangeSeparatorIndex + 3).trim()
  const startDate = toValidDate(startText)

  if (!startDate) return null

  const startDateParts = getTimeZoneDateParts(startDate)
  const isoDate = `${startDateParts.year.toString().padStart(4, '0')}-${String(startDateParts.month).padStart(2, '0')}-${String(startDateParts.day).padStart(2, '0')}`

  let endDate = null
  const twelveHourMatch = endTimeText.match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i)
  if (twelveHourMatch) {
    let hour = Number(twelveHourMatch[1]) % 12
    if (String(twelveHourMatch[3]).toUpperCase() === 'PM') hour += 12
    const minute = Number(twelveHourMatch[2] || '0')
    const hh = String(hour).padStart(2, '0')
    const mm = String(minute).padStart(2, '0')
    endDate = toValidDate(`${isoDate}T${hh}:${mm}:00`)
  } else {
    endDate = toValidDate(`${isoDate} ${endTimeText}`)
  }

  return {
    startDate,
    endDate: endDate || null
  }
}

function getBookingScheduleDisplay(booking) {
  const preferredScheduleText = extractTenantPreferredScheduleText(booking?.notes)
  const parsedPreferredSchedule = parsePreferredScheduleText(preferredScheduleText)

  const startDate = parsedPreferredSchedule?.startDate
    || toValidDate(booking?.start_time)
    || toValidDate(booking?.booking_date)
  const endDate = parsedPreferredSchedule?.endDate || toValidDate(booking?.end_time)

  if (!startDate) return null

  const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: REMINDER_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: REMINDER_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: REMINDER_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit'
  })

  const startTimeText = timeFormatter.format(startDate)
  const endTimeText = endDate ? timeFormatter.format(endDate) : ''
  const dayOffset = getDayOffsetFromToday(startDate)

  let relativeDayText = `in ${dayOffset} day(s)`
  if (dayOffset === 0) relativeDayText = 'today'
  if (dayOffset === 1) relativeDayText = 'tomorrow'

  return {
    fullDateText: fullDateFormatter.format(startDate),
    shortDateText: shortDateFormatter.format(startDate),
    timeRangeText: endTimeText ? `${startTimeText} - ${endTimeText}` : startTimeText,
    subjectDateText: shortDateFormatter.format(startDate),
    relativeDayText,
  }
}

// Increase timeout for Vercel serverless (cron jobs can take longer)
export const config = {
  maxDuration: 60, // 60 seconds max (Vercel Pro) or 10 seconds (Hobby)
};

export default async function handler(req, res) {
  // === CRON AUTH: Allow both client-side calls and Supabase pg_cron calls ===
  const cronSecret = req.headers['x-cron-secret'] || req.query.cron_secret;
  const isCronCall = cronSecret === process.env.CRON_SECRET;
  const isClientCall = req.headers.referer || req.headers.origin; // Client-side fetch has referer

  // If neither a valid cron call nor a client-side call, reject
  if (!isCronCall && !isClientCall) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { bookings_processed: 0, messages_processed: 0, rent_reminders_sent: 0, wifi_reminders_sent: 0, electricity_reminders_sent: 0, water_reminders_sent: 0, errors: 0, skipped: null }

  try {
    // ====================================================
    // CHECK IF REMINDERS ARE ENABLED (Admin Toggle)
    // ====================================================
    const { data: reminderSetting } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'reminders_enabled')
      .single()

    // If setting exists and is explicitly false, skip all reminders
    if (reminderSetting && reminderSetting.value === false) {
      return res.status(200).json({
        success: true,
        report: results,
        skipped: 'Reminders are disabled by admin'
      })
    }

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

    // Skip bill reminders if not in time window OR already ran today (Unless 'force' param is present)
    const forceRun = req.query.force === 'true';
    const shouldSendBillReminders = forceRun || (isReminderTime && !alreadyRanToday);
    const catchUpMissedBillReminders = req.query.catch_up !== 'false';
    const parsedCatchUpPastDueDays = parseInt(req.query.catch_up_past_due_days || '7', 10);
    const catchUpPastDueDays = Number.isFinite(parsedCatchUpPastDueDays)
      ? Math.max(0, Math.min(31, parsedCatchUpPastDueDays))
      : 7;

    if (!shouldSendBillReminders) {
      console.log(`[Reminder Check] Skipping bill reminders - Time: ${currentHour}:00, Already ran: ${alreadyRanToday}, Force: ${forceRun}, Catch-up: ${catchUpMissedBillReminders}`);
      results.skipped = `Bill reminders skipped. Current hour: ${currentHour}, Already ran today: ${alreadyRanToday}`;
    } else {
      console.log(`[Reminder Check] Running bill reminders (Force: ${forceRun}, Catch-up: ${catchUpMissedBillReminders}, Catch-up past due days: ${catchUpPastDueDays})`);
      if (!forceRun) {
        // Mark that we ran today (create a system notification)
        await supabaseAdmin.from('notifications').insert({
          recipient: '00000000-0000-0000-0000-000000000000', // System placeholder
          actor: '00000000-0000-0000-0000-000000000000',
          type: 'daily_reminder_check',
          message: `Daily reminder check ran at ${phTime.toLocaleString()}`,
          is_read: true
        });
      }
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
        const propertyTitle = booking.property?.title || 'Property'
        const scheduleDisplay = getBookingScheduleDisplay(booking)

        if (!scheduleDisplay) {
          console.warn(`Skipping booking reminder ${booking.id}: Missing valid start/end schedule`)
          continue
        }

        let sentAny = false

        // 1. Send EMAIL (Free)
        if (email) {
          try {
            const subject = `📅 Reminder: Viewing on ${scheduleDisplay.subjectDateText} for ${propertyTitle}`
            const htmlContent = `
              <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                <h2>Upcoming Viewing Reminder</h2>
                <p>Hi <strong>${name}</strong>,</p>
                <p>This is a friendly reminder about your viewing schedule (${scheduleDisplay.relativeDayText}):</p>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>🏠 Property:</strong> ${propertyTitle}</p>
                  <p style="margin: 5px 0;"><strong>📅 Date:</strong> ${scheduleDisplay.fullDateText}</p>
                  <p style="margin: 5px 0;"><strong>⏰ Time (PH):</strong> ${scheduleDisplay.timeRangeText}</p>
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
              propertyName: propertyTitle,
              date: scheduleDisplay.shortDateText,
              time: scheduleDisplay.timeRangeText,
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
        water_due_day,
        electricity_due_day,
        rent_due_day,
        landlord_profile:profiles!tenant_occupancies_landlord_id_fkey(accepted_payments),
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone),
        property:properties(id, title, price, amenities)
      `)
        .eq('status', 'active');

      if (occError) {
        console.error('[Rent Reminder] Error fetching occupancies:', occError);
      }

      console.log(`[Rent Reminder] Total active occupancies: ${allOccupancies?.length || 0}`);

      const isUtilityEnabled = (occ, utilityKey) => {
        const utilitySettings = occ?.landlord_profile?.accepted_payments?.utility_reminders || {};
        return utilitySettings[utilityKey] !== false;
      };

      const isWifiAvailableAtProperty = (occ) => {
        const amenities = Array.isArray(occ?.property?.amenities) ? occ.property.amenities : [];
        return amenities.includes('Wifi') || amenities.includes('WiFi') || amenities.includes('Free WiFi');
      };

      const todayDateOnly = new Date(todayYear, todayMonth, todayDay, 0, 0, 0, 0);
      const millisecondsPerDay = 1000 * 60 * 60 * 24;

      const normalizeDueDay = (value, fallback) => {
        const parsed = parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(1, Math.min(31, parsed));
      };

      const getDaysUntilDue = (dueDate) => Math.floor((dueDate.getTime() - todayDateOnly.getTime()) / millisecondsPerDay);

      const getReminderDueDateForDay = (dueDay) => {
        const currentMonthDueDate = new Date(todayYear, todayMonth, dueDay, 0, 0, 0, 0);

        if (catchUpMissedBillReminders) {
          const autoSendDate = new Date(currentMonthDueDate);
          autoSendDate.setDate(autoSendDate.getDate() - 3);
          const currentMonthDaysUntilDue = getDaysUntilDue(currentMonthDueDate);

          if (
            autoSendDate <= todayDateOnly &&
            currentMonthDaysUntilDue >= -catchUpPastDueDays &&
            currentMonthDaysUntilDue <= 3
          ) {
            return currentMonthDueDate;
          }
        }

        const candidate = new Date(currentMonthDueDate);
        if (candidate < todayDateOnly) {
          candidate.setMonth(candidate.getMonth() + 1);
        }
        return candidate;
      };

      const shouldSendReminderForDueDate = (dueDate) => {
        const daysUntilDue = getDaysUntilDue(dueDate);
        if (daysUntilDue >= 1 && daysUntilDue <= 3) return true;
        if (!catchUpMissedBillReminders) return false;

        const autoSendDate = new Date(dueDate);
        autoSendDate.setDate(autoSendDate.getDate() - 3);
        return autoSendDate <= todayDateOnly && daysUntilDue >= -catchUpPastDueDays && daysUntilDue <= 3;
      };

      const getReminderTimingText = (daysUntilDue) => {
        if (daysUntilDue > 1) return `${daysUntilDue} days before due`;
        if (daysUntilDue === 1) return '1 day before due';
        if (daysUntilDue === 0) return 'due today';
        const overdueDays = Math.abs(daysUntilDue);
        return overdueDays === 1 ? '1 day past due' : `${overdueDays} days past due`;
      };

      const formatOrdinalDueDate = (dueDay, dueDate) =>
        `${dueDay}${[11, 12, 13].includes(dueDay) ? 'th' : ['st', 'nd', 'rd'][dueDay % 10 - 1] || 'th'} of ${dueDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

      const hasOccupancyStarted = (occ) => {
        if (!occ.start_date) return true;
        const startDate = new Date(occ.start_date);
        startDate.setHours(0, 0, 0, 0);
        return todayDateOnly >= startDate;
      };

      // Filter occupancies where today is 1, 2, or 3 days before the due date
      // AND the occupancy has already started
      const rentOccupancies = (allOccupancies || []).filter(occ => {
        if (!occ.start_date && !occ.rent_due_day) return false;

        if (!hasOccupancyStarted(occ)) return false;
        
        // Use rent_due_day if landlord set it, otherwise fall back to start_date's day
        let dueDay;
        if (occ.rent_due_day && occ.rent_due_day >= 1 && occ.rent_due_day <= 31) {
          dueDay = occ.rent_due_day;
        } else if (occ.start_date) {
          const startDate = new Date(occ.start_date);
          dueDay = startDate.getDate();
        } else {
          return false;
        }

        // Calculate the next upcoming due date, matching the Billing Schedule UI.
        const currentMonthDueDate = getReminderDueDateForDay(dueDay);
        const daysUntilDue = getDaysUntilDue(currentMonthDueDate);

        // Check if today is 1, 2, or 3 days before due date
        return shouldSendReminderForDueDate(currentMonthDueDate);
      });

      console.log(`[Rent Reminder] Matching occupancies (1-3 days before due): ${rentOccupancies.length}`);

      if (rentOccupancies && rentOccupancies.length > 0) {
        for (const occ of rentOccupancies) {
          if (!occ.tenant) continue;

          // Use rent_due_day if set, otherwise fall back to start_date's day
          let dueDay;
          if (occ.rent_due_day && occ.rent_due_day >= 1 && occ.rent_due_day <= 31) {
            dueDay = occ.rent_due_day;
          } else {
            const startDate = new Date(occ.start_date);
            dueDay = startDate.getDate();
          }
          const currentMonthDueDate = getReminderDueDateForDay(dueDay);
          const daysUntilDue = getDaysUntilDue(currentMonthDueDate);

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
            let billCreated = false;

            // Fetch Email for notifications
            let tenantEmail = occ.tenant?.email;
            if (!tenantEmail) {
              const { data: u } = await supabaseAdmin.auth.admin.getUserById(occ.tenant_id);
              tenantEmail = u?.user?.email;
            }

            // --- CREATE PAYMENT REQUEST (Rent Bill) - Only on day 3 (first day) ---
            if (daysUntilDue === 3 || catchUpMissedBillReminders) {
              // Check if bill already exists for this month
              const { data: existingBill } = await supabaseAdmin
                .from('payment_requests')
                .select('id, rent_amount')
                .eq('tenant', occ.tenant_id)
                .eq('property_id', occ.property?.id)
                .gte('due_date', new Date(currentMonthDueDate.getFullYear(), currentMonthDueDate.getMonth(), 1).toISOString())
                .lte('due_date', new Date(currentMonthDueDate.getFullYear(), currentMonthDueDate.getMonth() + 1, 0, 23, 59, 59, 999).toISOString())
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
                    billCreated = true;
                  }
                } catch (err) {
                  console.error(`[Rent Reminder] Payment request exception:`, err);
                }
              } else {
                const currentBill = existingBill[0];
                const existingAmount = parseFloat(currentBill.rent_amount || 0);

                if (existingAmount !== parseFloat(rentAmount || 0)) {
                  try {
                    const { error: syncError } = await supabaseAdmin
                      .from('payment_requests')
                      .update({
                        rent_amount: rentAmount,
                        bills_description: `Monthly Rent for ${monthName}`
                      })
                      .eq('id', currentBill.id)
                      .eq('status', 'pending');

                    if (syncError) {
                      console.error(`[Rent Reminder] Failed to sync existing pending bill amount:`, syncError);
                    } else {
                      console.log(`[Rent Reminder] ✅ Synced pending bill amount to latest property price (bill: ${currentBill.id})`);
                    }
                  } catch (syncErr) {
                    console.error(`[Rent Reminder] Pending bill sync exception:`, syncErr);
                  }
                } else {
                  console.log(`[Rent Reminder] ⏭️ Payment request already exists for this month (amount up to date)`);
                }
              }
            }

            const daysText = getReminderTimingText(daysUntilDue);
            const rentMessage = `Rent Bill Reminder (${daysText}): Your monthly rent of ₱${Number(rentAmount).toLocaleString()} for "${occ.property?.title || 'your property'}" is due on ${dueDateStr}.${occ.late_payment_fee > 0 ? ` Late payment fee: ₱${Number(occ.late_payment_fee).toLocaleString()}` : ''} Please check your Payments page.`;

            // IF BILL WAS JUST CREATED (Day 3), send SPECIFIC Bill Notification
            if (billCreated) {
              console.log(`[Rent Reminder] Sending NEW BILL notification to ${occ.tenant?.first_name}`);

              // 1. Send Email
              if (tenantEmail) {
                await sendNewPaymentBillEmail({
                  to: tenantEmail,
                  tenantName: occ.tenant?.first_name || 'Tenant',
                  propertyTitle: occ.property?.title,
                  billType: 'rent',
                  amount: rentAmount,
                  dueDate: dueDate,
                  description: `Monthly Rent for ${monthName}`
                });
              } else {
                console.log(`[Rent Reminder] ❌ No email found for tenant ${occ.tenant_id}`);
              }

              // 2. Send SMS
              const phone = formatPhoneNumber(occ.tenant?.phone);
              if (phone) {
                await sendBillNotification(phone, {
                  propertyName: occ.property?.title,
                  amount: rentAmount.toLocaleString(),
                  dueDate: dueDateStr
                });
              }

              // 3. Mark in DB (using sendUtilityReminder just to record the notification log)
              occ.tenant.profile_id = occ.tenant.id;
              await sendUtilityReminder(supabaseAdmin, occ.tenant, 'rent_bill_reminder',
                rentMessage,
                `🏠 Rent Bill Reminder (New Bill Created)`
              );
            } else {
              // STANDARD REMINDER (Day 1 & 2)
              console.log(`[Rent Reminder] Sending notification (${daysText}): ${rentMessage}`);

              occ.tenant.profile_id = occ.tenant.id;
              await sendUtilityReminder(supabaseAdmin, occ.tenant, 'rent_bill_reminder',
                rentMessage,
                `🏠 Rent Bill Reminder (${daysText})`
              );
            }

            results.rent_reminders_sent++;
            console.log(`[Rent Reminder] ✅ Notification processed for ${occ.tenant?.first_name}`);
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
      // AND the occupancy has already started
      const wifiOccupancies = (allOccupancies || []).filter(occ => {
        if (!isUtilityEnabled(occ, 'internet')) return false;
        if (!isWifiAvailableAtProperty(occ)) return false;
        if (!occ.wifi_due_day) return false;

        if (!hasOccupancyStarted(occ)) return false;

        const wifiDueDay = normalizeDueDay(occ.wifi_due_day, 10);
        const currentMonthDueDate = getReminderDueDateForDay(wifiDueDay);
        const daysUntilDue = getDaysUntilDue(currentMonthDueDate);

        // Check if today is 1, 2, or 3 days before due date
        return shouldSendReminderForDueDate(currentMonthDueDate);
      });

      console.log(`[Wifi Reminder] Matching occupancies (1-3 days before due): ${wifiOccupancies.length}`);

      if (wifiOccupancies.length > 0) {
        for (const occ of wifiOccupancies) {
          if (!occ.tenant) continue;

          const wifiDueDay = normalizeDueDay(occ.wifi_due_day, 10);
          const currentMonthDueDate = getReminderDueDateForDay(wifiDueDay);
          const daysUntilDue = getDaysUntilDue(currentMonthDueDate);

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
            const dueDateStr = formatOrdinalDueDate(wifiDueDay, dueDate);
            const daysText = getReminderTimingText(daysUntilDue);

            const wifiMessage = `WiFi Bill Reminder (${daysText}): Your WiFi bill for "${occ.property?.title || 'your property'}" is due on ${dueDateStr}. Please ensure timely payment to avoid service interruption.`;

            console.log(`[Wifi Reminder] Sending reminder (${daysText}): ${wifiMessage}`);

            occ.tenant.profile_id = occ.tenant.id;
            await sendUtilityReminder(supabaseAdmin, occ.tenant, 'wifi_due_reminder',
              wifiMessage,
              `WiFi Bill Due Reminder (${daysText})`
            );

            // Also notify the LANDLORD about upcoming WiFi due date
            await sendLandlordUtilityReminder(supabaseAdmin, occ.landlord_id, occ.tenant, 'wifi', occ.property?.title, dueDateStr, daysText);

            results.wifi_reminders_sent = (results.wifi_reminders_sent || 0) + 1;
            console.log(`[Wifi Reminder] Reminder sent to ${occ.tenant?.first_name} and landlord`);
          } else {
            console.log(`[Wifi Reminder] ⏭️ Skipped ${occ.tenant?.first_name} - already sent today`);
          }
        }
      } else {
        console.log(`[Wifi Reminder] No tenants with WiFi due dates 1-3 days away`);
      }

      console.log(`[Wifi Reminder] ========================================`);

      // ====================================================
      // E. ELECTRICITY DUE DATE NOTIFICATIONS (3 Days Before - Daily Reminders)
      // Sends notifications every day during the 3 days before the configured due date.
      // ====================================================
      console.log(`[Electric Reminder] ========================================`);

      const electricityOccupancies = (allOccupancies || []).filter(occ => {
        if (!occ.tenant) return false;
        if (!isUtilityEnabled(occ, 'electricity')) return false;
        if (!occ.electricity_due_day) return false;
        if (!hasOccupancyStarted(occ)) return false;

        const electricityDueDay = normalizeDueDay(occ.electricity_due_day, 7);
        const currentMonthDueDate = getReminderDueDateForDay(electricityDueDay);
        const daysUntilDue = getDaysUntilDue(currentMonthDueDate);

        return shouldSendReminderForDueDate(currentMonthDueDate);
      });

      console.log(`[Electric Reminder] Matching occupancies (1-3 days before due): ${electricityOccupancies.length}`);

      if (electricityOccupancies.length > 0) {
        for (const occ of electricityOccupancies) {
          if (!occ.tenant) continue;

          const electricityDueDay = normalizeDueDay(occ.electricity_due_day, 7);
          const currentMonthDueDate = getReminderDueDateForDay(electricityDueDay);
          const daysUntilDue = getDaysUntilDue(currentMonthDueDate);

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

          console.log(`[Electric Reminder] Processing ${occ.tenant?.first_name}: daysUntilDue=${daysUntilDue}, alreadySentToday=${alreadySentToday}`);

          if (!alreadySentToday) {
            const dueDate = new Date(currentMonthDueDate);
            const dueDateStr = formatOrdinalDueDate(electricityDueDay, dueDate);
            const daysText = getReminderTimingText(daysUntilDue);

            const electricMessage = `Electricity Bill Reminder (${daysText}): Your electricity bill for "${occ.property?.title || 'your property'}" is due on ${dueDateStr}. Please ensure timely payment to avoid service interruption.`;

            console.log(`[Electric Reminder] Sending reminder (${daysText}): ${electricMessage}`);

            occ.tenant.profile_id = occ.tenant.id;
            await sendUtilityReminder(supabaseAdmin, occ.tenant, 'electricity_due_reminder',
              electricMessage,
              `Electricity Bill Due Reminder (${daysText})`
            );

            await sendLandlordUtilityReminder(supabaseAdmin, occ.landlord_id, occ.tenant, 'electricity', occ.property?.title, dueDateStr, daysText);

            results.electricity_reminders_sent = (results.electricity_reminders_sent || 0) + 1;
            console.log(`[Electric Reminder] Reminder sent to ${occ.tenant?.first_name} and landlord`);
          } else {
            console.log(`[Electric Reminder] Skipped ${occ.tenant?.first_name} - already sent today`);
          }
        }
      } else {
        console.log(`[Electric Reminder] No tenants with electricity due dates 1-3 days away`);
      }

      console.log(`[Electric Reminder] ========================================`);

      // ====================================================
      // F. WATER BILL DUE DATE NOTIFICATIONS (3 Days Before - Daily Reminders)
      // Sends notifications every day during the 3 days before the configured due date.
      // ====================================================
      console.log(`[Water Reminder] ========================================`);

      const waterOccupancies = (allOccupancies || []).filter(occ => {
        if (!occ.tenant) return false;
        if (!isUtilityEnabled(occ, 'water')) return false;
        if (!occ.water_due_day) return false;
        if (!hasOccupancyStarted(occ)) return false;

        const waterDueDay = normalizeDueDay(occ.water_due_day, 7);
        const currentMonthDueDate = getReminderDueDateForDay(waterDueDay);
        const daysUntilDue = getDaysUntilDue(currentMonthDueDate);

        return shouldSendReminderForDueDate(currentMonthDueDate);
      });

      console.log(`[Water Reminder] Matching occupancies (1-3 days before due): ${waterOccupancies.length}`);

      if (waterOccupancies.length > 0) {
        for (const occ of waterOccupancies) {
          if (!occ.tenant) continue;

          const waterDueDay = normalizeDueDay(occ.water_due_day, 7);
          const currentMonthDueDate = getReminderDueDateForDay(waterDueDay);
          const daysUntilDue = getDaysUntilDue(currentMonthDueDate);

          const todayStartW = new Date(todayYear, todayMonth, todayDay, 0, 0, 0, 0);
          const todayEndW = new Date(todayYear, todayMonth, todayDay, 23, 59, 59, 999);

          const { data: todayNotificationW } = await supabaseAdmin
            .from('notifications')
            .select('id')
            .eq('recipient', occ.tenant_id)
            .eq('type', 'water_due_reminder')
            .gte('created_at', todayStartW.toISOString())
            .lte('created_at', todayEndW.toISOString())
            .limit(1);

          const alreadySentTodayW = todayNotificationW && todayNotificationW.length > 0;

          console.log(`[Water Reminder] Processing ${occ.tenant?.first_name}: daysUntilDue=${daysUntilDue}, alreadySentToday=${alreadySentTodayW}`);

          if (!alreadySentTodayW) {
            const dueDate = new Date(currentMonthDueDate);
            const dueDateStr = formatOrdinalDueDate(waterDueDay, dueDate);
            const daysText = getReminderTimingText(daysUntilDue);

            const waterMessage = `Water Bill Reminder (${daysText}): Your water bill for "${occ.property?.title || 'your property'}" is due on ${dueDateStr}. Please ensure timely payment to avoid service interruption.`;

            console.log(`[Water Reminder] Sending reminder (${daysText}): ${waterMessage}`);

            occ.tenant.profile_id = occ.tenant.id;
            await sendUtilityReminder(supabaseAdmin, occ.tenant, 'water_due_reminder',
              waterMessage,
              `Water Bill Due Reminder (${daysText})`
            );

            await sendLandlordUtilityReminder(supabaseAdmin, occ.landlord_id, occ.tenant, 'water', occ.property?.title, dueDateStr, daysText);

            results.water_reminders_sent = (results.water_reminders_sent || 0) + 1;
            console.log(`[Water Reminder] Reminder sent to ${occ.tenant?.first_name} and landlord`);
          } else {
            console.log(`[Water Reminder] Skipped ${occ.tenant?.first_name} - already sent today`);
          }
        }
      } else {
        console.log(`[Water Reminder] No tenants with water due dates 1-3 days away`);
      }

      console.log(`[Water Reminder] ========================================`);
    } // End of shouldSendBillReminders check

    // ====================================================
    // G. Contract-reminder section disabled
    // Contract/renewal columns were removed from tenant_occupancies.
    // ====================================================
    console.log(`[Contract Nearing End] Skipped (contract fields removed).`);

    // ====================================================
    // H. APPLY LATE FEES (Day after due date)
    // Run daily to check for overdue bills and apply penalty
    // ====================================================
    console.log(`[Late Fee Check] ========================================`);

    // Only run this check if we are running bill reminders (7-9 AM) to avoid double application
    // checking `shouldSendBillReminders` which is true only once per day
    if (shouldSendBillReminders) {
      try {
        const todayISO = new Date().toISOString();

        // Fetch all PENDING bills that are PAST DUE
        // And have an occupancy linked — include security deposit fields
        const { data: overdueBills, error: overdueError } = await supabaseAdmin
          .from('payment_requests')
          .select(`
            *,
            occupancy:tenant_occupancies(id, late_payment_fee, tenant_id, landlord_id, security_deposit, security_deposit_used),
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

                  // === AUTO-DEDUCT PENALTY FROM SECURITY DEPOSIT ===
                  const securityDeposit = parseFloat(bill.occupancy?.security_deposit || 0);
                  const securityDepositUsed = parseFloat(bill.occupancy?.security_deposit_used || 0);
                  const availableDeposit = securityDeposit - securityDepositUsed;

                  let deductedFromDeposit = 0;

                  if (availableDeposit > 0) {
                    // Deduct penalty from security deposit (up to available amount)
                    deductedFromDeposit = Math.min(lateFee, availableDeposit);
                    const newDepositUsed = securityDepositUsed + deductedFromDeposit;

                    const { error: depositUpdateError } = await supabaseAdmin
                      .from('tenant_occupancies')
                      .update({ security_deposit_used: newDepositUsed })
                      .eq('id', bill.occupancy.id);

                    if (depositUpdateError) {
                      console.error(`[Late Fee Check] Failed to update security deposit for occupancy ${bill.occupancy.id}:`, depositUpdateError);
                      deductedFromDeposit = 0; // Reset if failed
                    } else {
                      console.log(`[Late Fee Check] ✅ Deducted ₱${deductedFromDeposit.toLocaleString()} from security deposit (Remaining: ₱${(availableDeposit - deductedFromDeposit).toLocaleString()})`);

                      // Notify Tenant about security deposit deduction
                      const depositMsg = `₱${deductedFromDeposit.toLocaleString()} has been auto-deducted from your security deposit as a late payment penalty for "${bill.property?.title}". Remaining deposit: ₱${(availableDeposit - deductedFromDeposit).toLocaleString()}.`;
                      await supabaseAdmin.from('notifications').insert({
                        recipient: bill.tenant,
                        actor: bill.landlord || bill.occupancy?.landlord_id,
                        type: 'security_deposit_deduction',
                        message: depositMsg,
                        link: '/payments'
                      });

                      // Also notify the Landlord
                      if (bill.occupancy?.landlord_id) {
                        await supabaseAdmin.from('notifications').insert({
                          recipient: bill.occupancy.landlord_id,
                          actor: bill.tenant,
                          type: 'security_deposit_deduction',
                          message: `₱${deductedFromDeposit.toLocaleString()} has been auto-deducted from tenant's security deposit as a late payment penalty for "${bill.property?.title}".`,
                          link: '/dashboard'
                        });
                      }

                      results.deposit_deductions = (results.deposit_deductions || 0) + 1;
                    }
                  } else {
                    console.log(`[Late Fee Check] No available security deposit for occupancy ${bill.occupancy?.id} — penalty added to bill only.`);

                    // Notify Tenant (no deposit available)
                    const noDepositTenantMsg = `₱${lateFee.toLocaleString()} has been auto-added as a late payment penalty for "${bill.property?.title}".`;
                    await supabaseAdmin.from('notifications').insert({
                      recipient: bill.tenant,
                      actor: bill.landlord || bill.occupancy?.landlord_id,
                      type: 'late_fee_no_deposit',
                      message: noDepositTenantMsg,
                      link: '/payments'
                    });

                    // Notify Landlord (no deposit available)
                    if (bill.occupancy?.landlord_id) {
                      await supabaseAdmin.from('notifications').insert({
                        recipient: bill.occupancy.landlord_id,
                        actor: bill.tenant,
                        type: 'late_fee_no_deposit',
                        message: `₱${lateFee.toLocaleString()} has been auto-added as a late payment penalty for "${bill.property?.title}".`,
                        link: '/dashboard'
                      });
                    }
                  }

                  // Notify Tenant about late fee
                  const totalDue = (
                    (parseFloat(bill.rent_amount) || 0) +
                    (parseFloat(bill.water_bill) || 0) +
                    (parseFloat(bill.electrical_bill) || 0) +
                    (parseFloat(bill.wifi_bill) || 0) +
                    newOtherBills
                  );
                  let message = `A late payment fee of ₱${lateFee.toLocaleString()} has been added to your rent bill for "${bill.property?.title}". Total due: ₱${totalDue.toLocaleString()}. Please pay immediately.`;
                  if (deductedFromDeposit > 0) {
                    message += ` ₱${deductedFromDeposit.toLocaleString()} was deducted from your security deposit.`;
                  }

                  await supabaseAdmin.from('notifications').insert({
                    recipient: bill.tenant,
                    actor: bill.landlord,
                    type: 'payment_late_fee',
                    message: message,
                    link: '/payments'
                  });

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

    // ====================================================
    // I. AUTO-START SCHEDULED MAINTENANCE
    // Moves 'scheduled' maintenance requests to 'in_progress' when the date has passed
    // ====================================================
    console.log(`[Maintenance Check] ========================================`);
    try {
      const nowISO = new Date().toISOString();

      const { data: readyMaintenance, error: maintError } = await supabaseAdmin
        .from('maintenance_requests')
        .select('id, title, tenant')
        .eq('status', 'scheduled')
        .lte('scheduled_date', nowISO)
        .limit(50);

      if (maintError) {
        console.error('[Maintenance Check] Error fetching scheduled requests:', maintError);
      } else if (readyMaintenance && readyMaintenance.length > 0) {
        console.log(`[Maintenance Check] Found ${readyMaintenance.length} tasks ready to start.`);

        const readyIds = readyMaintenance.map(r => r.id);

        const { error: updateErr } = await supabaseAdmin
          .from('maintenance_requests')
          .update({ status: 'in_progress' })
          .in('id', readyIds);

        if (!updateErr) {
          console.log(`[Maintenance Check] ✅ Set ${readyIds.length} tasks to in_progress.`);

          // Notify tenants
          for (const req of readyMaintenance) {
            if (req.tenant) {
              await supabaseAdmin.from('notifications').insert({
                recipient: req.tenant,
                actor: '00000000-0000-0000-0000-000000000000',
                type: 'maintenance_status',
                message: `The scheduled repair for "${req.title}" has now started!`,
                link: '/maintenance'
              });
            }
          }
        } else {
          console.error('[Maintenance Check] Update error:', updateErr);
        }
      } else {
        console.log(`[Maintenance Check] No scheduled tasks ready to start.`);
      }
    } catch (e) {
      console.error('[Maintenance Check] Exception:', e);
    }
    console.log(`[Maintenance Check] ========================================`);

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

// Notify landlord via email and SMS when utility due dates are near
async function sendLandlordUtilityReminder(supabase, landlordId, tenant, utilityType, propertyTitle, dueDateStr, daysText) {
  if (!landlordId) return;

  try {
    // Fetch landlord profile
    const { data: landlordProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name, phone')
      .eq('id', landlordId)
      .single();

    // Fetch landlord email
    let landlordEmail = null;
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(landlordId);
      landlordEmail = userData?.user?.email;
    } catch (e) {
      console.error('Failed to fetch landlord email:', e);
    }

    const tenantName = `${tenant?.first_name || ''} ${tenant?.last_name || ''}`.trim() || 'Tenant';
    const landlordName = landlordProfile ? `${landlordProfile.first_name || ''}`.trim() : 'Landlord';
    const utilityLabel = utilityType === 'wifi' ? 'Internet/WiFi' : utilityType === 'electricity' ? 'Electricity' : 'Water';

    const timingLabel = /due|past due/i.test(String(daysText || ''))
      ? String(daysText || '').trim()
      : `${daysText} before due`;
    const landlordMessage = `${utilityLabel} Payment Settlement Notice (${timingLabel}): Tenant ${tenantName}'s ${utilityLabel.toLowerCase()} bill for "${propertyTitle || 'property'}" is due on ${dueDateStr}. Please follow up to ensure timely payment settlement.`;
    const subject = `${utilityLabel} Due - Tenant Payment Settlement (${timingLabel})`;

    // 1. In-App Notification
    await supabase.from('notifications').insert({
      recipient: landlordId,
      actor: landlordId,
      type: `landlord_${utilityType}_due_reminder`,
      message: landlordMessage,
      link: '/payments',
      is_read: false
    });

    // 2. Email
    if (landlordEmail) {
      try {
        await sendNotificationEmail({
          to: landlordEmail,
          subject: subject,
          message: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
              <div style="padding: 20px; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
                <h2 style="color: #92400e; margin-top: 0;">${subject}</h2>
                <p>Hi ${landlordName},</p>
                <p>${landlordMessage}</p>
                <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/payments" 
                   style="display: inline-block; background-color: #92400e; color: white; padding: 10px 20px; margin-top: 15px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                   View Payments
                </a>
              </div>
            </div>
          `
        });
        console.log(`[Landlord Utility Reminder] Email sent to ${landlordEmail}`);
      } catch (e) {
        console.error(`[Landlord Utility Reminder] Email error:`, e);
      }
    }

    // 3. SMS
    const landlordPhone = formatPhoneNumber(landlordProfile?.phone);
    if (landlordPhone) {
      try {
        await sendSMS(landlordPhone, `[EaseRent] ${landlordMessage}`);
        console.log(`[Landlord Utility Reminder] SMS sent to ${landlordPhone}`);
      } catch (e) {
        console.error(`[Landlord Utility Reminder] SMS error:`, e);
      }
    }

    console.log(`[Landlord Utility Reminder] ${utilityLabel} reminder sent to landlord ${landlordId} for tenant ${tenantName}`);
  } catch (err) {
    console.error(`[Landlord Utility Reminder] Error:`, err);
  }
}
