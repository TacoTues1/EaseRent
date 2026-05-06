import { createClient } from '@supabase/supabase-js'
import { sendNotificationEmail } from '../../lib/email'
import { sendSMS } from '../../lib/sms'

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
  const hasValidTestSecret =
    process.env.NODE_ENV !== 'production' ||
    (process.env.TEST_SECRET && req.query.secret === process.env.TEST_SECRET)
  const authHeader = req.headers.authorization || ''
  const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]
  let requesterUserId = null

  if (!hasValidTestSecret && bearerToken) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(bearerToken)
    if (!authError) requesterUserId = authData?.user?.id || null
  }

  if (!hasValidTestSecret && !requesterUserId) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    const { tenantId, billType = 'rent' } = req.query

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' })
    }

    // Get tenant occupancy
    const { data: occupancy, error: occError } = await supabaseAdmin
      .from('tenant_occupancies')
      .select(`
        id,
        tenant_id,
        landlord_id,
        start_date,
        wifi_due_day,
        water_due_day,
        electricity_due_day,
        late_payment_fee,
        landlord_profile:profiles!tenant_occupancies_landlord_id_fkey(accepted_payments),
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone),
        property:properties(id, title, price)
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle()

    if (occError || !occupancy) {
      return res.status(404).json({ error: 'Active occupancy not found for this tenant' })
    }

    if (!hasValidTestSecret && requesterUserId !== occupancy.landlord_id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Utility "Send Now": send immediate reminder notifications without creating rent bills.
    if (billType !== 'rent') {
      const normalizeDay = (d, fallback) => {
        const value = parseInt(d, 10)
        if (!Number.isFinite(value)) return fallback
        return Math.max(1, Math.min(31, value))
      }

      const now = new Date()
      let dueDay = 7
      let utilityLabel = 'Utility'
      let notificationType = 'utility_due_reminder'

      if (billType === 'internet') {
        dueDay = normalizeDay(occupancy.wifi_due_day, 10)
        utilityLabel = 'Internet/WiFi'
        notificationType = 'wifi_due_reminder'
      } else if (billType === 'water') {
        dueDay = normalizeDay(occupancy.water_due_day, 7)
        utilityLabel = 'Water'
        notificationType = 'water_due_reminder'
      } else if (billType === 'electricity') {
        dueDay = normalizeDay(occupancy.electricity_due_day, 7)
        utilityLabel = 'Electricity'
        notificationType = 'electricity_due_reminder'
      } else {
        return res.status(400).json({ error: 'Unsupported billType. Use rent, internet, water, or electricity.' })
      }

      const utilitySettings = occupancy?.landlord_profile?.accepted_payments?.utility_reminders || {}
      if (utilitySettings[billType] === false) {
        return res.status(403).json({ error: `${utilityLabel} reminders are disabled by the landlord.` })
      }

      const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay)
      if (dueDate < now) dueDate.setMonth(dueDate.getMonth() + 1)
      const dueDateStr = dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

      // Get tenant email
      let email = null
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(occupancy.tenant_id)
        email = userData?.user?.email
      } catch (e) {
        console.error('Failed to fetch user email:', e)
      }

      const phone = formatPhoneNumber(occupancy.tenant?.phone)
      const tenantName = occupancy.tenant?.first_name || 'Tenant'
      const reminderMessage = `${utilityLabel} Reminder: ${utilityLabel} for "${occupancy.property?.title || 'your property'}" is due on ${dueDateStr}.`

      const results = { email_sent: false, sms_sent: false, in_app_sent: false }

      try {
        await supabaseAdmin.from('notifications').insert({
          recipient: occupancy.tenant_id,
          actor: occupancy.landlord_id,
          type: notificationType,
          message: reminderMessage,
          link: '/payments',
          is_read: false
        })
        results.in_app_sent = true
      } catch (e) {
        console.error('In-app notification error:', e)
      }

      if (email) {
        try {
          await sendNotificationEmail({
            to: email,
            subject: `⚠️ ${utilityLabel} Due Reminder`,
            message: `
              <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                <div style="padding: 20px; background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px;">
                  <h2 style="color: #0369a1; margin-top: 0;">⚠️ ${utilityLabel} Reminder</h2>
                  <p>${reminderMessage}</p>
                  <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://abalay-rent.me'}/dashboard" 
                     style="display: inline-block; background-color: #0369a1; color: white; padding: 10px 20px; margin-top: 15px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    View Dashboard
                  </a>
                </div>
              </div>
            `
          })
          results.email_sent = true
        } catch (e) {
          console.error('Email error:', e)
        }
      }

      if (phone) {
        try {
          await sendSMS(phone, `[Abalay] ${reminderMessage}`)
          results.sms_sent = true
        } catch (e) {
          console.error('SMS error:', e)
        }
      }

      return res.status(200).json({
        success: true,
        message: `${utilityLabel} reminder sent successfully`,
        results,
        details: {
          tenant: tenantName,
          property: occupancy.property?.title,
          due_date: dueDateStr,
          email: email || 'No email found',
          phone: phone || 'No phone found'
        }
      })
    }

    const rentAmount = occupancy.property?.price || 0
    const startDate = new Date(occupancy.start_date)

    // --- FIX: Calculate next due date based on last paid bill, not start_date ---
    // 1. Look for the most recent paid bill with rent_amount > 0
    const { data: lastPaidBill } = await supabaseAdmin
      .from('payment_requests')
      .select('due_date, rent_amount, advance_amount')
      .eq('occupancy_id', occupancy.id)
      .eq('status', 'paid')
      .gt('rent_amount', 0)
      .order('due_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    let dueDate

    if (lastPaidBill && lastPaidBill.due_date) {
      // Calculate months covered by the last payment (including any advance)
      const paidRent = parseFloat(lastPaidBill.rent_amount || 0)
      const paidAdvance = parseFloat(lastPaidBill.advance_amount || 0)

      let monthsCovered = 1
      if (paidRent > 0 && paidAdvance > 0) {
        monthsCovered = 1 + Math.floor(paidAdvance / rentAmount)
      }

      // Next due is monthsCovered months after the last paid bill's due date
      dueDate = new Date(lastPaidBill.due_date)
      dueDate.setMonth(dueDate.getMonth() + monthsCovered)

      // Preserve the original day of month from the start_date
      const startDay = startDate.getUTCDate()
      dueDate.setUTCDate(startDay)
    } else {
      // No paid bills yet - use start date
      dueDate = new Date(startDate)
    }

    dueDate.setHours(23, 59, 59, 999)
    const dueDateStr = dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const monthName = dueDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    // --- DUPLICATE CHECK: Prevent duplicate advance bills ---
    // Check if there's already a pending bill for this occupancy in the same month
    const dueDateMonth = dueDate.getMonth()
    const dueDateYear = dueDate.getFullYear()
    const monthStart = new Date(dueDateYear, dueDateMonth, 1).toISOString()
    const monthEnd = new Date(dueDateYear, dueDateMonth + 1, 0, 23, 59, 59).toISOString()

    const { data: existingBill } = await supabaseAdmin
      .from('payment_requests')
      .select('id, status, rent_amount')
      .eq('occupancy_id', occupancy.id)
      .gte('due_date', monthStart)
      .lte('due_date', monthEnd)
      .in('status', ['pending', 'pending_confirmation'])
      .maybeSingle()

    let paymentRequestCreated = false
    let paymentRequestUpdated = false

    if (existingBill) {
      const existingAmount = parseFloat(existingBill.rent_amount || 0)
      const latestAmount = parseFloat(rentAmount || 0)

      if (existingBill.status === 'pending' && existingAmount !== latestAmount) {
        const { error: updateExistingError } = await supabaseAdmin
          .from('payment_requests')
          .update({
            rent_amount: rentAmount,
            bills_description: `Monthly Rent for ${monthName}`
          })
          .eq('id', existingBill.id)
          .eq('status', 'pending')

        if (updateExistingError) {
          return res.status(500).json({
            error: 'Failed to sync existing pending bill with latest property price',
            details: updateExistingError
          })
        }

        paymentRequestUpdated = true
      }
    } else {
      // Create payment request
      const { error: billError } = await supabaseAdmin.from('payment_requests').insert({
        landlord: occupancy.landlord_id,
        tenant: occupancy.tenant_id,
        property_id: occupancy.property?.id,
        occupancy_id: occupancy.id,
        rent_amount: rentAmount,
        water_bill: 0,
        electrical_bill: 0,
        other_bills: 0,
        bills_description: `Monthly Rent for ${monthName}`,
        due_date: dueDate.toISOString(),
        status: 'pending'
      })

      if (billError) {
        return res.status(500).json({ error: 'Failed to create payment request', details: billError })
      }

      paymentRequestCreated = true
    }

    // Get tenant email
    let email = null
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(occupancy.tenant_id)
      email = userData?.user?.email
    } catch (e) {
      console.error("Failed to fetch user email:", e)
    }

    const phone = formatPhoneNumber(occupancy.tenant?.phone)
    const tenantName = occupancy.tenant?.first_name || 'Tenant'
    const rentMessage = `Rent Bill: Your monthly rent of ₱${Number(rentAmount).toLocaleString()} for "${occupancy.property?.title || 'your property'}" is due on ${dueDateStr}.${occupancy.late_payment_fee > 0 ? ` Late payment fee: ₱${Number(occupancy.late_payment_fee).toLocaleString()}` : ''} Please check your Payments page.`

    // Send notifications
    const results = { email_sent: false, sms_sent: false, in_app_sent: false }

    // 1. In-App Notification
    try {
      await supabaseAdmin.from('notifications').insert({
        recipient: occupancy.tenant_id,
        actor: occupancy.tenant_id,
        type: 'rent_bill_reminder',
        message: rentMessage,
        link: '/payments',
        is_read: false
      })
      results.in_app_sent = true
    } catch (e) {
      console.error("In-app notification error:", e)
    }

    // 2. Email
    if (email) {
      try {
        await sendNotificationEmail({
          to: email,
          subject: '🏠 Rent Bill',
          message: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
              <div style="padding: 20px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                <h2 style="color: #166534; margin-top: 0;">🏠 Rent Bill</h2>
                <p>${rentMessage}</p>
                <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://abalay-rent.me'}/payments" 
                   style="display: inline-block; background-color: #166534; color: white; padding: 10px 20px; margin-top: 15px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  View Payments
                </a>
              </div>
            </div>
          `
        })
        results.email_sent = true
      } catch (e) {
        console.error("Email error:", e)
      }
    }

    // 3. SMS
    if (phone) {
      try {
        await sendSMS(phone, `[Abalay] ${rentMessage}`)
        results.sms_sent = true
      } catch (e) {
        console.error("SMS error:", e)
      }
    }

    res.status(200).json({
      success: true,
      message: paymentRequestCreated
        ? 'Rent bill created and notifications sent'
        : paymentRequestUpdated
          ? 'Rent bill amount updated to latest property price and notifications sent'
          : 'Rent reminder sent for existing bill',
      results: {
        payment_request_created: paymentRequestCreated,
        payment_request_updated: paymentRequestUpdated,
        ...results
      },
      details: {
        tenant: tenantName,
        property: occupancy.property?.title,
        amount: rentAmount,
        due_date: dueDateStr,
        email: email || 'No email found',
        phone: phone || 'No phone found'
      }
    })

  } catch (error) {
    console.error('Test Rent Reminder Error:', error)
    res.status(500).json({ error: error.message })
  }
}
