// pages/api/admin/send-monthly-statements.js
// Regular admin API endpoint for manually triggering monthly statements

import { createClient } from '@supabase/supabase-js'
import { generateStatementPDF, generateLandlordStatementPDF } from '../../../lib/pdf-generator'
import { sendMonthlyStatementEmail, sendLandlordMonthlyStatementEmail } from '../../../lib/email'



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
        const cronSecret = req.headers['x-cron-secret'] || req.query?.cron_secret
        const isCronTriggered = cronSecret && cronSecret === process.env.CRON_SECRET
        const runSource = isCronTriggered ? 'pg_cron' : 'manual_admin'

        // Calculate the period (current month for testing - change to previous month for production)
        const now = new Date()
        const year = now.getFullYear()
        const month = now.getMonth() // Current month (0-indexed)

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

        // Send statements to all tenant profiles (not deleted), not only active occupancies.
        const { data: tenants, error: tenantFetchError } = await supabaseAdmin
            .from('profiles')
            .select('id, first_name, last_name, phone, birthday, email')
            .eq('role', 'tenant')
            .eq('is_deleted', false)

        if (tenantFetchError) {
            console.error('Error fetching tenants:', tenantFetchError)
            return res.status(500).json({ error: 'Failed to fetch tenants: ' + tenantFetchError.message })
        }

        if (!tenants || tenants.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No tenant profiles found',
                processed: 0,
                debug: 'Query returned 0 tenant profiles'
            })
        }

        let processed = 0
        let errors = []
        const tenantSentRecipients = []

        for (const tenant of tenants) {
            try {
                // Get tenant email using RPC function
                const { data: tenantEmail, error: emailError } = await supabaseAdmin.rpc('get_user_email', {
                    user_id: tenant.id
                })

                const resolvedTenantEmail = tenantEmail || tenant?.email
                if (emailError && !resolvedTenantEmail) {
                    console.error(`Error getting email for tenant ${tenant.id}:`, emailError)
                    errors.push({ tenant: tenant.first_name, error: 'Email not found' })
                    continue
                }
                if (!resolvedTenantEmail) {
                    errors.push({ tenant: tenant.first_name, error: 'Email not found' })
                    continue
                }

                // Get paid payments for this tenant
                const { data: payments, error: paymentError } = await supabaseAdmin
                    .from('payment_requests')
                    .select('*')
                    .eq('tenant', tenant.id)
                    .in('status', ['paid', 'completed', 'confirmed'])
                    .order('created_at', { ascending: false })

                if (paymentError) {
                    console.error(`Error fetching payments for ${tenantEmail}:`, paymentError)
                    errors.push({ tenant: tenantEmail, error: paymentError.message })
                    continue
                }
                // Only include payments inside the statement period.
                const filteredPayments = (payments || []).filter((p) => {
                    const paymentDate = new Date(p.paid_at || p.created_at)
                    return paymentDate >= periodStart && paymentDate <= periodEnd
                })

                // Create tenant object with email for PDF generation
                const tenantWithEmail = {
                    ...tenant,
                    email: resolvedTenantEmail
                }

                // Generate PDF
                const pdfBuffer = await generateStatementPDF(tenantWithEmail, filteredPayments, period)

                // Send email with PDF attachment (also BCC admin for verification)
                const ADMIN_EMAIL = 'alfnzperez@gmail.com' // Admin receives a copy
                const emailResult = await sendMonthlyStatementEmail({
                    to: resolvedTenantEmail,
                    tenantName: `${tenant.first_name} ${tenant.last_name}`,
                    period,
                    pdfBuffer,
                    hasPaymentRecord: filteredPayments.length > 0,
                    adminBcc: ADMIN_EMAIL
                })

                if (emailResult.success) {
                    processed++
                    tenantSentRecipients.push({
                        email: resolvedTenantEmail,
                        name: `${tenant.first_name || ''} ${tenant.last_name || ''}`.trim() || 'Tenant'
                    })
                } else {
                    const errMsg = typeof emailResult.error === 'string' ? emailResult.error : JSON.stringify(emailResult.error)
                    errors.push({ tenant: resolvedTenantEmail, error: errMsg })
                    console.error(`❌ Failed to send to ${resolvedTenantEmail}:`, emailResult.error)
                }
            } catch (err) {
                console.error(`Error processing tenant ${tenant.id}:`, err)
                errors.push({ tenantId: tenant.id, error: err.message })
            }
        }

        // ============================================
        // PART 2: SEND FINANCIAL STATEMENTS TO LANDLORDS
        // ============================================
        let landlordProcessed = 0
        let landlordSkippedTenantOverlap = 0
        let landlordErrors = []
        const landlordSentRecipients = []
        const landlordSkippedTenantOverlapRecipients = []

        try {
            // Get all landlord profiles (not deleted), even if they have no properties.
            const { data: landlords, error: landlordError } = await supabaseAdmin
                .from('profiles')
                .select('id, first_name, last_name, birthday, phone, email')
                .eq('role', 'landlord')
                .eq('is_deleted', false)

            if (landlordError) {
                console.error('Error fetching landlords:', landlordError)
            } else if (landlords && landlords.length > 0) {
                for (const landlord of landlords) {
                    try {
                        // Get landlord email
                        const { data: landlordEmail, error: emailError } = await supabaseAdmin.rpc('get_user_email', {
                            user_id: landlord.id
                        })

                        const resolvedLandlordEmail = landlordEmail || landlord?.email

                        if (emailError && !resolvedLandlordEmail) {
                            console.error(`Error getting email for landlord ${landlord.id}:`, emailError)
                            landlordErrors.push({ landlord: `${landlord.first_name} ${landlord.last_name}`, error: 'Email not found' })
                            continue
                        }
                        if (!resolvedLandlordEmail) {
                            landlordErrors.push({ landlord: `${landlord.first_name} ${landlord.last_name}`, error: 'Email not found' })
                            continue
                        }

                        const propMap = {}

                        // Get paid payments for this landlord's properties in the period
                        // Include all paid/confirmed/completed statuses
                        const { data: payments, error: payError } = await supabaseAdmin
                            .from('payment_requests')
                            .select('id, rent_amount, security_deposit_amount, advance_amount, water_bill, electrical_bill, wifi_bill, other_bills, paid_at, created_at, property_id, amount_paid, status, bills_description')
                            .eq('landlord', landlord.id)
                            .in('status', ['paid', 'confirmed', 'completed'])

                        if (payError) {
                            console.error(`Error fetching payments for landlord ${landlord.id}:`, payError)
                            continue
                        }
                        // Filter payments by date (use paid_at or created_at)
                        const filteredPayments = (payments || []).filter(p => {
                            const paymentDate = new Date(p.paid_at || p.created_at)
                            return paymentDate >= periodStart && paymentDate <= periodEnd
                        })

                        const propertyIds = [...new Set(filteredPayments.map((p) => p.property_id).filter(Boolean))]
                        if (propertyIds.length > 0) {
                            const { data: propertyRows } = await supabaseAdmin
                                .from('properties')
                                .select('id, title')
                                .in('id', propertyIds)

                            ;(propertyRows || []).forEach((p) => {
                                propMap[p.id] = p.title
                            })
                        }

                        // Calculate total income
                        const calculateTotal = (paymentsList) => {
                            return paymentsList?.reduce((sum, p) => {
                                const total = parseFloat(p.amount_paid || 0) || (
                                    (parseFloat(p.rent_amount) || 0) +
                                    (parseFloat(p.security_deposit_amount) || 0) +
                                    (parseFloat(p.advance_amount) || 0) +
                                    (parseFloat(p.water_bill) || 0) +
                                    (parseFloat(p.electrical_bill) || 0) +
                                    (parseFloat(p.wifi_bill) || 0) +
                                    (parseFloat(p.other_bills) || 0)
                                )
                                return sum + total
                            }, 0) || 0
                        }

                        // Group by property
                        const groupByProperty = (paymentsList) => {
                            const grouped = {}
                            paymentsList?.forEach(p => {
                                const propTitle = propMap[p.property_id] || 'Unknown'
                                if (!grouped[propTitle]) {
                                    grouped[propTitle] = { title: propTitle, income: 0, payments: 0 }
                                }
                                const total = parseFloat(p.amount_paid || 0) || (
                                    (parseFloat(p.rent_amount) || 0) +
                                    (parseFloat(p.security_deposit_amount) || 0) +
                                    (parseFloat(p.advance_amount) || 0) +
                                    (parseFloat(p.water_bill) || 0) +
                                    (parseFloat(p.electrical_bill) || 0) +
                                    (parseFloat(p.wifi_bill) || 0) +
                                    (parseFloat(p.other_bills) || 0)
                                )
                                grouped[propTitle].income += total
                                grouped[propTitle].payments += 1
                            })
                            return Object.values(grouped)
                        }

                        const totalIncome = calculateTotal(filteredPayments)
                        const propertySummary = groupByProperty(filteredPayments)

                        // Create landlord object with email for PDF generation
                        const landlordWithEmail = {
                            ...landlord,
                            email: resolvedLandlordEmail
                        }

                        // Generate PDF with individual payment breakdown
                        const pdfBuffer = await generateLandlordStatementPDF(
                            landlordWithEmail,
                            propertySummary,
                            {
                                start: periodStart,
                                end: periodEnd,
                                monthName: monthName,
                                year: year
                            },
                            totalIncome,
                            filteredPayments,  // Pass individual payments for detailed breakdown
                            propMap            // Pass property ID to name mapping
                        )

                        // Send landlord statement email with PDF attachment
                        const ADMIN_EMAIL = 'alfnzperez@gmail.com' // Admin receives a copy
                        const emailResult = await sendLandlordMonthlyStatementEmail({
                            to: resolvedLandlordEmail,
                            landlordName: `${landlord.first_name} ${landlord.last_name}`.trim() || 'Landlord',
                            period: {
                                monthName: monthName,
                                year: year,
                                start: periodStart,
                                end: periodEnd
                            },
                            totalIncome,
                            transactions: [],
                            propertySummary,
                            hasPaymentRecord: filteredPayments.length > 0,
                            pdfBuffer,
                            adminBcc: ADMIN_EMAIL
                        })

                        if (emailResult.success) {
                            landlordProcessed++
                            landlordSentRecipients.push({
                                email: resolvedLandlordEmail,
                                name: `${landlord.first_name || ''} ${landlord.last_name || ''}`.trim() || 'Landlord'
                            })

                        } else {
                            const errMsg = typeof emailResult.error === 'string' ? emailResult.error : JSON.stringify(emailResult.error)
                            landlordErrors.push({ landlord: resolvedLandlordEmail, error: errMsg })
                            console.error(`❌ Failed to send landlord statement to ${resolvedLandlordEmail}:`, emailResult.error)
                        }
                    } catch (err) {
                        console.error(`Error processing landlord ${landlord.id}:`, err)
                        landlordErrors.push({ landlordId: landlord.id, error: err.message })
                    }
                }
            }
        } catch (landlordErr) {
            console.error('Error processing landlord statements:', landlordErr)
        }

        const lastRunAt = new Date().toISOString()
        const historyEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            runAt: lastRunAt,
            source: runSource,
            period: period.monthYear,
            tenants: {
                total: tenants.length,
                processed,
                failed: errors.length
            },
            landlords: {
                processed: landlordProcessed,
                failed: landlordErrors.length,
                skippedTenantOverlap: landlordSkippedTenantOverlap
            },
            status: (errors.length > 0 || landlordErrors.length > 0) ? 'completed_with_errors' : 'completed'
        }

        const { data: historySetting } = await supabaseAdmin
            .from('system_settings')
            .select('value')
            .eq('key', 'monthly_statements_run_history')
            .maybeSingle()

        const rawHistory = historySetting?.value
        let parsedHistory = []
        if (Array.isArray(rawHistory)) {
            parsedHistory = rawHistory
        } else if (typeof rawHistory === 'string') {
            try {
                const parsed = JSON.parse(rawHistory)
                if (Array.isArray(parsed)) parsedHistory = parsed
            } catch {
                parsedHistory = []
            }
        }

        const newHistory = [historyEntry, ...parsedHistory].slice(0, 20)

        await supabaseAdmin
            .from('system_settings')
            .upsert(
                [
                    { key: 'monthly_statements_last_run_at', value: lastRunAt },
                    { key: 'monthly_statements_last_run_source', value: runSource },
                    { key: 'monthly_statements_run_history', value: newHistory }
                ],
                { onConflict: 'key' }
            )

        return res.status(200).json({
            success: true,
            source: runSource,
            lastRunAt,
            historyEntry,
            historyPreview: newHistory.slice(0, 10),
            tenants: {
                processed,
                total: tenants.length,
                sentRecipients: tenantSentRecipients,
                errors: errors.length > 0 ? errors : undefined
            },
            landlords: {
                processed: landlordProcessed,
                skippedTenantOverlap: landlordSkippedTenantOverlap,
                sentRecipients: landlordSentRecipients,
                skippedTenantOverlapRecipients: landlordSkippedTenantOverlapRecipients,
                errors: landlordErrors.length > 0 ? landlordErrors : undefined
            },
            period: period.monthYear
        })

    } catch (error) {
        console.error('Monthly statements error:', error)
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}
