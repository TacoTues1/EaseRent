import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { sendNotificationEmail } from '../../lib/email'

const ACTIVE_OCCUPANCY_STATUSES = ['active', 'pending_end']

function isIgnorableSchemaError(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    (message.includes('column') && message.includes('does not exist')) ||
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('cannot delete from view') ||
    (message.includes('could not find the table') && message.includes('schema cache'))
  )
}

async function runDelete(queryPromise, label) {
  const { error } = await queryPromise
  if (!error) return
  if (isIgnorableSchemaError(error)) {
    console.warn(`[delete-account] Skipped ${label}: ${error.message}`)
    return
  }
  throw new Error(`Failed to delete ${label}: ${error.message}`)
}

async function deleteByEq(table, column, value) {
  await runDelete(supabaseAdmin.from(table).delete().eq(column, value), `${table}.${column}=${value}`)
}

async function deleteByOr(table, orFilter) {
  await runDelete(supabaseAdmin.from(table).delete().or(orFilter), `${table} OR ${orFilter}`)
}

async function deleteByIn(table, column, values) {
  if (!values || values.length === 0) return
  await runDelete(supabaseAdmin.from(table).delete().in(column, values), `${table}.${column} in list`)
}

async function getAuthenticatedUser(accessToken) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase public client is not configured')
  }

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  const { data, error } = await publicClient.auth.getUser(accessToken)
  if (error || !data?.user) {
    throw new Error('Unauthorized request')
  }

  return data.user
}

async function ensureTenantCanDelete(userId) {
  const { count: activeOccupancyCount, error: activeOccupancyError } = await supabaseAdmin
    .from('tenant_occupancies')
    .select('id', { head: true, count: 'exact' })
    .eq('tenant_id', userId)
    .in('status', ACTIVE_OCCUPANCY_STATUSES)

  if (activeOccupancyError) {
    throw new Error(`Failed checking tenant occupancy: ${activeOccupancyError.message}`)
  }

  if ((activeOccupancyCount || 0) > 0) {
    return {
      allowed: false,
      message: 'You cannot delete your account while you still have an active property occupancy.'
    }
  }

  const { data: familyMemberships, error: familyMembershipError } = await supabaseAdmin
    .from('family_members')
    .select('parent_occupancy_id')
    .eq('member_id', userId)

  if (familyMembershipError) {
    throw new Error(`Failed checking family memberships: ${familyMembershipError.message}`)
  }

  const parentOccupancyIds = [...new Set((familyMemberships || [])
    .map((row) => row.parent_occupancy_id)
    .filter(Boolean))]

  if (parentOccupancyIds.length > 0) {
    const { count: activeFamilyOccupancyCount, error: activeFamilyOccupancyError } = await supabaseAdmin
      .from('tenant_occupancies')
      .select('id', { head: true, count: 'exact' })
      .in('id', parentOccupancyIds)
      .in('status', ACTIVE_OCCUPANCY_STATUSES)

    if (activeFamilyOccupancyError) {
      throw new Error(`Failed checking family occupancy status: ${activeFamilyOccupancyError.message}`)
    }

    if ((activeFamilyOccupancyCount || 0) > 0) {
      return {
        allowed: false,
        message: 'You cannot delete your account while you are still connected to an active tenant property as a family member.'
      }
    }
  }

  return { allowed: true }
}

async function ensureLandlordCanDelete(userId) {
  const { count: activeTenantOccupancyCount, error: activeTenantOccupancyError } = await supabaseAdmin
    .from('tenant_occupancies')
    .select('id', { head: true, count: 'exact' })
    .eq('landlord_id', userId)
    .in('status', ACTIVE_OCCUPANCY_STATUSES)

  if (activeTenantOccupancyError) {
    throw new Error(`Failed checking landlord occupancies: ${activeTenantOccupancyError.message}`)
  }

  if ((activeTenantOccupancyCount || 0) > 0) {
    return {
      allowed: false,
      message: 'You cannot delete your account while your properties still have active tenants.'
    }
  }

  const { count: occupiedPropertyCount, error: occupiedPropertyError } = await supabaseAdmin
    .from('properties')
    .select('id', { head: true, count: 'exact' })
    .eq('landlord', userId)
    .eq('status', 'occupied')

  if (occupiedPropertyError) {
    throw new Error(`Failed checking occupied properties: ${occupiedPropertyError.message}`)
  }

  if ((occupiedPropertyCount || 0) > 0) {
    return {
      allowed: false,
      message: 'You cannot delete your account while you still have rented properties.'
    }
  }

  return { allowed: true }
}

async function cleanupUserData(userId, role) {
  const { data: landlordProperties, error: landlordPropertiesError } = await supabaseAdmin
    .from('properties')
    .select('id')
    .eq('landlord', userId)

  if (landlordPropertiesError) {
    throw new Error(`Failed loading landlord properties: ${landlordPropertiesError.message}`)
  }

  const landlordPropertyIds = (landlordProperties || []).map((property) => property.id)

  if (role === 'landlord' && landlordPropertyIds.length > 0) {
    await deleteByIn('available_time_slots', 'property_id', landlordPropertyIds)
    await deleteByIn('favorites', 'property_id', landlordPropertyIds)
    await deleteByIn('reviews', 'property_id', landlordPropertyIds)
    await deleteByIn('maintenance_requests', 'property_id', landlordPropertyIds)
    await deleteByIn('bookings', 'property_id', landlordPropertyIds)
    await deleteByIn('applications', 'property_id', landlordPropertyIds)
    await deleteByIn('payment_requests', 'property_id', landlordPropertyIds)
    await deleteByIn('payments', 'property_id', landlordPropertyIds)
    await deleteByIn('conversations', 'property_id', landlordPropertyIds)
    await deleteByIn('tenant_occupancies', 'property_id', landlordPropertyIds)
    await deleteByIn('properties', 'id', landlordPropertyIds)
  }

  await deleteByEq('user_login_records', 'user_id', userId)
  await deleteByEq('favorites', 'user_id', userId)
  await deleteByOr('landlord_ratings', `tenant_id.eq.${userId},landlord_id.eq.${userId}`)
  await deleteByOr('reviews', `user_id.eq.${userId},tenant_id.eq.${userId}`)
  await deleteByOr('notifications', `recipient.eq.${userId},actor.eq.${userId}`)
  await deleteByOr('messages', `sender_id.eq.${userId},receiver_id.eq.${userId}`)
  await deleteByOr('conversations', `tenant_id.eq.${userId},landlord_id.eq.${userId}`)
  await deleteByEq('maintenance_requests', 'tenant', userId)
  await deleteByEq('applications', 'tenant', userId)
  await deleteByOr('bookings', `tenant.eq.${userId},landlord.eq.${userId}`)
  await deleteByOr('payment_requests', `tenant.eq.${userId},landlord.eq.${userId}`)
  await deleteByOr('payments', `tenant.eq.${userId},landlord.eq.${userId}`)
  await deleteByOr('tenant_balances', `tenant_id.eq.${userId},landlord_id.eq.${userId}`)
  await deleteByEq('subscription_payments', 'tenant_id', userId)
  await deleteByEq('subscriptions', 'tenant_id', userId)
  await deleteByEq('payouts', 'landlord_id', userId)
  await deleteByOr('family_members', `member_id.eq.${userId},added_by.eq.${userId}`)
  await deleteByOr('tenant_occupancies', `tenant_id.eq.${userId},landlord_id.eq.${userId}`)
}

async function sendDeletionSuccessEmail(to, fullName) {
  if (!to) {
    return { success: false, error: 'No email recipient provided' }
  }

  const displayName = fullName || 'User'
  const subject = 'Your Abalay account has been deleted'
  const message = `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">Account Deletion Successful</h2>
      <p>Hello <strong>${displayName}</strong>,</p>
      <p>Your Abalay account deletion request has been completed successfully.</p>
      <p>All account access has been removed. If you decide to use Abalay again, you will need to register a new account.</p>
      <p style="margin-top: 20px;">Thank you,<br/>Abalay Team</p>
    </div>
  `

  return sendNotificationEmail({ to, subject, message })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client is not configured' })
  }

  try {
    const { accessToken, userId: requestedUserId } = req.body || {}

    if (!accessToken) {
      return res.status(401).json({ error: 'Missing access token' })
    }

    const authUser = await getAuthenticatedUser(accessToken)
    const userId = authUser.id

    if (requestedUserId && requestedUserId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own account' })
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, first_name, middle_name, last_name, email')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      throw new Error(`Failed loading profile: ${profileError.message}`)
    }

    const role = profile?.role || 'tenant'

    if (role === 'tenant') {
      const tenantEligibility = await ensureTenantCanDelete(userId)
      if (!tenantEligibility.allowed) {
        return res.status(409).json({ error: tenantEligibility.message })
      }
    } else if (role === 'landlord') {
      const landlordEligibility = await ensureLandlordCanDelete(userId)
      if (!landlordEligibility.allowed) {
        return res.status(409).json({ error: landlordEligibility.message })
      }
    } else {
      return res.status(403).json({ error: 'Only tenant and landlord accounts can use this deletion flow.' })
    }

    await cleanupUserData(userId, role)

    await runDelete(
      supabaseAdmin
        .from('profiles')
        .update({
          is_deleted: true,
          first_name: null,
          middle_name: null,
          last_name: null,
          phone: null,
          avatar_url: null,
          push_token: null
        })
        .eq('id', userId),
      `profiles soft-delete ${userId}`
    )

    const emailToNotify = profile?.email || authUser.email || null
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteAuthError) {
      throw new Error(`Failed deleting auth user: ${deleteAuthError.message}`)
    }

    await runDelete(
      supabaseAdmin.from('profiles').delete().eq('id', userId),
      `profiles hard-delete ${userId}`
    )

    let emailSent = false
    if (emailToNotify) {
      const emailResult = await sendDeletionSuccessEmail(emailToNotify, fullName)
      emailSent = !!emailResult?.success
      if (!emailSent) {
        console.error('[delete-account] Failed to send deletion success email:', emailResult?.error)
      }
    }

    return res.status(200).json({
      message: 'Account deletion successful',
      emailSent
    })
  } catch (error) {
    console.error('[delete-account] Error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}