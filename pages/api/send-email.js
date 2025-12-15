import { sendViewingApprovalEmail } from '../../lib/email'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

export default async function handler(req, res) {
  // Enable CORS for development
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Validate environment variables
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set!')
    return res.status(500).json({ 
      error: 'Server configuration error',
      details: 'SUPABASE_SERVICE_ROLE_KEY environment variable is missing. Please add it to Vercel.'
    })
  }

  if (!process.env.BREVO_API_KEY) {
    console.error('BREVO_API_KEY is not set!')
    return res.status(500).json({ 
      error: 'Server configuration error',
      details: 'BREVO_API_KEY environment variable is missing. Please add it to Vercel.'
    })
  }

  if (!supabaseAdmin) {
    console.error('Supabase admin client is not initialized!')
    return res.status(500).json({ 
      error: 'Server configuration error',
      details: 'Supabase admin client failed to initialize. Check environment variables.'
    })
  }

  try {
    const { bookingId } = req.body

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID is required' })
    }

    // Fetch booking details with related data using admin client (bypasses RLS)
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        property:properties(id, title, address, city),
        tenant_profile:profiles!bookings_tenant_fkey(id, full_name),
        landlord_profile:profiles!bookings_landlord_fkey(id, full_name, phone)
      `)
      .eq('id', bookingId)
      .maybeSingle()

    if (bookingError || !booking) {
      console.error('Error fetching booking:', bookingError)
      return res.status(404).json({ 
        error: 'Booking not found', 
        details: bookingError?.message || 'No booking data returned'
      })
    }

    // Get tenant email from auth.users (works for all auth methods: email, Google, Facebook)
    let tenantEmail = null
    
    // Method 1: Try using admin API (most reliable)
    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(booking.tenant)
      
      if (!userError && userData?.user?.email) {
        tenantEmail = userData.user.email
      }
    } catch (adminError) {
      console.error('Admin API error:', adminError.message)
    }
    
    // Method 2: Try querying auth.users directly (fallback)
    if (!tenantEmail) {
      try {
        const { data: authData } = await supabaseAdmin
          .from('auth.users')
          .select('email')
          .eq('id', booking.tenant)
          .single()
        
        if (authData?.email) {
          tenantEmail = authData.email
        }
      } catch (directError) {
        // Silent fail, try next method
      }
    }
    
    // Method 3: Try RPC function as last resort
    if (!tenantEmail) {
      try {
        const { data: emailData } = await supabaseAdmin
          .rpc('get_user_email', { user_id: booking.tenant })
        
        if (emailData) {
          tenantEmail = emailData
        }
      } catch (rpcException) {
        // Silent fail
      }
    }
    
    if (!tenantEmail) {
      console.error('Failed to retrieve tenant email')
      return res.status(400).json({ 
        error: 'Cannot retrieve tenant email'
      })
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
      to: tenantEmail,
      tenantName: booking.tenant_profile?.full_name || 'Tenant',
      propertyTitle: booking.property?.title || 'Property',
      propertyAddress: `${booking.property?.address || ''}, ${booking.property?.city || ''}`,
      // propertyAddress: `${booking.property?.address || ''}, ${booking.property?.city || ''}`.trim(),
      viewingDate: booking.booking_date,
      timeSlot: timeSlot,
      landlordName: booking.landlord_profile?.full_name || 'Landlord',
      landlordPhone: booking.landlord_profile?.phone || 'Not provided'
    })

    if (!emailResult.success) {
      console.error('Email send failed:', emailResult.error)
      return res.status(500).json({ 
        error: 'Failed to send email'
      })
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully'
    })

  } catch (error) {
    console.error('Error in send-email API:', error)
    console.error('Error stack:', error.stack)
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}
