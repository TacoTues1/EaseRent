import { supabaseAdmin } from '../../lib/supabaseAdmin'

const PHILIPPINE_TIME_ZONE = 'Asia/Manila'
const HAS_EXPLICIT_TZ_REGEX = /(?:[zZ]|[+\-]\d{2}:?\d{2})$/
const LOCAL_DATETIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

function parseDateInPhilippineTime(value) {
  if (value === null || value === undefined || value === '') return null

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
      return new Date(utcMillis)
    }
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatPhilippineTime(dateLike) {
  const parsed = parseDateInPhilippineTime(dateLike)
  if (!parsed) return ''

  return new Intl.DateTimeFormat('en-US', {
    timeZone: PHILIPPINE_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit'
  }).format(parsed)
}

function buildViewingTimeSlotLabel(startValue, endValue) {
  const startLabel = formatPhilippineTime(startValue)
  if (!startLabel) return 'Not specified'

  const endLabel = formatPhilippineTime(endValue)
  return endLabel ? `${startLabel} - ${endLabel}` : startLabel
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ success: false, error: 'Supabase admin client not configured' })
  }

  // Accept occupancyId for end-contract actions
  const { bookingId, occupancyId, type, customMessage } = req.body || {}

  try {
    // =========================================================
    // SCENARIO A: END CONTRACT (Uses occupancyId)
    // =========================================================
    if (type === 'end_contract' && occupancyId) {
      // 1. Fetch Occupancy Details
      const { data: occupancy, error: occError } = await supabaseAdmin
        .from('tenant_occupancies')
        .select('*, tenant:profiles!tenant_occupancies_tenant_id_fkey(*), property:properties(*)')
        .eq('id', occupancyId)
        .single()

      if (occError || !occupancy) {
        return res.status(404).json({ success: false, error: 'Occupancy not found' })
      }

      // 2. Get Tenant Email
      const { data: tenantEmail } = await supabaseAdmin.rpc('get_user_email', { user_id: occupancy.tenant_id })

      if (!tenantEmail) {
        return res.status(400).json({ success: false, error: 'Tenant email not found' })
      }

      // 3. Send Email to Primary Tenant
      const emailLib = await import('../../lib/email')
      if (emailLib.sendEndContractEmail) {
        const resolvedEndDate = occupancy.end_request_date || occupancy.end_date || occupancy.contract_end_date || new Date()

        const result = await emailLib.sendEndContractEmail({
          to: tenantEmail,
          tenantName: occupancy.tenant?.first_name || 'Tenant',
          propertyTitle: occupancy.property?.title || 'Property',
          endDate: resolvedEndDate,
          customMessage: customMessage
        })

        if (!result.success) throw new Error(result.error)

        // 4. Also send email to all family members
        try {
          const { data: familyMembers } = await supabaseAdmin
            .from('family_members')
            .select('member_id, member_profile:profiles!family_members_member_id_fkey(first_name, last_name)')
            .eq('parent_occupancy_id', occupancyId)

          if (familyMembers && familyMembers.length > 0) {
            console.log(`[End Contract] Sending email to ${familyMembers.length} family member(s)`)

            for (const fm of familyMembers) {
              try {
                const { data: fmEmail } = await supabaseAdmin.rpc('get_user_email', { user_id: fm.member_id })

                if (fmEmail) {
                  await emailLib.sendEndContractEmail({
                    to: fmEmail,
                    tenantName: fm.member_profile?.first_name || 'Family Member',
                    propertyTitle: occupancy.property?.title || 'Property',
                    endDate: resolvedEndDate,
                    customMessage: customMessage
                  })
                  console.log(`[End Contract] ✅ Email sent to family member: ${fm.member_profile?.first_name} (${fmEmail})`)
                }
              } catch (fmErr) {
                console.error(`[End Contract] ❌ Failed to email family member ${fm.member_id}:`, fmErr)
              }
            }
          }
        } catch (fmFetchErr) {
          console.error('[End Contract] Error fetching family members:', fmFetchErr)
        }

        return res.status(200).json({ success: true })
      }
    }

    // =========================================================
    // SCENARIO B: ASSIGNMENT / VIEWING (Uses bookingId)
    // =========================================================
    if (bookingId) {
      const { data: booking, error: bookingError } = await supabaseAdmin
        .from('bookings')
        .select('id, tenant, landlord, property_id, booking_date, start_time, end_time')
        .eq('id', bookingId)
        .maybeSingle()

      if (bookingError || !booking) {
        return res.status(404).json({ success: false, error: 'Booking not found' })
      }

      const [
        { data: tenantProfile },
        { data: landlordProfile },
        { data: property },
        { data: tenantEmail }
      ] = await Promise.all([
        supabaseAdmin.from('profiles').select('first_name, last_name, phone').eq('id', booking.tenant).maybeSingle(),
        supabaseAdmin.from('profiles').select('first_name, last_name, phone').eq('id', booking.landlord).maybeSingle(),
        supabaseAdmin.from('properties').select('title, address, city, street').eq('id', booking.property_id).maybeSingle(),
        supabaseAdmin.rpc('get_user_email', { user_id: booking.tenant })
      ])

      if (!tenantEmail) return res.status(400).json({ success: false, error: 'Tenant email not found' })

      const tenantName = tenantProfile?.first_name || 'Tenant'
      const landlordName = landlordProfile?.first_name || 'Landlord'
      const landlordPhone = landlordProfile?.phone || 'N/A'
      const propertyTitle = property?.title || 'Property'
      const propertyAddress = [property?.street, property?.address, property?.city].filter(Boolean).join(', ')

      // TYPE: ASSIGNMENT
      if (type === 'assignment') {
        const emailLib = await import('../../lib/email')
        if (emailLib.sendTenantAssignmentEmail) {
          const result = await emailLib.sendTenantAssignmentEmail({
            to: tenantEmail,
            tenantName,
            propertyTitle,
            propertyAddress,
            landlordName,
            landlordPhone,
            customMessage: customMessage || 'You have been assigned to this property.'
          })
          if (!result.success) throw new Error(result.error)
          return res.status(200).json({ success: true })
        }
      }

      // TYPE: VIEWING APPROVAL (Default)
      const scheduleStart = booking.start_time || booking.booking_date
      const timeSlotLabel = buildViewingTimeSlotLabel(scheduleStart, booking.end_time)
      const { sendViewingApprovalEmail } = await import('../../lib/email')
      const result = await sendViewingApprovalEmail({
        to: tenantEmail,
        tenantName,
        propertyTitle,
        propertyAddress,
        viewingDate: scheduleStart,
        timeSlot: timeSlotLabel,
        landlordName,
        landlordPhone
      })

      if (!result.success) throw new Error(result.error)
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ success: false, error: 'Missing bookingId or occupancyId' })

  } catch (err) {
    console.error('Email API Error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
