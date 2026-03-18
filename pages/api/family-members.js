import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { sendFamilyMemberAddedEmail } from '../../lib/email'
import { sendFamilyMemberAddedSMS } from '../../lib/sms'

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const { occupancy_id, member_id } = req.query

        // ─── GET PARENT OCCUPANCY FOR A FAMILY MEMBER ───
        if (member_id) {
            const { data: fmRecord, error: fmErr } = await supabaseAdmin
                .from('family_members')
                .select('parent_occupancy_id')
                .eq('member_id', member_id)
                .maybeSingle()

            if (fmErr) return res.status(500).json({ error: fmErr.message })
            if (!fmRecord) return res.status(200).json({ occupancy: null })

            const { data: parentOcc, error: occErr } = await supabaseAdmin
                .from('tenant_occupancies')
                .select(`*, property:properties(id, title, address, city, images, price, terms_conditions), landlord:profiles!tenant_occupancies_landlord_id_fkey(id, first_name, middle_name, last_name), tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, email, phone, avatar_url)`)
                .eq('id', fmRecord.parent_occupancy_id)
                .in('status', ['active', 'pending_end'])
                .maybeSingle()

            if (occErr) return res.status(500).json({ error: occErr.message })

            // Also fetch payments and balance for this occupancy
            let pendingPayments = []
            let paymentHistory = []
            let tenantBalance = 0

            if (parentOcc) {
                // Pending payments (basic - for dashboard)
                const { data: pending } = await supabaseAdmin
                    .from('payment_requests')
                    .select('*')
                    .eq('tenant', parentOcc.tenant_id)
                    .neq('status', 'paid')
                    .neq('status', 'cancelled')
                    .or(`occupancy_id.eq.${parentOcc.id},occupancy_id.is.null`)
                    .order('due_date', { ascending: true })
                pendingPayments = pending || []

                // Payment history (basic - for dashboard)
                const { data: history } = await supabaseAdmin
                    .from('payment_requests')
                    .select('*')
                    .eq('tenant', parentOcc.tenant_id)
                    .eq('status', 'paid')
                    .eq('occupancy_id', parentOcc.id)
                    .order('due_date', { ascending: true })
                paymentHistory = history || []

                // Balance
                const { data: balance } = await supabaseAdmin
                    .from('tenant_balances')
                    .select('amount')
                    .eq('tenant_id', parentOcc.tenant_id)
                    .eq('occupancy_id', parentOcc.id)
                    .maybeSingle()
                tenantBalance = balance?.amount || 0

                // Last paid bill (for dashboard display)
                const { data: lastPaid } = await supabaseAdmin
                    .from('payment_requests')
                    .select('*')
                    .eq('occupancy_id', parentOcc.id)
                    .eq('status', 'paid')
                    .gt('rent_amount', 0)
                    .order('due_date', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                // All paid bills for calculateNextPayment
                const { data: allPaid } = await supabaseAdmin
                    .from('payment_requests')
                    .select('due_date, rent_amount, advance_amount, is_renewal_payment, is_advance_payment, is_move_in_payment, property_id, occupancy_id, status')
                    .eq('tenant', parentOcc.tenant_id)
                    .in('status', ['paid', 'pending_confirmation'])
                    .gt('rent_amount', 0)
                    .order('due_date', { ascending: false })

                // Security deposit check
                const { data: paidSecDep } = await supabaseAdmin
                    .from('payment_requests')
                    .select('security_deposit_amount')
                    .eq('occupancy_id', parentOcc.id)
                    .eq('status', 'paid')
                    .gt('security_deposit_amount', 0)
                    .limit(1)
                    .maybeSingle()

                // ─── FULL DATA FOR PAYMENTS PAGE (with relations) ───
                // Payment requests with full relations (for payments page display)
                const { data: fullRequests } = await supabaseAdmin
                    .from('payment_requests')
                    .select(`
                        *,
                        properties(title, address),
                        tenant_profile:profiles!payment_requests_tenant_fkey(first_name, middle_name, last_name, phone),
                        landlord_profile:profiles!payment_requests_landlord_fkey(first_name, middle_name, last_name, phone)
                    `)
                    .eq('tenant', parentOcc.tenant_id)
                    .order('created_at', { ascending: false })

                // Payments table (confirmed payments with relations)
                const { data: paymentsData } = await supabaseAdmin
                    .from('payments')
                    .select('*, properties(title), profiles!payments_tenant_fkey(first_name, middle_name, last_name)')
                    .eq('tenant', parentOcc.tenant_id)
                    .order('paid_at', { ascending: false })

                return res.status(200).json({
                    occupancy: parentOcc,
                    pendingPayments,
                    paymentHistory,
                    tenantBalance,
                    lastPaidBill: lastPaid || null,
                    allPaidBills: allPaid || [],
                    securityDepositPaid: !!paidSecDep,
                    fullPaymentRequests: fullRequests || [],
                    paymentsHistory: paymentsData || []
                })
            }

            return res.status(200).json({
                occupancy: parentOcc,
                pendingPayments,
                paymentHistory,
                tenantBalance
            })
        }

        // ─── LIST FAMILY MEMBERS FOR AN OCCUPANCY ───
        if (!occupancy_id) return res.status(400).json({ error: 'occupancy_id or member_id required' })

        const { data, error } = await supabaseAdmin
            .from('family_members')
            .select('*, member_profile:profiles!family_members_member_id_fkey(id, first_name, middle_name, last_name, email, phone, avatar_url, role)')
            .eq('parent_occupancy_id', occupancy_id)
            .order('created_at', { ascending: true })

        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ members: data || [] })
    }

    if (req.method === 'POST') {
        const { action } = req.body

        // ─── SEARCH TENANTS ───
        if (action === 'search') {
            const { query, exclude_ids } = req.body
            if (!query || query.trim().length < 2) return res.status(400).json({ error: 'Query too short' })

            const terms = query.trim().split(/\s+/).filter(Boolean)

            // Limit terms to avoid extremely long queries
            const safeTerms = terms.slice(0, 5)

            // Construct OR string with all terms for first_name, last_name, or email
            const orFilters = safeTerms.flatMap(term => [
                `first_name.ilike.%${term}%`,
                `last_name.ilike.%${term}%`,
                `email.ilike.%${term}%`
            ])

            let dbQuery = supabaseAdmin
                .from('profiles')
                .select('id, first_name, middle_name, last_name, email, phone, avatar_url, role')
                .eq('role', 'tenant')
                .eq('is_deleted', false)
                .or(orFilters.join(','))
                .limit(50) // Fetch broadly, filter accurately in-memory

            const { data, error } = await dbQuery
            if (error) return res.status(500).json({ error: error.message })

            // Filter in-memory to ensure all typed terms match either the full name or email
            const excludeSet = new Set(exclude_ids || [])
            const results = (data || [])
                .filter(u => {
                    if (excludeSet.has(u.id)) return false
                    const fullName = `${u.first_name || ''} ${u.middle_name || ''} ${u.last_name || ''}`.toLowerCase()
                    const email = (u.email || '').toLowerCase()

                    // All search terms must be found in either fullName or email
                    const lowerTerms = terms.map(t => t.toLowerCase())
                    return lowerTerms.every(term => fullName.includes(term) || email.includes(term))
                })
                .slice(0, 10) // Only return top 10

            return res.status(200).json({ results })
        }

        // ─── LOOKUP MEMBERS (for identifying family request origins) ───
        if (action === 'lookup_members') {
            const { member_ids } = req.body
            if (!member_ids || !member_ids.length) return res.status(200).json({ membersMap: {} })

            const { data: fmData } = await supabaseAdmin
                .from('family_members')
                .select('member_id, parent_occupancy:tenant_occupancies!family_members_parent_occupancy_id_fkey(tenant:profiles!tenant_occupancies_tenant_id_fkey(first_name, last_name))')
                .in('member_id', member_ids)

            const map = {}
            if (fmData) {
                fmData.forEach(f => {
                    map[f.member_id] = f.parent_occupancy?.tenant
                })
            }
            return res.status(200).json({ membersMap: map })
        }

        // ─── ADD FAMILY MEMBER ───
        if (action === 'add') {
            const { parent_occupancy_id, member_id, mother_id } = req.body
            if (!parent_occupancy_id || !member_id || !mother_id) {
                return res.status(400).json({ error: 'Missing required fields' })
            }

            // 1. Get the parent occupancy details
            const { data: parentOccupancy, error: occError } = await supabaseAdmin
                .from('tenant_occupancies')
                .select('*')
                .eq('id', parent_occupancy_id)
                .single()

            if (occError || !parentOccupancy) {
                return res.status(404).json({ error: 'Parent occupancy not found' })
            }

            // 2. Verify the caller is the mother (primary tenant)
            if (parentOccupancy.tenant_id !== mother_id) {
                return res.status(403).json({ error: 'Only the primary tenant can add family members' })
            }

            // 3. Check subscription slots before allowing add
            const { data: existingMembers } = await supabaseAdmin
                .from('family_members')
                .select('id')
                .eq('parent_occupancy_id', parent_occupancy_id)

            const currentMemberCount = (existingMembers || []).length

            // Hard cap: max 4 family members total
            if (currentMemberCount >= 4) {
                return res.status(400).json({ error: 'Maximum 4 family members allowed (5 total including primary tenant)' })
            }

            // Check tenant's permanent subscription for available slots
            let { data: subscription } = await supabaseAdmin
                .from('subscriptions')
                .select('*')
                .eq('tenant_id', mother_id)
                .maybeSingle()

            // Auto-create free subscription if none exists (tied to tenant, not occupancy)
            if (!subscription) {
                const { data: newSub } = await supabaseAdmin
                    .from('subscriptions')
                    .insert({
                        tenant_id: mother_id,
                        plan_type: 'free',
                        total_slots: 1,
                        paid_slots: 0,
                        status: 'active'
                    })
                    .select()
                    .single()
                subscription = newSub
            }

            const totalSlots = subscription?.total_slots || 1

            // If tenant has used all available slots, they need to pay for more
            if (currentMemberCount >= totalSlots) {
                return res.status(402).json({
                    error: 'No available family member slots. Purchase an additional slot for ₱50.',
                    needs_payment: true,
                    used_slots: currentMemberCount,
                    total_slots: totalSlots,
                    slot_price: 1,
                    occupancy_id: parent_occupancy_id
                })
            }

            // 4. Check if member already has an active occupancy
            const { data: existingOccupancy } = await supabaseAdmin
                .from('tenant_occupancies')
                .select('id')
                .eq('tenant_id', member_id)
                .in('status', ['active', 'pending_end'])
                .limit(1)
                .maybeSingle()

            if (existingOccupancy) {
                return res.status(400).json({ error: 'This tenant already has an active occupancy' })
            }

            // 5. Check if already a family member of this occupancy
            const { data: alreadyMember } = await supabaseAdmin
                .from('family_members')
                .select('id')
                .eq('parent_occupancy_id', parent_occupancy_id)
                .eq('member_id', member_id)
                .maybeSingle()

            if (alreadyMember) {
                return res.status(400).json({ error: 'This user is already a family member' })
            }

            // 6. Insert family_members record ONLY
            // We no longer create a duplicate tenant_occupancy because of the 'unique_active_property_occupancy' database constraint (only 1 active occupancy per property).
            const { error: fmError } = await supabaseAdmin
                .from('family_members')
                .insert({
                    parent_occupancy_id: parent_occupancy_id,
                    member_id: member_id,
                    added_by: mother_id
                })

            if (fmError) {
                return res.status(500).json({ error: 'Failed to add family member: ' + fmError.message })
            }

            // === NOTIFY LANDLORD (Email + SMS + In-App) ===
            try {
                // Fetch landlord profile, member profile, and property info
                const [landlordResult, memberResult, propertyResult, motherResult] = await Promise.all([
                    supabaseAdmin.from('profiles').select('id, first_name, last_name, email, phone').eq('id', parentOccupancy.landlord_id).single(),
                    supabaseAdmin.from('profiles').select('first_name, middle_name, last_name').eq('id', member_id).single(),
                    supabaseAdmin.from('properties').select('title').eq('id', parentOccupancy.property_id).single(),
                    supabaseAdmin.from('profiles').select('first_name, last_name').eq('id', mother_id).single()
                ])

                const landlord = landlordResult.data
                const member = memberResult.data
                const property = propertyResult.data
                const motherProfile = motherResult.data
                const tenantName = motherProfile ? `${motherProfile.first_name} ${motherProfile.last_name}` : 'A tenant'
                const memberName = member ? `${member.first_name}${member.middle_name ? ' ' + member.middle_name : ''} ${member.last_name}` : 'A family member'
                const propertyTitle = property?.title || 'your property'
                const landlordName = landlord ? `${landlord.first_name} ${landlord.last_name}` : 'Landlord'

                // Send Email (non-blocking)
                if (landlord?.email) {
                    sendFamilyMemberAddedEmail({
                        to: landlord.email,
                        landlordName,
                        tenantName,
                        memberName,
                        propertyTitle
                    }).catch(err => console.error('Family member email failed:', err))
                }

                // Send SMS (non-blocking)
                if (landlord?.phone) {
                    sendFamilyMemberAddedSMS(landlord.phone, {
                        tenantName,
                        memberName,
                        propertyTitle
                    }).catch(err => console.error('Family member SMS failed:', err))
                }

                // In-App Notification (non-blocking)
                if (landlord?.id) {
                    supabaseAdmin.from('notifications').insert({
                        recipient: landlord.id,
                        actor: mother_id,
                        type: 'family_member_added',
                        message: `${tenantName} added ${memberName} as a family member at ${propertyTitle}.`,
                        data: {},
                        read: false
                    }).then(() => console.log('Family member in-app notification created'))
                        .catch(err => console.error('Family member notification failed:', err))
                }
            } catch (notifyErr) {
                console.error('Family member notification error (non-fatal):', notifyErr)
            }

            return res.status(200).json({ success: true })
        }

        // ─── CLEANUP ON CONTRACT END ───
        if (action === 'cleanup') {
            const { occupancy_id } = req.body
            if (!occupancy_id) {
                return res.status(400).json({ error: 'occupancy_id required' })
            }

            // 1. Get the occupancy to determine if this is a parent or child
            const { data: occupancy } = await supabaseAdmin
                .from('tenant_occupancies')
                .select('id, is_family_member, parent_occupancy_id, property_id, tenant_id')
                .eq('id', occupancy_id)
                .single()

            if (!occupancy) {
                return res.status(404).json({ error: 'Occupancy not found' })
            }

            // Determine the parent occupancy ID
            const parentOccId = occupancy.is_family_member ? occupancy.parent_occupancy_id : occupancy.id

            if (!parentOccId) {
                return res.status(200).json({ success: true, cleaned: 0 })
            }

            // 2. Get all family members linked to this parent occupancy
            const { data: familyMembers } = await supabaseAdmin
                .from('family_members')
                .select('id, member_id, member_occupancy_id')
                .eq('parent_occupancy_id', parentOccId)

            if (!familyMembers || familyMembers.length === 0) {
                return res.status(200).json({ success: true, cleaned: 0 })
            }

            let cleanedCount = 0

            // 3. End each family member's occupancy and clean their bookings/applications
            for (const fm of familyMembers) {
                if (fm.member_occupancy_id) {
                    // End the occupancy
                    await supabaseAdmin
                        .from('tenant_occupancies')
                        .update({
                            status: 'ended',
                            end_date: new Date().toISOString(),
                            is_family_member: false,
                            parent_occupancy_id: null
                        })
                        .eq('id', fm.member_occupancy_id)

                    // Mark their bookings as completed so they can book new viewings
                    await supabaseAdmin
                        .from('bookings')
                        .update({ status: 'completed' })
                        .eq('tenant', fm.member_id)
                        .eq('property_id', occupancy.property_id)
                        .in('status', ['pending', 'pending_approval', 'approved', 'accepted', 'cancelled'])

                    // Mark their applications as completed
                    await supabaseAdmin
                        .from('applications')
                        .update({ status: 'completed' })
                        .eq('tenant', fm.member_id)
                        .eq('property_id', occupancy.property_id)
                        .eq('status', 'accepted')
                }
                cleanedCount++
            }

            // 4. Delete all family_members records for this parent occupancy
            await supabaseAdmin
                .from('family_members')
                .delete()
                .eq('parent_occupancy_id', parentOccId)

            // 5. Clear the parent occupancy's family member flag too (if ending the parent)
            if (!occupancy.is_family_member) {
                // This is the mother's occupancy being ended - clear is_family_member on it too
                await supabaseAdmin
                    .from('tenant_occupancies')
                    .update({ is_family_member: false, parent_occupancy_id: null })
                    .eq('parent_occupancy_id', parentOccId)
            }

            console.log(`✅ Family cleanup: ${cleanedCount} member(s) disconnected for occupancy ${occupancy_id}`)
            return res.status(200).json({ success: true, cleaned: cleanedCount })
        }

        return res.status(400).json({ error: 'Invalid action' })
    }

    if (req.method === 'DELETE') {
        const { family_member_id, mother_id } = req.body
        if (!family_member_id || !mother_id) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        // 1. Get the family member record
        const { data: fm, error: fmError } = await supabaseAdmin
            .from('family_members')
            .select('*, parent_occupancy:tenant_occupancies!family_members_parent_occupancy_id_fkey(tenant_id)')
            .eq('id', family_member_id)
            .single()

        if (fmError || !fm) {
            return res.status(404).json({ error: 'Family member not found' })
        }

        // 2. Verify caller is the mother
        if (fm.parent_occupancy?.tenant_id !== mother_id) {
            return res.status(403).json({ error: 'Only the primary tenant can remove family members' })
        }

        // 3. End the member's occupancy
        if (fm.member_occupancy_id) {
            await supabaseAdmin
                .from('tenant_occupancies')
                .update({ status: 'ended', end_date: new Date().toISOString() })
                .eq('id', fm.member_occupancy_id)
        }

        // 4. Delete the family member record
        await supabaseAdmin
            .from('family_members')
            .delete()
            .eq('id', family_member_id)

        return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
