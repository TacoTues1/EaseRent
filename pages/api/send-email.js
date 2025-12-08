import { sendViewingApprovalEmail } from '../../lib/email'
import { supabase } from '../../lib/supabaseClient'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { bookingId } = req.body

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID is required' })
    }

    // Fetch booking details with related data
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        property:properties(id, title, address, city),
        tenant_profile:profiles!bookings_tenant_fkey(id, full_name, email),
        landlord_profile:profiles!bookings_landlord_fkey(id, full_name, phone)
      `)
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      console.error('Error fetching booking:', bookingError)
      return res.status(404).json({ error: 'Booking not found' })
    }

    // Check if tenant has an email
    if (!booking.tenant_profile?.email) {
      return res.status(400).json({ error: 'Tenant email not found' })
    }

    // Determine time slot info
    const viewingDate = new Date(booking.booking_date)
    const hour = viewingDate.getHours()
    let timeSlot = 'Custom Time'
    
    if (hour === 8) {
      timeSlot = 'Morning (8:00 AM - 11:00 AM)'
    } else if (hour === 13) {
      timeSlot = 'Afternoon (1:00 PM - 5:30 PM)'
    }

    // Send email
    const emailResult = await sendViewingApprovalEmail({
      to: booking.tenant_profile.email,
      tenantName: booking.tenant_profile.full_name || 'Tenant',
      propertyTitle: booking.property?.title || 'Property',
      propertyAddress: `${booking.property?.address || ''}, ${booking.property?.city || ''}`.trim(),
      viewingDate: booking.booking_date,
      timeSlot: timeSlot,
      landlordName: booking.landlord_profile?.full_name || 'Landlord',
      landlordPhone: booking.landlord_profile?.phone || 'Not provided'
    })

    if (!emailResult.success) {
      console.error('Failed to send email:', emailResult.error)
      return res.status(500).json({ 
        error: 'Failed to send email', 
        details: emailResult.error 
      })
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully',
      data: emailResult.data
    })

  } catch (error) {
    console.error('Error in send-email API:', error)
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    })
  }
}
