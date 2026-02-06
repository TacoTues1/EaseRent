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
  // Security: Only allow in development or with a secret key
  if (process.env.NODE_ENV === 'production' && req.query.secret !== process.env.TEST_SECRET) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    const { tenantId } = req.query

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
        late_payment_fee,
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone),
        property:properties(id, title, price)
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle()

    if (occError || !occupancy) {
      return res.status(404).json({ error: 'Active occupancy not found for this tenant' })
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
      .select('id, status')
      .eq('occupancy_id', occupancy.id)
      .gte('due_date', monthStart)
      .lte('due_date', monthEnd)
      .in('status', ['pending', 'pending_confirmation'])
      .maybeSingle()

    if (existingBill) {
      return res.status(400).json({
        error: `A pending bill already exists for ${monthName}. Cannot create duplicate.`,
        existingBillId: existingBill.id
      })
    }

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
                <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://easerent.vercel.app'}/payments" 
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
        await sendSMS(phone, `[EaseRent] ${rentMessage}`)
        results.sms_sent = true
      } catch (e) {
        console.error("SMS error:", e)
      }
    }

    res.status(200).json({
      success: true,
      message: 'Rent bill created and notifications sent',
      results: {
        payment_request_created: true,
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
