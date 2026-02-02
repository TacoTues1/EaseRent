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
  const [filter, setFilter] = useState('all')
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [availableTimeSlots, setAvailableTimeSlots] = useState([])
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('')
  const [bookingNotes, setBookingNotes] = useState('')
  const [submittingBooking, setSubmittingBooking] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [bookingToCancel, setBookingToCancel] = useState(null)

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
    let bookingsData = []

    const userRole = (profile.role || '').toLowerCase();

    if (userRole === 'landlord') {
      const { data: myProperties, error: propError } = await supabase
        .from('properties')
        .select('id, title, landlord')
        .eq('landlord', session.user.id)

      if (propError) console.error('Error loading properties:', propError)

      if (!myProperties || myProperties.length === 0) {
        setBookings([])
        setLoading(false)
        return
      }

      const propertyIds = myProperties.map(p => p.id)

      let query = supabase
        .from('bookings')
        .select('*')
        .in('property_id', propertyIds)
        .order('booking_date', { ascending: false })

      if (filter === 'pending_approval') {
        query = query.in('status', ['pending', 'pending_approval'])
      } else if (filter === 'approved') {
        query = query.in('status', ['approved', 'accepted'])
      } else if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query
      if (error) {
        console.error('Error loading bookings:', error)
      } else {
        bookingsData = data || []
      }

    } else {
      // --- TENANT LOGIC ---

      // 1. Fetch Existing Bookings
      let query = supabase
        .from('bookings')
        .select('*')
        .eq('tenant', session.user.id)
        .order('booking_date', { ascending: false })

      if (filter === 'pending_approval') {
        query = query.in('status', ['pending', 'pending_approval'])
      } else if (filter === 'approved') {
        query = query.in('status', ['approved', 'accepted'])
      } else if (filter !== 'all' && filter !== 'ready_to_book') {
        query = query.eq('status', filter)
      }

      const { data: existingBookings, error } = await query
      if (error) console.error('Error loading bookings:', error)

      bookingsData = existingBookings || []

      // 2. Fetch "Accepted" Applications (Ready to Book)
      if (filter === 'all' || filter === 'approved') {
        // FIX: Remove 'created_at' to avoid 400 Bad Request if column doesn't exist
        const { data: acceptedApps } = await supabase
          .from('applications')
          .select('id, property_id, tenant, status, message')
          .eq('tenant', session.user.id)
          .eq('status', 'accepted')

        if (acceptedApps && acceptedApps.length > 0) {
          const appsToBook = acceptedApps.map(app => ({
            id: app.id,
            is_application: true,
            property_id: app.property_id,
            tenant: app.tenant,
            booking_date: null,
            status: 'ready_to_book',
            notes: app.message
          }))

          bookingsData = [...appsToBook, ...bookingsData]
        }
      }
    }

    if (!bookingsData || bookingsData.length === 0) {
      setBookings([])
      setLoading(false)
      return
    }

    // ENRICHMENT
    const bookingPropertyIds = [...new Set(bookingsData.map(b => b.property_id))]
    const tenantIds = [...new Set(bookingsData.map(b => b.tenant))]

    const { data: properties } = await supabase
      .from('properties')
      .select('id, title, address, city, landlord')
      .in('id', bookingPropertyIds)

    const { data: tenantProfiles } = await supabase
      .from('profiles')
      .select('id, first_name, middle_name, last_name, phone')
      .in('id', tenantIds)

    const propertyMap = {}
    properties?.forEach(p => {
      propertyMap[p.id] = p
    })

    const tenantMap = {}
    tenantProfiles?.forEach(t => {
      tenantMap[t.id] = t
    })

    const enrichedBookings = bookingsData.map(booking => ({
      ...booking,
      property: propertyMap[booking.property_id],
      tenant_profile: tenantMap[booking.tenant]
    }))

    // --- DEDUPLICATION LOGIC ---
    // Only show the single most relevant status per property
    let finalBookings = enrichedBookings;

    // if (userRole !== 'landlord') {
    //   const distinctMap = {};

    //   const getScore = (status) => {
    //     const s = (status || '').toLowerCase();
    //     if (['pending', 'pending_approval', 'approved', 'accepted'].includes(s)) return 3;
    //     if (s === 'ready_to_book') return 2; 
    //     if (['rejected', 'cancelled'].includes(s)) return 1;
    //     return 0;
    //   };

    //   enrichedBookings.forEach(item => {
    //     const pid = item.property_id;
    //     if (!distinctMap[pid]) {
    //        distinctMap[pid] = item;
    //     } else {
    //        const existing = distinctMap[pid];
    //        const scoreNew = getScore(item.status);
    //        const scoreExisting = getScore(existing.status);

    //        if (scoreNew > scoreExisting) {
    //           distinctMap[pid] = item;
    //        } else if (scoreNew === scoreExisting) {
    //           const dateNew = new Date(item.booking_date || 0);
    //           const dateExisting = new Date(existing.booking_date || 0);
    //           if (dateNew > dateExisting) {
    //              distinctMap[pid] = item;
    //           }
    //        }
    //     }
    //   });

    //   finalBookings = Object.values(distinctMap);
    //   finalBookings.sort((a, b) => new Date(b.booking_date || 0) - new Date(a.booking_date || 0));
    // }

    // setBookings(finalBookings)
    // setLoading(false)
    const hasActiveBooking = bookingsData.some(b =>
      ['pending', 'pending_approval', 'approved', 'accepted'].includes(b.status)
    );

    // Helper to get sort weight (Lower number = Higher priority/Top of list)
    const getSortWeight = (booking) => {
      const s = (booking.status || '').toLowerCase();

      // 1. Pending (First)
      if (['pending', 'pending_approval'].includes(s)) return 1;

      // 2. Ready to Book & Limit Reached
      if (s === 'ready_to_book') {
        // If user is tenant and has an active booking elsewhere, this is "Limit Reached"
        if (userRole !== 'landlord' && hasActiveBooking) return 3; // Limit Reached
        return 2; // Ready to Book
      }

      // 4. Approved
      if (['approved', 'accepted'].includes(s)) return 4;

      // 5. Rejected/Cancelled (Last)
      if (['rejected', 'cancelled'].includes(s)) return 5;

      return 6; // Default/Unknown
    };

    if (userRole !== 'landlord') {
      const distinctMap = {};

      // Prioritize status for deduplication (Tenant POV)
      const getDedupeScore = (status) => {
        const s = (status || '').toLowerCase();
        if (['pending', 'pending_approval', 'approved', 'accepted'].includes(s)) return 3;
        if (s === 'ready_to_book') return 2;
        if (['rejected', 'cancelled'].includes(s)) return 1;
        return 0;
      };

      enrichedBookings.forEach(item => {
        const pid = item.property_id;
        if (!distinctMap[pid]) {
          distinctMap[pid] = item;
        } else {
          const existing = distinctMap[pid];
          const scoreNew = getDedupeScore(item.status);
          const scoreExisting = getDedupeScore(existing.status);

          if (scoreNew > scoreExisting) {
            distinctMap[pid] = item;
          } else if (scoreNew === scoreExisting) {
            const dateNew = new Date(item.booking_date || 0);
            const dateExisting = new Date(existing.booking_date || 0);
            if (dateNew > dateExisting) {
              distinctMap[pid] = item;
            }
          }
        }
      });

      finalBookings = Object.values(distinctMap);
    }

    // APPLY CUSTOM SORTING (Ascending: Pending -> Ready -> Limit -> Approved -> Rejected)
    finalBookings.sort((a, b) => {
      const weightA = getSortWeight(a);
      const weightB = getSortWeight(b);

      if (weightA !== weightB) {
        return weightA - weightB;
      }

      // Secondary sort: Date (Newest first) within the same status group
      return new Date(b.booking_date || 0) - new Date(a.booking_date || 0);
    });

    setBookings(finalBookings)
    setLoading(false)
  }

  // --- ACTIONS ---
  async function approveBooking(booking) {
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'approved' })
      .eq('id', booking.id)

    if (!error) {
      if (booking.time_slot_id) {
        await supabase.from('available_time_slots').update({ is_booked: true }).eq('id', booking.time_slot_id)
      }

      await createNotification({
        recipient: booking.tenant,
        actor: session.user.id,
        type: 'booking_approved',
        message: `Your viewing request for ${booking.property?.title} on ${new Date(booking.booking_date).toLocaleString()} has been approved!`,
        link: '/bookings'
      })

      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'booking_status',
          recordId: booking.id,
          actorId: session.user.id
        })
      })

      // Send HTML Email (Keep existing specific email logic if you want)
      try {
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: booking.id })
        })
      } catch (e) { console.error(e) }

      showToast.success("Booking approved!", { duration: 4000, transition: "bounceIn" });
      loadBookings()
    } else {
      showToast.error('Failed to approve booking', { duration: 4000, transition: "bounceIn" });
    }
  }

  async function rejectBooking(booking) {
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'rejected' })
      .eq('id', booking.id)

    if (!error) {
      if (booking.time_slot_id) {
        await supabase.from('available_time_slots').update({ is_booked: false }).eq('id', booking.time_slot_id)
      }

      await createNotification({
        recipient: booking.tenant,
        actor: session.user.id,
        type: 'booking_rejected',
        message: `Your viewing request for ${booking.property?.title} has been rejected.`,
        link: '/bookings'
      })

      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'booking_status',
          recordId: booking.id,
          actorId: session.user.id
        })
      })

      showToast.success('Booking rejected', { duration: 4000, transition: "bounceIn" });
      loadBookings()
    } else {
      showToast.error('Failed to reject booking', { duration: 4000, transition: "bounceIn" });
    }
  }

  function canModifyBooking(bookingDate) {
    if (!bookingDate) return true;
    const now = new Date();
    const booking = new Date(bookingDate);
    const diffInHours = (booking - now) / (1000 * 60 * 60);
    return diffInHours >= 12;
  }

  function promptCancelBooking(booking) {
    setBookingToCancel(booking)
    setShowCancelModal(true)
  }

  // 2. Execute the actual cancellation
  async function confirmCancelBooking() {
    if (!bookingToCancel) return

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingToCancel.id)

    if (!error) {
      if (bookingToCancel.time_slot_id) {
        await supabase.from('available_time_slots').update({ is_booked: false }).eq('id', bookingToCancel.time_slot_id)
      }
      showToast.success('Booking cancelled', { duration: 4000, transition: "bounceIn" });
      loadBookings();
    } else {
      showToast.error('Failed to cancel booking', { duration: 4000, transition: "bounceIn" });
    }

    // Cleanup
    setShowCancelModal(false)
    setBookingToCancel(null)
  }

  // --- MODAL FUNCTIONS ---
  async function openBookingModal(booking) {
    if (!booking.property?.landlord) {
      showToast.error("Cannot schedule: Landlord info missing")
      return
    }

    setSelectedApplication(booking)
    setShowBookingModal(true)
    setBookingNotes('')
    setSelectedTimeSlot('')

    const { data } = await supabase
      .from('available_time_slots')
      .select('*')
      .eq('landlord_id', booking.property.landlord)
      .eq('is_booked', false)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })

    setAvailableTimeSlots(data || [])
  }

  function closeBookingModal() {
    setShowBookingModal(false)
    setSelectedApplication(null)
    setAvailableTimeSlots([])
  }

  async function submitBooking(e) {
    e.preventDefault()
    if (!selectedTimeSlot || !selectedApplication) return

    setSubmittingBooking(true)

    // --- GLOBAL DB CHECK: Strict 1-Booking-Limit ---
    // Check if the tenant has ANY active booking for ANY property
    const { data: globalActive } = await supabase
      .from('bookings')
      .select('id')
      .eq('tenant', session.user.id)
      .in('status', ['pending', 'pending_approval', 'approved', 'accepted'])
      .maybeSingle()

    // If there is ANY active booking in the system:
    if (globalActive) {
      // If we are trying to create a NEW one (even for a different property) -> BLOCK IT
      // Only allow if we are Rescheduling the EXACT SAME booking ID
      if (globalActive.id !== selectedApplication.id) {
        showToast.error("Limit reached: You can only have 1 active viewing schedule at a time.", { duration: 4000, transition: "bounceIn" })
        setSubmittingBooking(false)
        return
      }
    }

    const slot = availableTimeSlots.find(s => s.id === selectedTimeSlot)

    // 1. Create NEW booking
    const { data: newBooking, error } = await supabase.from('bookings').insert({
      property_id: selectedApplication.property_id,
      tenant: session.user.id,
      landlord: selectedApplication.property.landlord,
      start_time: slot.start_time,
      end_time: slot.end_time,
      booking_date: slot.start_time,
      time_slot_id: slot.id,
      status: 'pending',
      notes: bookingNotes || `Booking for ${selectedApplication.property?.title}`
    }).select().single()

    if (error) {
      console.error('Booking Error:', error)
      showToast.error(`Failed to book: ${error.message}`, { duration: 4000, transition: "bounceIn" })
      setSubmittingBooking(false)
      return
    }

    // 2. Mark slot booked
    await supabase.from('available_time_slots').update({ is_booked: true }).eq('id', slot.id)

    // 3. Handle Status Updates
    if (!selectedApplication.is_application) {
      if (selectedApplication.status !== 'rejected' && selectedApplication.status !== 'cancelled') {
        await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', selectedApplication.id)

        if (selectedApplication.time_slot_id) {
          await supabase.from('available_time_slots').update({ is_booked: false }).eq('id', selectedApplication.time_slot_id)
        }
      }
    }

    if (newBooking) {
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'booking_new',
          recordId: newBooking.id,
          actorId: session.user.id
        })
      })
    }
    // 4. Notify Landlord
    await createNotification({
      recipient: selectedApplication.property.landlord,
      actor: session.user.id,
      type: 'new_booking',
      message: `${profile.first_name} requested a viewing for ${selectedApplication.property?.title}.`,
      link: '/bookings'
    })

    showToast.success("Viewing scheduled successfully!", { duration: 4000, transition: "bounceIn" })
    // setSubmittingEndRequest(false)
    setSubmittingBooking(false)
    closeBookingModal()
    loadBookings()
  }

  function getStatusBadge(status, isLimitReached) {
    switch (status) {
      case 'ready_to_book':
        if (isLimitReached) {
          return <span className="px-2.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wide border border-gray-200 rounded-full">Limit Reached</span>
        }
        return <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wide border border-blue-100 rounded-full">Ready to Book</span>
      case 'pending':
      case 'pending_approval':
        return <span className="px-2.5 py-0.5 bg-yellow-50 text-yellow-700 text-[10px] font-bold uppercase tracking-wide border border-yellow-100 rounded-full">Pending</span>
      case 'approved':
      case 'accepted':
        return <span className="px-2.5 py-0.5 bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wide border border-green-100 rounded-full">Approved</span>
      case 'rejected':
      case 'cancelled':
        return <span className="px-2.5 py-0.5 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wide border border-red-100 rounded-full">{status}</span>
      case 'completed':
        return <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide border border-slate-200 rounded-full">Completed</span>
      default:
        return <span className="px-2.5 py-0.5 bg-gray-50 text-gray-600 text-[10px] font-bold uppercase tracking-wide border border-gray-200 rounded-full">{status}</span>
    }
  }

  function getTimeSlotInfo(bookingDate) {
    if (!bookingDate) return { emoji: '📅', label: 'Not Scheduled', time: 'Select a time' }

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
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F5]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-black mb-4"></div>
        <p className="text-gray-500 font-medium">Loading bookings list....</p>
      </div>
    )
  }
if (!profile) return null

  const pendingCount = bookings.filter(b => b.status === 'pending' || b.status === 'pending_approval').length
  const approvedCount = bookings.filter(b => b.status === 'approved' || b.status === 'accepted').length
  const rejectedCount = bookings.filter(b => b.status === 'rejected' || b.status === 'cancelled').length
  const userRoleLower = (profile.role || '').toLowerCase();

  // --- GLOBAL BUTTON STATE ---
  // Check if user has ANY active booking currently displayed
  const hasGlobalActive = bookings.some(b =>
    ['pending', 'pending_approval', 'approved', 'accepted'].includes(b.status)
  )

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#FAFAFA] p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Viewing Bookings</h1>
            <p className="text-gray-500 text-sm mt-1">
              {userRoleLower === 'landlord' ? 'Manage viewing requests from prospective tenants.' : 'Manage your viewing appointments.'}
            </p>
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
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Rejected/Cancelled</span>
              <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center text-red-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{rejectedCount}</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white border-2 border-black mb-8 p-1.5 rounded-xl inline-flex flex-wrap gap-2 w-full md:w-auto">
          {['all', 'approved', 'pending_approval', 'rejected'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg cursor-pointer transition-all uppercase tracking-wide ${filter === f
                ? 'bg-black text-white'
                : 'bg-transparent text-gray-500'
                }`}
            >
              {f === 'pending_approval' ? 'Pending' : f.charAt(0).toUpperCase() + f.slice(1)} ({
                f === 'all' ? bookings.length :
                  f === 'approved' ? approvedCount :
                    f === 'pending_approval' ? pendingCount :
                      rejectedCount
              })
            </button>
          ))}
        </div>

        {/* Bookings List */}
        {bookings.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <h3 className="text-gray-900 font-bold mb-1">No bookings found</h3>
            <p className="text-gray-500 text-sm">No bookings in this category.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const timeInfo = getTimeSlotInfo(booking.booking_date)
              const bookingDate = new Date(booking.booking_date)
              const isPast = booking.booking_date && bookingDate < new Date()
              const statusLower = (booking.status || '').toLowerCase()
              const roleLower = (profile.role || '').toLowerCase()

              return (
                <div key={booking.id} className="bg-white border border-gray-100 p-5 md:p-6 rounded-2xl shadow-sm transition-all">
                  <div className="flex flex-col md:flex-row md:items-start gap-6">

                    {/* Main Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{booking.property?.title}</h3>
                        {getStatusBadge(booking.status, hasGlobalActive)}
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
                      {booking.status === 'ready_to_book' ? (
                        !hasGlobalActive && (
                          <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-right w-full md:w-auto">
                            <p className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-1">Action Required</p>
                            <p className="font-bold text-blue-900 text-sm">Please schedule a viewing time.</p>
                          </div>
                        )
                      ) : (
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
                      )}

                      {/* Landlord Actions */}
                      {roleLower === 'landlord' &&
                        (statusLower === 'pending' || statusLower === 'pending_approval') && (
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

                      {/* TENANT ACTIONS - Hide all buttons for completed status */}
                      {roleLower !== 'landlord' && !isPast && statusLower !== 'completed' && (
                        <div className="flex gap-2 w-full md:w-auto">

                          {/* Case 1: Ready to Book (Accepted Application) */}
                          {booking.status === 'ready_to_book' && (
                            <button
                              onClick={() => !hasGlobalActive && openBookingModal(booking)}
                              disabled={hasGlobalActive}
                              className={`flex-1 md:flex-none px-4 py-2.5 text-xs font-bold rounded-lg transition-colors shadow-sm ${hasGlobalActive
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                : 'bg-black text-white cursor-pointer hover:bg-gray-800'
                                }`}
                            >
                              {hasGlobalActive ? 'Booking Limit Reached' : 'Schedule Viewing'}
                            </button>
                          )}

                          {/* Case 2: Rejected/Cancelled - "Book Again" */}
                          {['rejected', 'cancelled'].includes(statusLower) && (
                            <button
                              onClick={() => !hasGlobalActive && openBookingModal(booking)}
                              disabled={hasGlobalActive}
                              className={`flex-1 md:flex-none px-4 py-2.5 text-xs font-bold rounded-lg transition-colors shadow-sm ${hasGlobalActive
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                : 'bg-black text-white cursor-pointer hover:bg-gray-800'
                                }`}
                            >
                              {hasGlobalActive ? 'Booking Limit Reached' : 'Book Again'}
                            </button>
                          )}

                          {/* Case 3: Pending/Approved - "Reschedule" (with 12h rule) */}
                          {['pending', 'pending_approval', 'approved', 'accepted', ''].includes(statusLower) && (
                            canModifyBooking(bookingDate) ? (
                              <>
                                {['pending', 'pending_approval'].includes(statusLower) && (
                                  <button
                                    onClick={() => openBookingModal(booking)}
                                    className="flex-1 md:flex-none px-4 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-blue-700 transition-colors shadow-sm"
                                  >
                                    Reschedule
                                  </button>
                                )}
                                {['pending', 'pending_approval'].includes(statusLower) && (
                                  <button
                                    onClick={() => promptCancelBooking(booking)}
                                    className="flex-1 md:flex-none px-4 py-2.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg cursor-pointer hover:bg-red-50 transition-colors shadow-sm"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] text-red-500 font-medium bg-red-50 px-2 py-1 rounded border border-red-100">
                                Cannot modify (within 12h)
                              </span>
                            )
                          )}
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
      {/* --- CANCEL CONFIRMATION MODAL --- */}
      {showCancelModal && bookingToCancel && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6 text-center">

            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Viewing?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Are you sure you want to cancel your viewing for <span className="font-semibold text-gray-900">{bookingToCancel.property?.title}</span>? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Keep it
              </button>
              <button
                onClick={confirmCancelBooking}
                className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-100 cursor-pointer"
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- BOOKING MODAL --- */}
      {showBookingModal && selectedApplication && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Schedule Viewing</h3>
              <button
                onClick={closeBookingModal}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 text-gray-500 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <p className="font-bold text-gray-900 text-sm">{selectedApplication.property?.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{selectedApplication.property?.address}</p>
            </div>

            <form onSubmit={submitBooking} className="space-y-5">
              {availableTimeSlots.length > 0 ? (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                    Available Time Slots
                  </label>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                    {availableTimeSlots.map((slot) => {
                      const startTime = new Date(slot.start_time)

                      return (
                        <label
                          key={slot.id}
                          className={`block p-3 border rounded-xl cursor-pointer transition-all ${selectedTimeSlot === slot.id
                            ? 'border-black bg-black text-white shadow-md'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                        >
                          <input
                            type="radio"
                            name="timeSlot"
                            value={slot.id}
                            checked={selectedTimeSlot === slot.id}
                            onChange={(e) => setSelectedTimeSlot(e.target.value)}
                            className="hidden"
                            required
                          />
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${selectedTimeSlot === slot.id ? 'border-white bg-white' : 'border-gray-300'
                              }`}>
                              {selectedTimeSlot === slot.id && <div className="w-2 h-2 rounded-full bg-black"></div>}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-bold">
                                {startTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </div>
                              <div className={`text-xs ${selectedTimeSlot === slot.id ? 'text-gray-300' : 'text-gray-500'}`}>
                                {startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - {new Date(slot.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl text-center">
                  <p className="text-sm text-gray-500">
                    No time slots available. Please contact the landlord directly.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Notes
                </label>
                <textarea
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  rows={3}
                  placeholder="Any questions or specific requests?"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-black outline-none transition-colors resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submittingBooking || availableTimeSlots.length === 0}
                  className="w-full py-3.5 bg-black text-white font-bold rounded-xl cursor-pointer hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-gray-200"
                >
                  {submittingBooking ? 'Sending Request...' : 'Request Viewing'}
                </button>
                <span className="ml-2 inline-block text-sm">Note: You can't cancel the booking once approved.</span>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}