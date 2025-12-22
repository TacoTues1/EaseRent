import { supabaseAdmin } from '../../lib/supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ success: false, error: 'Supabase admin client not configured' })
  }

  const { bookingId } = req.body || {}

  if (!bookingId) {
    return res.status(400).json({ success: false, error: 'bookingId is required' })
  }

  try {
    // Pull the booking record
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('id, tenant, landlord, property_id, booking_date')
      .eq('id', bookingId)
      .maybeSingle()

    if (bookingError) {
      console.error('Booking lookup failed:', bookingError)
      return res.status(500).json({ success: false, error: 'Failed to load booking' })
    }

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' })
    }

    // Fetch related data in parallel
    const [
      { data: tenantProfile, error: tenantErr },
      { data: landlordProfile, error: landlordErr },
      { data: property, error: propertyErr },
      { data: tenantEmail, error: emailErr }
    ] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('first_name, last_name, phone')
        .eq('id', booking.tenant)
        .maybeSingle(),
      supabaseAdmin
        .from('profiles')
        .select('first_name, last_name, phone')
        .eq('id', booking.landlord)
        .maybeSingle(),
      supabaseAdmin
        .from('properties')
        .select('title, address, city, street')
        .eq('id', booking.property_id)
        .maybeSingle(),
      supabaseAdmin.rpc('get_user_email', { user_id: booking.tenant })
    ])

    if (tenantErr || landlordErr || propertyErr || emailErr) {
      console.error('Data fetch error', { tenantErr, landlordErr, propertyErr, emailErr })
      return res.status(500).json({ success: false, error: 'Failed to load booking details' })
    }

    if (!tenantEmail) {
      return res.status(400).json({ success: false, error: 'Tenant email not found' })
    }

    const timeSlotLabel = (() => {
      const date = new Date(booking.booking_date)
      const hour = date.getHours()
      if (hour === 8) return 'Morning (8:00 AM - 11:00 AM)'
      if (hour === 13) return 'Afternoon (1:00 PM - 5:30 PM)'
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    })()

    const tenantName = [tenantProfile?.first_name, tenantProfile?.last_name].filter(Boolean).join(' ') || 'Tenant'
    const landlordName = [landlordProfile?.first_name, landlordProfile?.last_name].filter(Boolean).join(' ') || 'Landlord'
    const landlordPhone = landlordProfile?.phone || 'N/A'
    const propertyTitle = property?.title || 'Property'
    const propertyAddress = [property?.street, property?.address, property?.city].filter(Boolean).join(', ')

    // Lazy import to avoid bundling issues during build
    const { sendViewingApprovalEmail } = await import('../../lib/email')
    const emailResult = await sendViewingApprovalEmail({
      to: tenantEmail,
      tenantName,
      propertyTitle,
      propertyAddress,
      viewingDate: booking.booking_date,
      timeSlot: timeSlotLabel,
      landlordName,
      landlordPhone
    })

    if (!emailResult?.success) {
      return res.status(500).json({
        success: false,
        error: emailResult?.error || 'Email send failed'
      })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Unhandled send-email error:', err)
    return res.status(500).json({ success: false, error: 'Unexpected server error' })
  }
}

