import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import { createNotification } from '../lib/notifications'

export default function BookingsPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState([])
  const [filter, setFilter] = useState('all') // all, pending_approval, approved, rejected

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
      } else {
        router.push('/')
      }
    })
  }, [router])

  useEffect(() => {
    if (session && profile) {
      if (profile.role !== 'landlord') {
        showToast.success("Please Check your Email for Viewing Details", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

        router.push('/dashboard')
        return
      }
      loadBookings()
    }
  }, [session, profile, filter])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    
    if (data) {
      setProfile(data)
    }
    setLoading(false)
  }

  async function loadBookings() {
    setLoading(true)

    // Get landlord's properties
    const { data: myProperties, error: propError } = await supabase
      .from('properties')
      .select('id, title, landlord')
      .eq('landlord', session.user.id)

    if (propError) {
      console.error('Error loading properties:', propError)
    }

    if (!myProperties || myProperties.length === 0) {
      setBookings([])
      setLoading(false)
      return
    }

    const propertyIds = myProperties.map(p => p.id)

    // Build query - get bookings first
    // Include bookings with NULL property_id OR bookings for landlord's properties
    let query = supabase
      .from('bookings')
      .select('*')
      .or(`property_id.in.(${propertyIds.join(',')}),property_id.is.null`)
      .order('booking_date', { ascending: false })

    // Apply filter
    if (filter === 'pending_approval') {
      // Show both 'pending' and 'pending_approval' statuses
      query = query.in('status', ['pending', 'pending_approval'])
    } else if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data: bookingsData, error } = await query

    if (error) {
      console.error('Error loading bookings:', error)
      showToast.error('Failed to load bookings', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      setLoading(false)
      return
    }

    if (!bookingsData || bookingsData.length === 0) {
      setBookings([])
      setLoading(false)
      return
    }

    // Get unique property IDs and tenant IDs from bookings
    const bookingPropertyIds = [...new Set(bookingsData.map(b => b.property_id))]
    const tenantIds = [...new Set(bookingsData.map(b => b.tenant))]

    // Fetch properties
    const { data: properties } = await supabase
      .from('properties')
      .select('id, title, address, city')
      .in('id', bookingPropertyIds)

    // Fetch tenant profiles (no email field in profiles table)
    const { data: tenantProfiles } = await supabase
      .from('profiles')
      .select('id, first_name, middle_name, last_name, phone')
      .in('id', tenantIds)

    // Create lookup maps
    const propertyMap = {}
    properties?.forEach(p => {
      propertyMap[p.id] = p
    })

    const tenantMap = {}
    tenantProfiles?.forEach(t => {
      tenantMap[t.id] = t
    })

    // Enrich bookings with property and tenant data
    const enrichedBookings = bookingsData.map(booking => ({
      ...booking,
      property: propertyMap[booking.property_id],
      tenant_profile: tenantMap[booking.tenant]
    }))

    setBookings(enrichedBookings)
    setLoading(false)
  }

  async function approveBooking(booking) {
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'approved' })
      .eq('id', booking.id)

    if (!error) {
      // Mark the time slot as booked
      if (booking.time_slot_id) {
        await supabase
          .from('available_time_slots')
          .update({ is_booked: true })
          .eq('id', booking.time_slot_id)
      }

      if (booking.tenant_profile?.phone) {
       await sendBookingConfirmation(booking.tenant_profile.phone, {
          propertyName: booking.property?.title || 'Property',
          date: new Date(booking.booking_date).toLocaleDateString(),
          time: new Date(booking.booking_date).toLocaleTimeString(),
          id: booking.id
       });
      }

      // Send notification to tenant
      await createNotification({
        recipient: booking.tenant,
        actor: session.user.id,
        type: 'booking_approved',
        message: `Your viewing request for ${booking.property?.title} on ${new Date(booking.booking_date).toLocaleString()} has been approved!`,
        link: '/bookings'
      })

      // Send email notification to tenant
      try {
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ bookingId: booking.id })
        })

        let result = null
        const contentType = response.headers.get('content-type') || ''

        // Only try to parse JSON if the response looks like JSON
        if (contentType.includes('application/json')) {
          result = await response.json()
        } else {
          const text = await response.text()
          console.error('Non‑JSON response from /api/send-email:', text)
        }

        if (response.ok && result?.success) {
          if (booking.tenant_profile?.phone && booking.tenant_profile?.phone_verified) { // <--- ADD CHECK
   await sendBookingConfirmation(booking.tenant_profile.phone);
}
          showToast.success("Booking approved! Email sent to tenant.", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

        } else {
          console.error('Failed to send email:', result?.error || `HTTP ${response.status}`)
          showToast.success('Booking approved! (Email notification failed)', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError)
        showToast.warning('Booking approved! (Email notification unavailable)', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      }

      loadBookings()
    } else {
      console.error('Error approving booking:', error)
      showToast.error('Failed to approve booking', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
    }
  }

  async function rejectBooking(booking) {
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'rejected' })
      .eq('id', booking.id)

    if (!error) {
      // Unbook the time slot
      if (booking.time_slot_id) {
        await supabase
          .from('available_time_slots')
          .update({ is_booked: false })
          .eq('id', booking.time_slot_id)
      }

      // Send notification to tenant
      await createNotification({
        recipient: booking.tenant,
        actor: session.user.id,
        type: 'booking_rejected',
        message: `Your viewing request for ${booking.property?.title} has been rejected. Please choose another time slot.`,
        link: '/bookings'
      })

      showToast.success('Booking rejected', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      loadBookings()
    } else {
      console.error('Error rejecting booking:', error)
      showToast.error('Failed to reject booking', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
    }
  }

  function getStatusBadge(status) {
    switch (status) {
      case 'pending':
      case 'pending_approval':
        return <span className="px-2.5 py-0.5 bg-yellow-50 text-yellow-700 text-[10px] font-bold uppercase tracking-wide border border-yellow-100 rounded-full">Pending</span>
      case 'approved':
        return <span className="px-2.5 py-0.5 bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wide border border-green-100 rounded-full">Approved</span>
      case 'rejected':
        return <span className="px-2.5 py-0.5 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wide border border-red-100 rounded-full">Rejected</span>
      default:
        return <span className="px-2.5 py-0.5 bg-gray-50 text-gray-600 text-[10px] font-bold uppercase tracking-wide border border-gray-200 rounded-full">{status}</span>
    }
  }

  function getTimeSlotInfo(bookingDate) {
    const date = new Date(bookingDate)
    const hour = date.getHours()

    if (hour === 8) {
      return { emoji: '🌅', label: 'Morning', time: '8:00 AM - 11:00 AM' }
    } else if (hour === 13) {
      return { emoji: '☀️', label: 'Afternoon', time: '1:00 PM - 5:30 PM' }
    } else {
      return { 
        emoji: '⏰', 
        label: 'Custom', 
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-gray-500 font-medium">Loading...</div>
      </div>
    )
  }

  if (!profile || profile.role !== 'landlord') {
    return null
  }

  const pendingCount = bookings.filter(b => b.status === 'pending' || b.status === 'pending_approval').length
  const approvedCount = bookings.filter(b => b.status === 'approved').length
  const rejectedCount = bookings.filter(b => b.status === 'rejected').length

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#FAFAFA] p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Viewing Bookings</h1>
            <p className="text-gray-500 text-sm mt-1">Manage viewing requests from prospective tenants.</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
               <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Pending</span>
               <div className="w-8 h-8 bg-yellow-50 rounded-full flex items-center justify-center text-yellow-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{pendingCount}</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
               <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Approved</span>
               <div className="w-8 h-8 bg-green-50 rounded-full flex items-center justify-center text-green-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{approvedCount}</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
               <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Rejected</span>
               <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center text-red-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
               </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{rejectedCount}</p>
          </div>
        </div>

        {/* Filter Tabs - Large and highlighted */}
        <div className="bg-white border-2 border-black mb-8 p-1.5 rounded-xl inline-flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg cursor-pointer transition-all uppercase tracking-wide ${
              filter === 'all'
                ? 'bg-black text-white'
                : 'bg-transparent text-gray-500'
            }`}
          >
            All ({bookings.length})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg cursor-pointer transition-all uppercase tracking-wide ${
              filter === 'approved'
                ? 'bg-black text-white'
                : 'bg-transparent text-gray-500'
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setFilter('pending_approval')}
            className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg cursor-pointer transition-all uppercase tracking-wide ${
              filter === 'pending_approval'
                ? 'bg-black text-white'
                : 'bg-transparent text-gray-500'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg cursor-pointer transition-all uppercase tracking-wide ${
              filter === 'rejected'
                ? 'bg-black text-white'
                : 'bg-transparent text-gray-500'
            }`}
          >
            Rejected ({rejectedCount})
          </button>
        </div>

        {/* Bookings List */}
        {bookings.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <h3 className="text-gray-900 font-bold mb-1">No bookings found</h3>
            <p className="text-gray-500 text-sm">
              {filter === 'all' && 'No booking requests yet.'}
              {filter === 'pending_approval' && 'No pending viewing requests.'}
              {filter === 'approved' && 'No approved viewings yet.'}
              {filter === 'rejected' && 'No rejected bookings.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const timeInfo = getTimeSlotInfo(booking.booking_date)
              const bookingDate = new Date(booking.booking_date)
              const isPast = bookingDate < new Date()
              
              return (
                <div key={booking.id} className="bg-white border border-gray-100 p-5 md:p-6 rounded-2xl shadow-sm transition-all">
                  <div className="flex flex-col md:flex-row md:items-start gap-6">
                    
                    {/* Main Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{booking.property?.title}</h3>
                        {getStatusBadge(booking.status)}
                      </div>
                      
                      <div className="flex flex-col gap-1 text-sm text-gray-500 mb-4">
                         <div className="flex items-center gap-2">
                           <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                           <span>{booking.property?.address}, {booking.property?.city}</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                           <span className="font-medium text-gray-900">{booking.tenant_profile?.first_name} {booking.tenant_profile?.last_name}</span>
                           {booking.tenant_profile?.phone && <span className="text-gray-400">• {booking.tenant_profile.phone}</span>}
                         </div>
                      </div>

                      {booking.notes && (
                        <div className="bg-gray-50 p-3 rounded-xl text-sm text-gray-600 border border-gray-100 italic">
                          "{booking.notes}"
                        </div>
                      )}
                    </div>
                    
                    {/* Time & Actions */}
                    <div className="flex flex-col md:items-end gap-4 min-w-[200px]">
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-right w-full md:w-auto">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Requested Time</p>
                        <p className="font-bold text-gray-900 text-lg">
                          {bookingDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <div className="flex items-center justify-end gap-2 text-sm text-gray-600">
                           <span>{timeInfo.time}</span>
                           {isPast && <span className="text-red-500 font-bold text-xs bg-red-50 px-1.5 py-0.5 rounded">PAST</span>}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      {(booking.status === 'pending' || booking.status === 'pending_approval') && (
                        <div className="flex gap-2 w-full md:w-auto">
                          <button
                            onClick={() => approveBooking(booking)}
                            className="flex-1 md:flex-none px-4 py-2.5 bg-green-600 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-green-700 transition-colors shadow-sm"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => rejectBooking(booking)}
                            className="flex-1 md:flex-none px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg cursor-pointer hover:bg-gray-50 transition-colors shadow-sm"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}