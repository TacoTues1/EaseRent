import { createClient } from '@supabase/supabase-js'
import { sendNotificationEmail } from '../../lib/email'
import { sendUnreadMessageNotification, sendBookingReminder } from '../../lib/sms'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'
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

function getTimeZoneDateString(date = new Date(), timeZone = REMINDER_TIME_ZONE) {
    const parts = getTimeZoneDateParts(date, timeZone)
    return `${parts.year.toString().padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
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

// Auto-transition due scheduled maintenance requests to in_progress.
// This runs server-side (cron/API), so it works even when no user is logged in.
async function autoStartDueMaintenanceRequests() {
    const summary = { updated: 0, notified: 0 }

    const { data: dueRequests, error: dueError } = await supabaseAdmin
        .from('maintenance_requests')
        .select('id, title, tenant, properties(landlord)')
        .eq('status', 'scheduled')
        .not('scheduled_date', 'is', null)
        .lte('scheduled_date', nowISO)
        .limit(200)

    if (dueError) {
        throw new Error(`Failed to fetch due maintenance requests: ${dueError.message}`)
    }

    if (!dueRequests || dueRequests.length === 0) {
        return summary
    }

    const dueIds = dueRequests.map((row) => row.id)
    const { data: updatedRows, error: updateError } = await supabaseAdmin
        .from('maintenance_requests')
        .update({ status: 'in_progress' })
        .in('id', dueIds)
        .eq('status', 'scheduled')
        .select('id')

    if (updateError) {
        throw new Error(`Failed to update maintenance status: ${updateError.message}`)
    }

    const updatedIds = new Set((updatedRows || []).map((row) => row.id))
    summary.updated = updatedIds.size

    if (summary.updated === 0) {
        return summary
    }

    const notificationRows = dueRequests
        .filter((row) => updatedIds.has(row.id) && row.tenant)
        .map((row) => ({
            recipient: row.tenant,
            actor: row.properties?.landlord || SYSTEM_USER_ID,
            type: 'maintenance_status',
            message: `The scheduled repair for "${row.title}" has now started!`,
            link: '/maintenance',
            read: false
        }))

    if (notificationRows.length > 0) {
        const { error: notifError } = await supabaseAdmin
            .from('notifications')
            .insert(notificationRows)

        if (notifError) {
            console.error('[Maintenance Auto-Start] Notification insert failed:', notifError)
        } else {
            summary.notified = notificationRows.length
        }
    }

    return summary
}

// Auto-process approved move-outs even when no landlord is logged in.
// Any approved move-out due today (Asia/Manila) or earlier is ended automatically.
async function autoProcessDueMoveOuts() {
    const summary = { ended: 0 }
    const todayDate = getTimeZoneDateString(new Date())

    const { data: candidates, error: candidatesError } = await supabaseAdmin
        .from('tenant_occupancies')
        .select('id, tenant_id, property_id, end_request_date')
        .eq('end_request_status', 'approved')
        .in('status', ['active', 'pending_end'])
        .lte('end_request_date', todayDate)
        .limit(500)

    if (candidatesError) {
        throw new Error(`Failed to fetch move-out candidates: ${candidatesError.message}`)
    }

    if (!candidates || candidates.length === 0) {
        return summary
    }

    for (const occupancy of candidates) {
        const { data: endedRows, error: endError } = await supabaseAdmin
            .from('tenant_occupancies')
            .update({ status: 'ended' })
            .eq('id', occupancy.id)
            .eq('end_request_status', 'approved')
            .in('status', ['active', 'pending_end'])
            .select('id')

        if (endError) {
            console.error('[Move-out Auto-Process] Failed to end occupancy:', endError)
            continue
        }

        if (!endedRows || endedRows.length === 0) {
            continue
        }

        summary.ended++

        if (occupancy.property_id) {
            const { error: propertyError } = await supabaseAdmin
                .from('properties')
                .update({ status: 'available' })
                .eq('id', occupancy.property_id)

            if (propertyError) {
                console.error('[Move-out Auto-Process] Failed to mark property available:', propertyError)
            }
        }

        if (occupancy.tenant_id && occupancy.property_id) {
            const { error: bookingError } = await supabaseAdmin
                .from('bookings')
                .update({ status: 'completed' })
                .eq('tenant', occupancy.tenant_id)
                .eq('property_id', occupancy.property_id)
                .in('status', ['pending', 'pending_approval', 'approved', 'accepted'])

            if (bookingError) {
                console.error('[Move-out Auto-Process] Failed to finalize bookings:', bookingError)
            }

            const { error: applicationError } = await supabaseAdmin
                .from('applications')
                .update({ status: 'completed' })
                .eq('tenant', occupancy.tenant_id)
                .eq('property_id', occupancy.property_id)
                .eq('status', 'accepted')

            if (applicationError) {
                console.error('[Move-out Auto-Process] Failed to finalize applications:', applicationError)
            }
        }
    }

    return summary
}

// Increase timeout for Vercel serverless
export const config = {
    maxDuration: 30,
};

export default async function handler(req, res) {
    // === CRON AUTH: Allow both client-side calls and Supabase pg_cron calls ===
    const cronSecret = req.headers['x-cron-secret'] || req.query.cron_secret;
    const isCronCall = cronSecret === process.env.CRON_SECRET;
    const isClientCall = req.headers.referer || req.headers.origin;

    if (!isCronCall && !isClientCall) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const results = {
        processed: 0,
        messages: 0,
        bookings: 0,
        errors: 0,
        maintenanceAutoStarted: 0,
        maintenanceNotified: 0,
        occupancyAutoEnded: 0,
        occupancyAutoCancelledForBills: 0,
        occupancyAutoBlockedByBills: 0
    }

    try {
        // 0. Auto-start due maintenance requests regardless of user activity.
        try {
            const maintenance = await autoStartDueMaintenanceRequests()
            results.maintenanceAutoStarted = maintenance.updated
            results.maintenanceNotified = maintenance.notified
        } catch (maintenanceErr) {
            console.error('[Maintenance Auto-Start] Failed:', maintenanceErr)
            results.errors++
        }

        // 0.5. Auto-process due approved move-outs regardless of user activity.
        try {
            const moveOuts = await autoProcessDueMoveOuts()
            results.occupancyAutoEnded = moveOuts.ended
        } catch (moveOutErr) {
            console.error('[Move-out Auto-Process] Failed:', moveOutErr)
            results.errors++
        }

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
            const autoActions = []
            if (results.maintenanceAutoStarted > 0) {
                autoActions.push(`auto-started ${results.maintenanceAutoStarted} maintenance request(s)`)
            }
            if (results.occupancyAutoEnded > 0) {
                autoActions.push(`auto-ended ${results.occupancyAutoEnded} occupancy record(s)`)
            }

            const message = autoActions.length > 0
                ? `No due reminders. ${autoActions.join(', ')}.`
                : 'No due reminders'

            return res.status(200).json({ success: true, message, results })
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
            This is an automated reminder from Abalay.
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

    // Skip if already sent or cancelled/rejected.
    // Keep this in sync with active booking statuses used by booking flows.
    if (booking.reminder_sent || !['pending', 'pending_approval', 'approved', 'accepted'].includes(booking.status)) {
        return
    }

    // Get tenant email
    const { data: tenantEmail } = await supabaseAdmin.rpc('get_user_email', {
        user_id: booking.tenant
    })

    const tenant = booking.tenant_profile
    const phone = formatPhoneNumber(tenant?.phone)
    const propertyTitle = booking.property?.title || 'Property'
    const scheduleDisplay = getBookingScheduleDisplay(booking)

    if (!scheduleDisplay) {
        console.warn(`Skipping booking reminder ${booking.id}: Missing valid start/end schedule`) 
        return
    }

    let sentAny = false

    // Send Email
    if (tenantEmail) {
        try {
                        const subject = `📅 Reminder: Viewing on ${scheduleDisplay.subjectDateText} for ${propertyTitle}`
            const htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #eff6ff; border-radius: 12px; padding: 24px; border: 1px solid #bfdbfe;">
            <h2 style="color: #1e40af; margin-top: 0;">📅 Viewing Reminder</h2>
            <p>Hi <strong>${tenant?.first_name || 'there'}</strong>,</p>
                        <p>This is a reminder about your upcoming viewing (${scheduleDisplay.relativeDayText}):</p>
            <div style="background: white; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Property:</strong> ${propertyTitle}</p>
                            <p style="margin: 4px 0;"><strong>Date:</strong> ${scheduleDisplay.fullDateText}</p>
                            <p style="margin: 4px 0;"><strong>Time (PH):</strong> ${scheduleDisplay.timeRangeText}</p>
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
                date: scheduleDisplay.shortDateText,
                time: scheduleDisplay.timeRangeText
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
