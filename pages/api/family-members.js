import { supabaseAdmin } from '../../lib/supabaseAdmin'

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
                // Pending payments
                const { data: pending } = await supabaseAdmin
                    .from('payment_requests')
                    .select('*')
                    .eq('tenant', parentOcc.tenant_id)
                    .neq('status', 'paid')
                    .neq('status', 'cancelled')
                    .or(`occupancy_id.eq.${parentOcc.id},occupancy_id.is.null`)
                    .order('due_date', { ascending: true })
                pendingPayments = pending || []

                // Payment history
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

                return res.status(200).json({
                    occupancy: parentOcc,
                    pendingPayments,
                    paymentHistory,
                    tenantBalance,
                    lastPaidBill: lastPaid || null,
                    allPaidBills: allPaid || [],
                    securityDepositPaid: !!paidSecDep
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

            const searchTerm = `%${query.trim()}%`
            let dbQuery = supabaseAdmin
                .from('profiles')
                .select('id, first_name, middle_name, last_name, email, phone, avatar_url, role')
                .eq('role', 'tenant')
                .eq('is_deleted', false)
                .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm}`)
                .limit(10)

            const { data, error } = await dbQuery
            if (error) return res.status(500).json({ error: error.message })

            // Filter out excluded IDs (the mother + existing members)
            const excludeSet = new Set(exclude_ids || [])
            const filtered = (data || []).filter(u => !excludeSet.has(u.id))

            return res.status(200).json({ results: filtered })
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

            // 3. Check max 4 additional members (5 total including mother)
            const { data: existingMembers } = await supabaseAdmin
                .from('family_members')
                .select('id')
                .eq('parent_occupancy_id', parent_occupancy_id)

            if ((existingMembers || []).length >= 4) {
                return res.status(400).json({ error: 'Maximum 4 family members allowed (5 total including primary tenant)' })
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
