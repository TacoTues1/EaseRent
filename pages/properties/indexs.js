import { supabaseAdmin } from '../../lib/supabaseAdmin'

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

      // 3. Send Email
      const emailLib = await import('../../lib/email')
      if (emailLib.sendEndContractEmail) {
        const result = await emailLib.sendEndContractEmail({
          to: tenantEmail,
          tenantName: occupancy.tenant?.first_name || 'Tenant',
          propertyTitle: occupancy.property?.title || 'Property',
          endDate: new Date(),
          customMessage: customMessage
        })
        
        if (!result.success) throw new Error(result.error)
        return res.status(200).json({ success: true })
      }
    }

    // =========================================================
    // SCENARIO B: ASSIGNMENT / VIEWING (Uses bookingId)
    // =========================================================
    if (bookingId) {
      const { data: booking, error: bookingError } = await supabaseAdmin
        .from('bookings')
        .select('id, tenant, landlord, property_id, booking_date')
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
      const timeSlotLabel = (() => {
      const date = new Date(booking.booking_date)
      const hour = date.getHours()
      if (hour === 8) return 'Morning (8:00 AM - 11:00 AM)'
      if (hour === 13) return 'Afternoon (1:00 PM - 5:30 PM)'
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    })()
      const { sendViewingApprovalEmail } = await import('../../lib/email')
      const result = await sendViewingApprovalEmail({
        to: tenantEmail,
        tenantName,
        propertyTitle,
        propertyAddress,
        viewingDate: booking.booking_date,
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