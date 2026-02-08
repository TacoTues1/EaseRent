// pages/api/admin/send-monthly-statements.js
// Regular admin API endpoint for manually triggering monthly statements

import { createClient } from '@supabase/supabase-js'
import { generateStatementPDF, generateLandlordStatementPDF } from '../../../lib/pdf-generator'
import { sendMonthlyStatementEmail, sendLandlordMonthlyStatementEmail } from '../../../lib/email'

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

        // ============================================
        // PART 2: SEND FINANCIAL STATEMENTS TO LANDLORDS
        // ============================================
        let landlordProcessed = 0
        let landlordErrors = []

        try {
            // Get all landlords who have properties
            const { data: landlords, error: landlordError } = await supabaseAdmin
                .from('profiles')
                .select('id, first_name, last_name, birthday, phone')
                .eq('role', 'landlord')
                .eq('is_deleted', false)

            if (landlordError) {
                console.error('Error fetching landlords:', landlordError)
            } else if (landlords && landlords.length > 0) {
                console.log(`Found ${landlords.length} landlords to process`)

                for (const landlord of landlords) {
                    try {
                        // Get landlord email
                        const { data: landlordEmail, error: emailError } = await supabaseAdmin.rpc('get_user_email', {
                            user_id: landlord.id
                        })

                        if (emailError || !landlordEmail) {
                            console.error(`Error getting email for landlord ${landlord.id}:`, emailError)
                            landlordErrors.push({ landlord: `${landlord.first_name} ${landlord.last_name}`, error: 'Email not found' })
                            continue
                        }

                        // Get landlord's properties
                        const { data: properties, error: propError } = await supabaseAdmin
                            .from('properties')
                            .select('id, title')
                            .eq('landlord', landlord.id)
                            .eq('is_deleted', false)

                        if (propError || !properties || properties.length === 0) {
                            console.log(`Landlord ${landlord.first_name} has no properties, skipping`)
                            continue
                        }

                        const propIds = properties.map(p => p.id)
                        const propMap = properties.reduce((acc, p) => ({ ...acc, [p.id]: p.title }), {})

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

                        console.log(`Landlord ${landlord.first_name}: Found ${payments?.length || 0} total payments`)

                        // Filter payments by date (use paid_at or created_at)
                        const filteredPayments = (payments || []).filter(p => {
                            const paymentDate = new Date(p.paid_at || p.created_at)
                            return paymentDate >= periodStart && paymentDate <= periodEnd
                        })

                        console.log(`Landlord ${landlord.first_name}: ${filteredPayments.length} payments in ${monthName} ${year}`)

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
                            email: landlordEmail
                        }

                        // Generate password (same format as tenant - birthday)
                        const password = generatePassword(landlordWithEmail)

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
                            password,
                            filteredPayments,  // Pass individual payments for detailed breakdown
                            propMap            // Pass property ID to name mapping
                        )

                        // Send landlord statement email with PDF attachment
                        const ADMIN_EMAIL = 'alfnzperez@gmail.com' // Admin receives a copy
                        const emailResult = await sendLandlordMonthlyStatementEmail({
                            to: landlordEmail,
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
                            pdfBuffer,
                            adminBcc: ADMIN_EMAIL
                        })

                        if (emailResult.success) {
                            landlordProcessed++
                            console.log(`✅ Landlord statement sent to ${landlordEmail}`)
                        } else {
                            const errMsg = typeof emailResult.error === 'string' ? emailResult.error : JSON.stringify(emailResult.error)
                            landlordErrors.push({ landlord: landlordEmail, error: errMsg })
                            console.error(`❌ Failed to send landlord statement to ${landlordEmail}:`, emailResult.error)
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

        return res.status(200).json({
            success: true,
            tenants: {
                processed,
                total: occupancies.length,
                errors: errors.length > 0 ? errors : undefined
            },
            landlords: {
                processed: landlordProcessed,
                errors: landlordErrors.length > 0 ? landlordErrors : undefined
            },
            period: period.monthYear
        })

    } catch (error) {
        console.error('Monthly statements error:', error)
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}
