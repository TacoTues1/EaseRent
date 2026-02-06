// pages/api/admin/send-monthly-statements.js
// Regular admin API endpoint for manually triggering monthly statements

import { createClient } from '@supabase/supabase-js'
import { generateStatementPDF } from '../../../lib/pdf-generator'
import { sendMonthlyStatementEmail } from '../../../lib/email'

/**
 * Generates a password for the PDF based on tenant info
 * Format: Birthday in MMDDYYYY format (with leading zeros)
 * Example: birthday 03/16/2005 -> 03162005
 */
function generatePassword(tenant) {
    let password = '00000000'
    if (tenant.birthday) {
        const bday = new Date(tenant.birthday)
        const month = String(bday.getMonth() + 1).padStart(2, '0') // 01-12
        const day = String(bday.getDate()).padStart(2, '0') // 01-31
        const year = bday.getFullYear()
        password = `${month}${day}${year}`
    }

    return password
}



export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' })
    }

    // Initialize Supabase Admin Client inside handler
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    try {
        // Calculate the period (previous month)
        const now = new Date()
        const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
        const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1

        const periodStart = new Date(year, month, 1)
        const periodEnd = new Date(year, month + 1, 0, 23, 59, 59) // Last day of month

        const monthName = periodStart.toLocaleString('default', { month: 'long' })
        const period = {
            start: periodStart,
            end: periodEnd,
            monthName,
            year,
            monthYear: `${monthName} ${year}`
        }

        // Get all active tenant occupancies (tenants assigned to properties)
        // Include 'active' and 'pending_end' status (tenants who requested to move out but are still active)
        const { data: occupancies, error: occError } = await supabaseAdmin
            .from('tenant_occupancies')
            .select(`
        id,
        tenant_id,
        property_id,
        status,
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone, birthday),
        property:properties(id, title)
      `)
            .in('status', ['active', 'pending_end'])

        console.log('Occupancies query result:', { count: occupancies?.length, error: occError })

        if (occError) {
            console.error('Error fetching occupancies:', occError)
            return res.status(500).json({ error: 'Failed to fetch occupancies: ' + occError.message })
        }

        if (!occupancies || occupancies.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No active tenant occupancies found',
                processed: 0,
                debug: 'Query returned 0 occupancies'
            })
        }

        let processed = 0
        let errors = []

        for (const occ of occupancies) {
            try {
                const tenant = occ.tenant
                if (!tenant) {
                    console.log(`Occupancy ${occ.id}: No tenant profile found`)
                    errors.push({ occupancyId: occ.id, error: 'Tenant profile not found' })
                    continue
                }

                // Get tenant email using RPC function
                const { data: tenantEmail, error: emailError } = await supabaseAdmin.rpc('get_user_email', {
                    user_id: occ.tenant_id
                })

                console.log(`Tenant ${tenant.first_name}: email lookup result:`, { email: tenantEmail, error: emailError })

                if (emailError || !tenantEmail) {
                    console.error(`Error getting email for tenant ${occ.tenant_id}:`, emailError)
                    errors.push({ tenant: tenant.first_name, error: 'Email not found' })
                    continue
                }

                // Get ALL payments for this tenant (paid/completed/confirmed)
                // We'll include all payment history in the statement
                const { data: payments, error: paymentError } = await supabaseAdmin
                    .from('payment_requests')
                    .select('*')
                    .eq('tenant', occ.tenant_id)
                    .in('status', ['paid', 'completed', 'confirmed'])
                    .order('created_at', { ascending: false })

                if (paymentError) {
                    console.error(`Error fetching payments for ${tenantEmail}:`, paymentError)
                    errors.push({ tenant: tenantEmail, error: paymentError.message })
                    continue
                }

                console.log(`Tenant ${tenant.first_name}: Found ${payments?.length || 0} total paid payments`)
                if (payments && payments.length > 0) {
                    console.log(`  Latest payment: ${payments[0].created_at}, Amount: ${payments[0].rent_amount}`)
                }

                // Create tenant object with email for PDF generation
                const tenantWithEmail = {
                    ...tenant,
                    email: tenantEmail
                }

                // Generate password
                const password = generatePassword(tenantWithEmail)

                // Generate PDF
                const pdfBuffer = await generateStatementPDF(tenantWithEmail, payments || [], period, password)

                // Send email with PDF attachment (also BCC admin for verification)
                const ADMIN_EMAIL = 'alfnzperez@gmail.com' // Admin receives a copy
                const emailResult = await sendMonthlyStatementEmail({
                    to: tenantEmail,
                    tenantName: `${tenant.first_name} ${tenant.last_name}`,
                    period,
                    pdfBuffer,
                    adminBcc: ADMIN_EMAIL
                })

                if (emailResult.success) {
                    processed++
                    console.log(`✅ Statement sent to ${tenantEmail}`)
                } else {
                    const errMsg = typeof emailResult.error === 'string' ? emailResult.error : JSON.stringify(emailResult.error)
                    errors.push({ tenant: tenantEmail, error: errMsg })
                    console.error(`❌ Failed to send to ${tenantEmail}:`, emailResult.error)
                }
            } catch (err) {
                console.error(`Error processing occupancy ${occ.id}:`, err)
                errors.push({ occupancyId: occ.id, error: err.message })
            }
        }

        return res.status(200).json({
            success: true,
            processed,
            total: occupancies.length,
            errors: errors.length > 0 ? errors : undefined,
            period: period.monthYear
        })

    } catch (error) {
        console.error('Monthly statements error:', error)
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}
