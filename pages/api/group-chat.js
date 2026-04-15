import { supabaseAdmin } from '../../lib/supabaseAdmin'

export default async function handler(req, res) {
    // Auth check - extract user from authorization header
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: 'Missing authorization' })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    const userId = user.id

    // Get user profile
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, role, first_name, last_name')
        .eq('id', userId)
        .single()

    if (!profile) {
        return res.status(404).json({ error: 'Profile not found' })
    }

    const enrichProfilesWithFamilyPrimary = async (profiles = []) => {
        const validProfiles = (profiles || []).filter(p => p?.id)
        if (validProfiles.length === 0) return profiles

        const profileIds = validProfiles.map(p => p.id)

        const { data: familyLinks, error: familyError } = await supabaseAdmin
            .from('family_members')
            .select('member_id, parent_occupancy_id')
            .in('member_id', profileIds)

        if (familyError || !familyLinks || familyLinks.length === 0) {
            return profiles
        }

        const occupancyIds = Array.from(new Set(familyLinks.map(link => link.parent_occupancy_id).filter(Boolean)))
        if (occupancyIds.length === 0) return profiles

        const { data: occupancies, error: occupancyError } = await supabaseAdmin
            .from('tenant_occupancies')
            .select('id, tenant_id, tenant:profiles!tenant_occupancies_tenant_id_fkey(first_name)')
            .in('id', occupancyIds)

        if (occupancyError) return profiles

        const occupancyMap = (occupancies || []).reduce((acc, occupancy) => {
            acc[occupancy.id] = {
                primaryTenantId: occupancy?.tenant_id || null,
                primaryTenantName: occupancy?.tenant?.first_name || null
            }
            return acc
        }, {})

        const primaryByMember = (familyLinks || []).reduce((acc, link) => {
            const occupancy = occupancyMap[link.parent_occupancy_id]
            if (!occupancy) return acc
            // Never tag the primary tenant as being under themselves.
            if (occupancy.primaryTenantId && link.member_id === occupancy.primaryTenantId) return acc

            if (!acc[link.member_id]) {
                acc[link.member_id] = occupancy.primaryTenantName || null
            }
            return acc
        }, {})

        return profiles.map(profileRow => ({
            ...profileRow,
            family_primary_first_name: primaryByMember[profileRow.id] || null
        }))
    }

    // ─── GET: List group conversations or get eligible members ───
    if (req.method === 'GET') {
        const { action } = req.query

        if (action === 'messages') {
            const { group_id } = req.query

            if (!group_id) {
                return res.status(400).json({ error: 'group_id is required' })
            }

            try {
                const { data: membership, error: memberError } = await supabaseAdmin
                    .from('group_conversation_members')
                    .select('id')
                    .eq('group_conversation_id', group_id)
                    .eq('user_id', userId)
                    .maybeSingle()

                if (memberError) throw memberError
                if (!membership) {
                    return res.status(403).json({ error: 'You are not a member of this group' })
                }

                const { data: rawMessages, error: messageError } = await supabaseAdmin
                    .from('group_messages')
                    .select('id, group_conversation_id, sender_id, message, file_url, file_name, file_type, file_size, created_at')
                    .eq('group_conversation_id', group_id)
                    .order('created_at', { ascending: true })
                    .limit(200)

                if (messageError) throw messageError

                const senderIds = Array.from(new Set((rawMessages || []).map(msg => msg.sender_id).filter(Boolean)))
                let profileMap = {}

                if (senderIds.length > 0) {
                    const { data: senderProfiles, error: senderError } = await supabaseAdmin
                        .from('profiles')
                        .select('id, first_name, middle_name, last_name, role, avatar_url')
                        .in('id', senderIds)

                    if (senderError) throw senderError

                    const enrichedProfiles = await enrichProfilesWithFamilyPrimary(senderProfiles || [])

                    profileMap = (enrichedProfiles || []).reduce((acc, profile) => {
                        acc[profile.id] = profile
                        return acc
                    }, {})
                }

                const messages = (rawMessages || []).map(msg => ({
                    ...msg,
                    sender: profileMap[msg.sender_id] || null
                }))

                return res.status(200).json({ messages })
            } catch (err) {
                console.error('Error loading group messages:', err)
                return res.status(500).json({ error: 'Failed to load group messages' })
            }
        }

        // Get eligible tenants for group chat (landlord only)
        if (action === 'eligible_members') {
            if (profile.role !== 'landlord') {
                return res.status(403).json({ error: 'Only landlords can create group chats' })
            }

            try {
                // Get all active occupancies for this landlord
                const { data: occupancies, error: occError } = await supabaseAdmin
                    .from('tenant_occupancies')
                    .select('id, tenant_id, property:properties(id, title)')
                    .eq('landlord_id', userId)
                    .in('status', ['active', 'pending_end'])

                if (occError) throw occError

                const tenantIds = new Set()
                const occupancyIds = []

                ;(occupancies || []).forEach(occ => {
                    if (occ?.tenant_id) tenantIds.add(occ.tenant_id)
                    if (occ?.id) occupancyIds.push(occ.id)
                })

                // Get family members for each occupancy
                if (occupancyIds.length > 0) {
                    for (const occupancyId of occupancyIds) {
                        const { data: familyMembers } = await supabaseAdmin
                            .from('family_members')
                            .select('member_id')
                            .eq('parent_occupancy_id', occupancyId)

                        ;(familyMembers || []).forEach(fm => {
                            if (fm.member_id) tenantIds.add(fm.member_id)
                        })
                    }
                }

                // Get tenant profiles
                const tenantIdArray = Array.from(tenantIds)
                if (tenantIdArray.length === 0) {
                    return res.status(200).json({ members: [] })
                }

                const { data: tenantProfiles, error: profileError } = await supabaseAdmin
                    .from('profiles')
                    .select('id, first_name, middle_name, last_name, role, phone, avatar_url')
                    .in('id', tenantIdArray)
                    .order('first_name')

                if (profileError) throw profileError

                // Enrich with property info
                const enrichedProfiles = (tenantProfiles || []).map(tp => {
                    const occupancy = (occupancies || []).find(occ =>
                        occ.tenant_id === tp.id
                    )
                    // Check if this tenant is a family member
                    const propertyTitle = occupancy?.property?.title || null
                    return {
                        ...tp,
                        property_title: propertyTitle
                    }
                })

                return res.status(200).json({ members: enrichedProfiles })
            } catch (err) {
                console.error('Error fetching eligible members:', err)
                return res.status(500).json({ error: 'Failed to fetch eligible members' })
            }
        }

        // List group conversations for current user
        try {
            const { data: memberships, error } = await supabaseAdmin
                .from('group_conversation_members')
                .select('group_conversation_id')
                .eq('user_id', userId)

            if (error) throw error

            const groupIds = (memberships || []).map(m => m.group_conversation_id)
            if (groupIds.length === 0) {
                return res.status(200).json({ groups: [] })
            }

            const { data: groups, error: groupError } = await supabaseAdmin
                .from('group_conversations')
                .select('*')
                .in('id', groupIds)
                .order('updated_at', { ascending: false })

            if (groupError) throw groupError

            // Enrich with member count and member profiles
            const enrichedGroups = await Promise.all(
                (groups || []).map(async group => {
                    const { data: members } = await supabaseAdmin
                        .from('group_conversation_members')
                        .select('user_id, role, user:profiles!group_conversation_members_user_id_fkey(id, first_name, middle_name, last_name, role, avatar_url)')
                        .eq('group_conversation_id', group.id)

                    const memberProfiles = (members || []).map(member => member.user).filter(Boolean)
                    const enrichedMemberProfiles = await enrichProfilesWithFamilyPrimary(memberProfiles)
                    const enrichedMemberMap = (enrichedMemberProfiles || []).reduce((acc, row) => {
                        acc[row.id] = row
                        return acc
                    }, {})

                    const normalizedMembers = (members || []).map(member => ({
                        ...member,
                        user: member.user_id ? (enrichedMemberMap[member.user_id] || member.user) : member.user
                    }))

                    // Get unread count for this user
                    const { data: allMessages } = await supabaseAdmin
                        .from('group_messages')
                        .select('id')
                        .eq('group_conversation_id', group.id)
                        .neq('sender_id', userId)

                    const messageIds = (allMessages || []).map(m => m.id)
                    let unreadCount = messageIds.length

                    if (messageIds.length > 0) {
                        const { data: reads } = await supabaseAdmin
                            .from('group_message_reads')
                            .select('group_message_id')
                            .eq('user_id', userId)
                            .in('group_message_id', messageIds)

                        unreadCount = messageIds.length - (reads || []).length
                    }

                    return {
                        ...group,
                        members: normalizedMembers,
                        member_count: normalizedMembers.length,
                        unread_count: Math.max(0, unreadCount)
                    }
                })
            )

            return res.status(200).json({ groups: enrichedGroups })
        } catch (err) {
            console.error('Error listing group conversations:', err)
            return res.status(500).json({ error: 'Failed to list group conversations' })
        }
    }

    // ─── POST: Create group chat or manage members ───
    if (req.method === 'POST') {
        const { action } = req.body

        // Create new group chat
        if (action === 'create') {
            if (profile.role !== 'landlord') {
                return res.status(403).json({ error: 'Only landlords can create group chats' })
            }

            const { name, member_ids } = req.body
            if (!name?.trim()) {
                return res.status(400).json({ error: 'Group name is required' })
            }
            if (!member_ids || member_ids.length === 0) {
                return res.status(400).json({ error: 'At least one member must be selected' })
            }

            try {
                // Validate all members are under landlord's active occupancies
                const { data: occupancies } = await supabaseAdmin
                    .from('tenant_occupancies')
                    .select('id, tenant_id')
                    .eq('landlord_id', userId)
                    .in('status', ['active', 'pending_end'])

                const allowedTenantIds = new Set()
                const occupancyIds = [];

                (occupancies || []).forEach(occ => {
                    if (occ?.tenant_id) allowedTenantIds.add(occ.tenant_id)
                    if (occ?.id) occupancyIds.push(occ.id)
                })

                // Also include family members
                if (occupancyIds.length > 0) {
                    for (const occId of occupancyIds) {
                        const { data: familyMembers } = await supabaseAdmin
                            .from('family_members')
                            .select('member_id')
                            .eq('parent_occupancy_id', occId)

                        ;(familyMembers || []).forEach(fm => {
                            if (fm.member_id) allowedTenantIds.add(fm.member_id)
                        })
                    }
                }

                // Validate all selected members
                const invalidMembers = member_ids.filter(id => !allowedTenantIds.has(id))
                if (invalidMembers.length > 0) {
                    return res.status(403).json({
                        error: 'Some selected members are not under your active occupancies'
                    })
                }

                // Create group conversation
                const { data: group, error: createError } = await supabaseAdmin
                    .from('group_conversations')
                    .insert({
                        name: name.trim(),
                        created_by: userId
                    })
                    .select()
                    .single()

                if (createError) throw createError

                // Add landlord as admin
                const memberInserts = [
                    {
                        group_conversation_id: group.id,
                        user_id: userId,
                        role: 'admin'
                    },
                    ...member_ids.map(memberId => ({
                        group_conversation_id: group.id,
                        user_id: memberId,
                        role: 'member'
                    }))
                ]

                const { error: memberError } = await supabaseAdmin
                    .from('group_conversation_members')
                    .insert(memberInserts)

                if (memberError) throw memberError

                return res.status(200).json({ success: true, group })
            } catch (err) {
                console.error('Error creating group chat:', err)
                return res.status(500).json({ error: 'Failed to create group chat' })
            }
        }

        // Add members to existing group
        if (action === 'add_members') {
            const { group_id, member_ids } = req.body

            if (profile.role !== 'landlord') {
                return res.status(403).json({ error: 'Only landlords can add members' })
            }

            try {
                // Verify user is admin of this group
                const { data: group } = await supabaseAdmin
                    .from('group_conversations')
                    .select('*')
                    .eq('id', group_id)
                    .eq('created_by', userId)
                    .single()

                if (!group) {
                    return res.status(403).json({ error: 'Only the group creator can add members' })
                }

                // Validate members are under landlord's occupancies
                const { data: occupancies } = await supabaseAdmin
                    .from('tenant_occupancies')
                    .select('id, tenant_id')
                    .eq('landlord_id', userId)
                    .in('status', ['active', 'pending_end'])

                const allowedTenantIds = new Set()
                const occupancyIds = [];

                (occupancies || []).forEach(occ => {
                    if (occ?.tenant_id) allowedTenantIds.add(occ.tenant_id)
                    if (occ?.id) occupancyIds.push(occ.id)
                })

                if (occupancyIds.length > 0) {
                    for (const occId of occupancyIds) {
                        const { data: familyMembers } = await supabaseAdmin
                            .from('family_members')
                            .select('member_id')
                            .eq('parent_occupancy_id', occId)

                        ;(familyMembers || []).forEach(fm => {
                            if (fm.member_id) allowedTenantIds.add(fm.member_id)
                        })
                    }
                }

                const validMembers = (member_ids || []).filter(id => allowedTenantIds.has(id))
                if (validMembers.length === 0) {
                    return res.status(400).json({ error: 'No valid members to add' })
                }

                const { data: existingMembers, error: existingError } = await supabaseAdmin
                    .from('group_conversation_members')
                    .select('user_id')
                    .eq('group_conversation_id', group_id)

                if (existingError) throw existingError

                const existingSet = new Set((existingMembers || []).map(member => member.user_id))
                const newMembers = validMembers.filter(memberId => !existingSet.has(memberId))

                if (newMembers.length === 0) {
                    return res.status(200).json({ success: true, added: 0, message: 'Selected users are already in this group' })
                }

                const inserts = newMembers.map(memberId => ({
                    group_conversation_id: group_id,
                    user_id: memberId,
                    role: 'member'
                }))

                const { error } = await supabaseAdmin
                    .from('group_conversation_members')
                    .insert(inserts)

                if (error) throw error

                return res.status(200).json({ success: true, added: newMembers.length })
            } catch (err) {
                console.error('Error adding members:', err)
                return res.status(500).json({ error: 'Failed to add members' })
            }
        }

        // Remove member from group
        if (action === 'remove_member') {
            const { group_id, member_id } = req.body

            try {
                // Verify user is admin or removing themselves
                const { data: group } = await supabaseAdmin
                    .from('group_conversations')
                    .select('created_by')
                    .eq('id', group_id)
                    .single()

                if (!group) {
                    return res.status(404).json({ error: 'Group not found' })
                }

                if (group.created_by !== userId && member_id !== userId) {
                    return res.status(403).json({ error: 'Only the group creator can remove members' })
                }

                // Cannot remove the creator
                if (member_id === group.created_by) {
                    return res.status(400).json({ error: 'Cannot remove the group creator' })
                }

                const { error } = await supabaseAdmin
                    .from('group_conversation_members')
                    .delete()
                    .eq('group_conversation_id', group_id)
                    .eq('user_id', member_id)

                if (error) throw error

                return res.status(200).json({ success: true })
            } catch (err) {
                console.error('Error removing member:', err)
                return res.status(500).json({ error: 'Failed to remove member' })
            }
        }

        // Update group name
        if (action === 'update') {
            const { group_id, name } = req.body

            try {
                const { error } = await supabaseAdmin
                    .from('group_conversations')
                    .update({ name: name?.trim() })
                    .eq('id', group_id)
                    .eq('created_by', userId)

                if (error) throw error

                return res.status(200).json({ success: true })
            } catch (err) {
                console.error('Error updating group:', err)
                return res.status(500).json({ error: 'Failed to update group' })
            }
        }

        // Send group message
        if (action === 'send_message') {
            const { group_id, message, files } = req.body

            const trimmedMessage = (message || '').trim()
            const safeFiles = Array.isArray(files) ? files.filter(file => file?.url) : []

            if (!group_id) {
                return res.status(400).json({ error: 'group_id is required' })
            }

            if (!trimmedMessage && safeFiles.length === 0) {
                return res.status(400).json({ error: 'Message or file is required' })
            }

            try {
                // Ensure sender is still a member of the target group.
                const { data: membership, error: membershipError } = await supabaseAdmin
                    .from('group_conversation_members')
                    .select('id')
                    .eq('group_conversation_id', group_id)
                    .eq('user_id', userId)
                    .maybeSingle()

                if (membershipError) throw membershipError
                if (!membership) {
                    return res.status(403).json({ error: 'You are no longer a member of this group' })
                }

                const inserts = safeFiles.length > 0
                    ? safeFiles.map((file, index) => ({
                        group_conversation_id: group_id,
                        sender_id: userId,
                        message: index === 0 ? trimmedMessage : '',
                        file_url: file.url,
                        file_name: file.name || null,
                        file_type: file.type || null,
                        file_size: file.size || null
                    }))
                    : [{
                        group_conversation_id: group_id,
                        sender_id: userId,
                        message: trimmedMessage
                    }]

                const { data: insertedMessages, error: insertError } = await supabaseAdmin
                    .from('group_messages')
                    .insert(inserts)
                    .select('id, group_conversation_id, sender_id, message, file_url, file_name, file_type, file_size, created_at')

                if (insertError) throw insertError

                let senderProfile = null
                const { data: senderData, error: senderError } = await supabaseAdmin
                    .from('profiles')
                    .select('id, first_name, middle_name, last_name, role, avatar_url')
                    .eq('id', userId)
                    .maybeSingle()

                if (!senderError && senderData) {
                    const enrichedSender = await enrichProfilesWithFamilyPrimary([senderData])
                    senderProfile = enrichedSender?.[0] || senderData
                }

                const responseMessages = (insertedMessages || []).map(messageRow => ({
                    ...messageRow,
                    sender: senderProfile
                }))

                await supabaseAdmin
                    .from('group_conversations')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', group_id)

                return res.status(200).json({ success: true, sent: inserts.length, messages: responseMessages })
            } catch (err) {
                console.error('Error sending group message:', err)
                return res.status(500).json({ error: 'Failed to send group message' })
            }
        }

        // Mark messages as read
        if (action === 'mark_read') {
            const { group_id } = req.body

            try {
                // Get all unread messages in this group (not sent by current user)
                const { data: unreadMessages } = await supabaseAdmin
                    .from('group_messages')
                    .select('id')
                    .eq('group_conversation_id', group_id)
                    .neq('sender_id', userId)

                if (!unreadMessages || unreadMessages.length === 0) {
                    return res.status(200).json({ success: true, marked: 0 })
                }

                // Find which ones are already read
                const messageIds = unreadMessages.map(m => m.id)
                const { data: alreadyRead } = await supabaseAdmin
                    .from('group_message_reads')
                    .select('group_message_id')
                    .eq('user_id', userId)
                    .in('group_message_id', messageIds)

                const alreadyReadSet = new Set((alreadyRead || []).map(r => r.group_message_id))
                const toMark = messageIds.filter(id => !alreadyReadSet.has(id))

                if (toMark.length > 0) {
                    const inserts = toMark.map(msgId => ({
                        group_message_id: msgId,
                        user_id: userId
                    }))

                    await supabaseAdmin
                        .from('group_message_reads')
                        .insert(inserts)
                }

                return res.status(200).json({ success: true, marked: toMark.length })
            } catch (err) {
                console.error('Error marking messages as read:', err)
                return res.status(500).json({ error: 'Failed to mark messages as read' })
            }
        }

        return res.status(400).json({ error: 'Invalid action' })
    }

    // ─── DELETE: Delete group conversation ───
    if (req.method === 'DELETE') {
        const { group_id } = req.body

        try {
            const { error } = await supabaseAdmin
                .from('group_conversations')
                .delete()
                .eq('id', group_id)
                .eq('created_by', userId)

            if (error) throw error

            return res.status(200).json({ success: true })
        } catch (err) {
            console.error('Error deleting group:', err)
            return res.status(500).json({ error: 'Failed to delete group' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
