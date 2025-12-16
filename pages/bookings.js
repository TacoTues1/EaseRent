import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast, { Toaster } from 'react-hot-toast'
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
        toast.success('Please Check your Email for Viewing Details')
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
      .order('booking_date', { ascending: true })

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
      toast.error('Failed to load bookings')
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

        const result = await response.json()
        
        if (result.success) {
          toast.success('Booking approved! Email sent to tenant.')
        } else {
          console.error('Failed to send email:', result.error)
          toast.success('Booking approved! (Email notification failed)')
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError)
        toast.success('Booking approved! (Email notification unavailable)')
      }

      loadBookings()
    } else {
      console.error('Error approving booking:', error)
      toast.error('Failed to approve booking')
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

      toast.success('Booking rejected')
      loadBookings()
    } else {
      console.error('Error rejecting booking:', error)
      toast.error('Failed to reject booking')
    }
  }

  function getStatusBadge(status) {
    switch (status) {
      case 'pending':
      case 'pending_approval':
        return <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold">Pending</span>
      case 'approved':
        return <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold">Approved</span>
      case 'rejected':
        return <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-semibold">Rejected</span>
      default:
        return <span className="px-3 py-1 bg-gray-100 text-gray-800 text-xs font-semibold">{status}</span>
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
      <div className="min-h-screen bg-white">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
            <p className="mt-4 text-black">Loading...</p>
          </div>
        </div>
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
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-black mb-2">Viewing Bookings</h1>
          <p className="text-sm sm:text-base text-black">Manage property viewing requests from tenants</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border-2 border-black p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-black mb-1">Pending Requests</p>
                <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-black p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-black mb-1">Approved</p>
                <p className="text-3xl font-bold text-green-600">{approvedCount}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-black p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-black mb-1">Rejected</p>
                <p className="text-3xl font-bold text-red-600">{rejectedCount}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 font-medium text-sm cursor-pointer rounded-full ${
              filter === 'all'
                ? 'bg-black text-white'
                : 'bg-white text-black border-2 border-black'
            }`}
          >
            All ({bookings.length})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-4 py-2 font-medium text-sm cursor-pointer rounded-full ${
              filter === 'approved'
                ? 'bg-black text-white'
                : 'bg-white text-black border-2 border-black'
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setFilter('pending_approval')}
            className={`px-4 py-2 font-medium text-sm cursor-pointer rounded-full ${
              filter === 'pending_approval'
                ? 'bg-black text-white'
                : 'bg-white text-black border-2 border-black'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-4 py-2 font-medium text-sm cursor-pointer rounded-full ${
              filter === 'rejected'
                ? 'bg-black text-white'
                : 'bg-white text-black border-2 border-black'
            }`}
          >
            Rejected ({rejectedCount})
          </button>
        </div>

        {/* Bookings List */}
        {bookings.length === 0 ? (
          <div className="text-center py-12 bg-white ">
            <svg className="w-16 h-16 text-black mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-bold text-black mb-2">No {filter !== 'all' ? filter : ''} bookings found</h3>
            <p className="text-black">
              {filter === 'all' && 'No booking requests yet'}
              {filter === 'pending' && 'No pending viewing requests at the moment'}
              {filter === 'approved' && 'No approved viewings yet'}
              {filter === 'rejected' && 'No rejected bookings'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
            {bookings.map((booking) => {
              const timeInfo = getTimeSlotInfo(booking.booking_date)
              const bookingDate = new Date(booking.booking_date)
              const isPast = bookingDate < new Date()
              
              return (
                <div key={booking.id} className="bg-white p-4 hover:bg-gray-50 transition-colors">
                  {/* Main row */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      booking.status === 'approved' ? 'bg-green-500' :
                      booking.status === 'rejected' ? 'bg-red-500' :
                      'bg-yellow-500'
                    }`}></div>
                    
                    {/* Property & Tenant info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-black truncate">{booking.property?.title}</span>
                        {getStatusBadge(booking.status)}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {booking.tenant_profile?.first_name} {booking.tenant_profile?.last_name}
                        </span>
                        {booking.tenant_profile?.phone && (
                          <span className="text-xs">{booking.tenant_profile.phone}</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Date & Time */}
                    <div className="flex items-center gap-3 text-sm flex-shrink-0">
                      <div className="text-right">
                        <p className="font-medium text-black">
                          {bookingDate.toLocaleDateString('en-US', { 
                            weekday: 'short',
                            month: 'short', 
                            day: 'numeric'
                          })}
                        </p>
                        <p className="text-xs text-gray-500">{timeInfo.time}</p>
                      </div>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                        timeInfo.label === 'Morning' ? 'bg-yellow-100 text-yellow-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {timeInfo.label}
                      </span>
                      {isPast && (
                        <span className="text-xs text-red-600 font-medium">Past</span>
                      )}
                    </div>
                    
                    {/* Action Buttons */}
                    {(booking.status === 'pending' || booking.status === 'pending_approval') && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => approveBooking(booking)}
                          className="p-2 text-green-600 hover:bg-green-100 rounded transition-colors cursor-pointer"
                          title="Approve"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => rejectBooking(booking)}
                          className="p-2 text-red-600 hover:bg-red-100 rounded transition-colors cursor-pointer"
                          title="Reject"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Notes (if any) */}
                  {booking.notes && (
                    <div className="mt-2 ml-5 pl-3 border-l-2 border-gray-200">
                      <p className="text-xs text-gray-500 italic">"{booking.notes}"</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
