import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import { createNotification } from '../lib/notifications'
import Lottie from "lottie-react"
import loadingAnimation from "../assets/loading.json"

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

  // Assign Tenant Modal States
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignBooking, setAssignBooking] = useState(null)
  const [availableProperties, setAvailableProperties] = useState([])
  const [selectedPropertyId, setSelectedPropertyId] = useState('')
  const [penaltyDetails, setPenaltyDetails] = useState('')
  const [startDate, setStartDate] = useState('')
  const [contractMonths, setContractMonths] = useState(12)
  const [endDate, setEndDate] = useState('')
  const [wifiDueDay, setWifiDueDay] = useState('')
  const [showWifiDayPicker, setShowWifiDayPicker] = useState(false)
  const [contractFile, setContractFile] = useState(null)
  const [uploadingContract, setUploadingContract] = useState(false)
  const [showAssignWarning, setShowAssignWarning] = useState(false)

  // Auto-calculate contract end date
  useEffect(() => {
    if (startDate && contractMonths) {
      const start = new Date(startDate)
      start.setMonth(start.getMonth() + parseInt(contractMonths))
      setEndDate(start.toISOString().split('T')[0])
    }
  }, [startDate, contractMonths])

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
      .select('id, first_name, middle_name, last_name, phone, avatar_url')
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

    let finalBookings = enrichedBookings;

    const hasActiveBooking = bookingsData.some(b =>
      ['pending', 'pending_approval', 'approved', 'accepted'].includes(b.status)
    );

    const getSortWeight = (booking) => {
      const s = (booking.status || '').toLowerCase();

      // 0. Viewing Success (Top Priority)
      if (s === 'viewing_done') return 0;

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

  // Auto-calculate end date
  useEffect(() => {
    if (startDate && contractMonths) {
      const start = new Date(startDate)
      start.setMonth(start.getMonth() + parseInt(contractMonths))
      setEndDate(start.toISOString().split('T')[0])
    }
  }, [startDate, contractMonths])

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
        message: `Your viewing request for ${booking.property?.title} on ${new Date(booking.booking_date).toLocaleString('en-US')} has been approved!`,
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

      try {
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: booking.id })
        })
      } catch (e) { console.error(e) }

      showToast.success("Booking approved!",
        {
          duration: 4000,
          position: "top-center",
          transition: "bounceIn"
        });
      loadBookings()
    } else {
      showToast.error('Failed to approve booking', { duration: 4000, position: "top-center", transition: "bounceIn" });
    }
  }

  async function markViewingSuccess(booking) {
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'viewing_done' })
      .eq('id', booking.id)

    if (!error) {
      await createNotification({
        recipient: booking.tenant,
        actor: session.user.id,
        type: 'viewing_success',
        message: `Your viewing for ${booking.property?.title} was marked as successful! The landlord may assign you to a property soon.`,
        link: '/bookings'
      })
      showToast.success("Viewing marked as successful!", { duration: 4000, position: "top-center", transition: "bounceIn" });
      loadBookings()
    } else {
      showToast.error('Failed to update booking', { duration: 4000, position: "top-center", transition: "bounceIn" });
    }
  }

  async function cancelViewing(booking) {
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', booking.id)

    if (!error) {
      if (booking.time_slot_id) {
        await supabase.from('available_time_slots').update({ is_booked: false }).eq('id', booking.time_slot_id)
      }
      await createNotification({
        recipient: booking.tenant,
        actor: session.user.id,
        type: 'booking_cancelled',
        message: `Your viewing for ${booking.property?.title} has been cancelled by the landlord.`,
        link: '/bookings'
      })
      showToast.success('Viewing cancelled', { duration: 4000, position: "top-center", transition: "bounceIn" });
      loadBookings()
    } else {
      showToast.error('Failed to cancel viewing', { duration: 4000, position: "top-center", transition: "bounceIn" });
    }
  }

  // --- ASSIGN TENANT FUNCTIONS ---
  async function openAssignTenantModal(booking) {
    setAssignBooking(booking)
    setPenaltyDetails('')
    setStartDate(new Date().toISOString().split('T')[0])
    setContractMonths(12)
    setWifiDueDay('')
    setContractFile(null)
    setSelectedPropertyId('')
    setShowAssignWarning(false)
    setShowWifiDayPicker(false)

    // Load available properties for this landlord
    const { data: props } = await supabase
      .from('properties')
      .select('id, title, price, status')
      .eq('landlord', session.user.id)
      .eq('status', 'available')
      .eq('is_deleted', false)

    let properties = props || []

    // Sort: Booked property first
    if (booking.property_id) {
      properties.sort((a, b) => {
        if (a.id === booking.property_id) return -1;
        if (b.id === booking.property_id) return 1;
        return 0;
      });
    }

    setAvailableProperties(properties)
    setShowAssignModal(true)
  }

  async function confirmAssignTenant() {
    if (!assignBooking) return
    if (!selectedPropertyId) {
      showToast.error('Please select a property', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (!startDate) {
      showToast.error('Please select a start date', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (!endDate) {
      showToast.error('Please select a contract end date', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (!contractMonths || parseInt(contractMonths) < 3) {
      showToast.error('Minimum contract duration is 3 months', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (!wifiDueDay || parseInt(wifiDueDay) <= 0 || parseInt(wifiDueDay) > 31) {
      showToast.error('Please enter a valid Wifi Due Day (1-31)', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (!penaltyDetails || parseFloat(penaltyDetails) <= 0) {
      showToast.error('Please enter a Late Payment Fee', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (!contractFile) {
      showToast.error('Please upload a contract PDF file', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }

    if (!showAssignWarning) {
      setShowAssignWarning(true)
      return
    }

    const selectedProp = availableProperties.find(p => p.id === selectedPropertyId)
    if (!selectedProp) return

    const securityDepositAmount = selectedProp.price || 0

    setUploadingContract(true)
    let contractUrl = null
    try {
      const fileExt = contractFile.name.split('.').pop()
      const fileName = `${selectedPropertyId}_${assignBooking.tenant}_${Date.now()}.${fileExt}`
      const filePath = `contracts/${fileName}`
      const { error: uploadError } = await supabase.storage.from('contracts').upload(filePath, contractFile, { cacheControl: '3600', upsert: false })
      if (uploadError) {
        showToast.error('Failed to upload contract.', { duration: 4000, position: "top-center", transition: "bounceIn" })
        setUploadingContract(false); return
      }
      const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(filePath)
      contractUrl = urlData?.publicUrl
    } catch (err) {
      showToast.error('Failed to upload contract.', { duration: 4000, position: "top-center", transition: "bounceIn" })
      setUploadingContract(false); return
    }
    setUploadingContract(false)

    const { data: newOccupancy, error } = await supabase.from('tenant_occupancies').insert({
      property_id: selectedPropertyId,
      tenant_id: assignBooking.tenant,
      landlord_id: session.user.id,
      status: 'active',
      start_date: new Date(startDate).toISOString(),
      contract_end_date: endDate,
      security_deposit: securityDepositAmount,
      security_deposit_used: 0,
      wifi_due_day: wifiDueDay ? parseInt(wifiDueDay) : null,
      late_payment_fee: penaltyDetails ? parseFloat(penaltyDetails) : 0,
      contract_url: contractUrl
    }).select('id').single()

    if (error) {
      showToast.error('Failed to assign tenant.', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }

    const occupancyId = newOccupancy?.id
    await supabase.from('properties').update({ status: 'occupied' }).eq('id', selectedPropertyId)
    await supabase.from('bookings').update({ status: 'completed' }).eq('id', assignBooking.id)

    const rentAmount = selectedProp.price || 0
    const advanceAmount = selectedProp.price || 0
    let message = `You have been assigned to occupy "${selectedProp.title}" from ${new Date(startDate).toLocaleDateString('en-US')} to ${new Date(endDate).toLocaleDateString('en-US')}. Security deposit: ₱${Number(securityDepositAmount).toLocaleString()}.`
    if (penaltyDetails && parseFloat(penaltyDetails) > 0) message += ` Late payment fee: ₱${Number(penaltyDetails).toLocaleString()}`

    await createNotification({ recipient: assignBooking.tenant, actor: session.user.id, type: 'occupancy_assigned', message, link: '/maintenance' })

    if (assignBooking.tenant_profile?.phone) {
      fetch('/api/send-sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: assignBooking.tenant_profile.phone, message }) }).catch(err => console.error('SMS Error:', err))
    }
    fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: assignBooking.id, type: 'assignment', customMessage: message }) }).catch(err => console.error('Email Error:', err))

    const dueDate = new Date(startDate)
    try {
      const { error: billError } = await supabase.from('payment_requests').insert({
        landlord: session.user.id, tenant: assignBooking.tenant, property_id: selectedPropertyId, occupancy_id: occupancyId,
        rent_amount: rentAmount, security_deposit_amount: securityDepositAmount, advance_amount: advanceAmount,
        water_bill: 0, electrical_bill: 0, other_bills: 0,
        bills_description: 'Move-in Payment (Rent + Advance + Security Deposit)',
        due_date: dueDate.toISOString(), status: 'pending', is_move_in_payment: true
      })
      if (!billError) {
        const totalAmount = rentAmount + advanceAmount + securityDepositAmount
        await createNotification({ recipient: assignBooking.tenant, actor: session.user.id, type: 'payment_request', message: `Move-in payment: ₱${Number(totalAmount).toLocaleString()} Total. Due: ${dueDate.toLocaleDateString('en-US')}`, link: '/payments' })
      }
    } catch (err) { console.error('Auto-bill exception:', err) }

    showToast.success('Tenant assigned! Move-in payment bill sent.', { duration: 4000, position: "top-center", transition: "bounceIn" })
    setShowAssignModal(false)
    setContractFile(null)
    setShowAssignWarning(false)
    loadBookings()
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
        return <span className="px-2.5 py-0.5 bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wide border border-green-100 rounded-full">Booking Approved</span>
      case 'viewing_done':
        return <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wide border border-indigo-100 rounded-full">Viewing Success</span>
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
        <Lottie
          animationData={loadingAnimation}
          loop={true}
          className="w-64 h-64"
        />
        <p className="text-gray-500 font-medium text-lg mt-4">
          Loading bookings list...
        </p>
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
    <div className="min-h-[calc(100vh-64px)] bg-[#F3F4F5] p-4 md:p-8 font-sans">
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

                      {/* Landlord: After approval - Viewing Success / Cancel */}
                      {roleLower === 'landlord' &&
                        (statusLower === 'approved' || statusLower === 'accepted') && (
                          <div className="flex gap-2 w-full md:w-auto">
                            <button
                              onClick={() => markViewingSuccess(booking)}
                              className="flex-1 md:flex-none px-4 py-2.5 bg-green-600 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-sm"
                            >
                              Viewing Success
                            </button>
                            <button
                              onClick={() => cancelViewing(booking)}
                              className="flex-1 md:flex-none px-4 py-2.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg cursor-pointer hover:bg-red-50 transition-colors shadow-sm"
                            >
                              Cancel Viewing
                            </button>
                          </div>
                        )}

                      {/* Landlord: After viewing success - Assign Tenant */}
                      {roleLower === 'landlord' && statusLower === 'viewing_done' && (
                        <div className="flex gap-2 w-full md:w-auto">
                          <button
                            onClick={() => openAssignTenantModal(booking)}
                            className="flex-1 md:flex-none px-4 py-2.5 bg-black text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-gray-800 transition-colors shadow-sm flex items-center gap-2 justify-center"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                            Assign Tenant
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

      {/* --- ASSIGN TENANT MODAL --- */}
      {showAssignModal && assignBooking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => { setShowAssignModal(false); setShowAssignWarning(false) }}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            {!showAssignWarning ? (
              <>
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-lg font-bold text-gray-900">Assign Tenant</h3>
                  <button onClick={() => setShowAssignModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 text-gray-500 cursor-pointer">✕</button>
                </div>

                <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-200 overflow-hidden flex-shrink-0 border-2 border-white shadow-sm">
                    {assignBooking.tenant_profile?.avatar_url ? (
                      <img src={assignBooking.tenant_profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-blue-700 font-bold text-sm bg-blue-100">
                        {assignBooking.tenant_profile?.first_name?.[0]}{assignBooking.tenant_profile?.last_name?.[0]}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-blue-800 font-bold uppercase tracking-wider mb-0.5">Assigning Tenant</p>
                    <p className="font-bold text-gray-900 text-sm leading-none">{assignBooking.tenant_profile?.first_name} {assignBooking.tenant_profile?.last_name}</p>
                  </div>
                </div>

                {/* Select Property */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Select Property *</label>
                  {availableProperties.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {availableProperties.map(prop => {
                        const isBookedProperty = prop.id === assignBooking.property_id
                        const isSelected = selectedPropertyId === prop.id

                        return (
                          <label
                            key={prop.id}
                            className={`block p-3 border rounded-xl cursor-pointer transition-all ${isSelected
                              ? 'border-black bg-black text-white'
                              : isBookedProperty
                                ? 'border-green-500 bg-green-50/50 hover:bg-green-50'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                          >
                            <input type="radio" name="propSelect" value={prop.id} checked={isSelected} onChange={() => setSelectedPropertyId(prop.id)} className="hidden" />
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">{prop.title}</span>
                                {isBookedProperty && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isSelected ? 'bg-white text-green-700' : 'bg-green-100 text-green-700'}`}>Requested</span>}
                              </div>
                              <span className="text-xs font-medium">₱{Number(prop.price).toLocaleString()}/mo</span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg border border-red-100">No available properties found.</p>
                  )}
                </div>

                {/* Start Date */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Start Date <span className="text-red-500">*</span></label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-black outline-none" />
                </div>

                {/* Contract Duration */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Contract Duration (months) <span className="text-red-500">*</span></label>
                  <input type="number" min="3" value={contractMonths} onChange={e => setContractMonths(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-black outline-none" placeholder="e.g. 12" />
                  <p className="text-[10px] text-gray-400 mt-1">Minimum 3 months</p>
                </div>

                {/* End Date (auto) */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">End Date (Auto-calculated)</label>
                  <input
                    type="text"
                    value={endDate ? new Date(endDate).toLocaleDateString('en-US') : ''}
                    readOnly
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                </div>

                {/* Move-in Payment Summary */}
                {selectedPropertyId && (() => {
                  const sp = availableProperties.find(p => p.id === selectedPropertyId)
                  if (!sp) return null
                  const rent = sp.price || 0
                  return (
                    <div className="mb-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Move-in Payment Summary</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-emerald-700">Rent (1 Month):</span><span className="font-bold text-emerald-900">₱{Number(rent).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-emerald-700">Advance (1 Month):</span><span className="font-bold text-emerald-900">₱{Number(rent).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-emerald-700">Security Deposit:</span><span className="font-bold text-emerald-900">₱{Number(rent).toLocaleString()}</span></div>
                        <div className="flex justify-between pt-2 border-t border-emerald-200 mt-1"><span className="text-emerald-800 font-bold">Total Move-in:</span><span className="font-black text-emerald-900 text-base">₱{Number(rent * 3).toLocaleString()}</span></div>
                      </div>
                    </div>
                  )
                })()}

                {/* Contract PDF Upload */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Contract PDF <span className="text-red-500">*</span></label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-gray-400 transition-colors bg-gray-50/50">
                    <input type="file" accept=".pdf" id="contractFileBookings" className="hidden" onChange={(e) => setContractFile(e.target.files?.[0] || null)} />
                    <label htmlFor="contractFileBookings" className="cursor-pointer w-full flex flex-col items-center">
                      {contractFile ? (
                        <div className="flex items-center justify-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-lg border border-green-200">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <span className="text-sm font-bold">{contractFile.name}</span>
                          <button type="button" onClick={(e) => { e.preventDefault(); setContractFile(null); }} className="text-red-500 hover:text-red-700 ml-2">✕</button>
                        </div>
                      ) : (
                        <>
                          <svg className="w-6 h-6 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                          <p className="text-sm font-bold text-gray-600">Click to upload contract PDF</p>
                          <p className="text-xs text-gray-400 mt-1">PDF files only</p>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                {/* Late Payment Fee */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Late Payment Fee (₱) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="any" value={penaltyDetails} onChange={e => setPenaltyDetails(e.target.value)} placeholder="e.g. 500" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-black outline-none" />
                </div>

                {/* Utility Reminders (Wifi Due Day) */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 mb-4">
                  <p className="text-xs text-gray-600 font-medium mb-3">
                    <span className="font-bold">Utility Reminders:</span> Tenants will receive automated SMS & email reminders 3 days before due dates.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Wifi Due Day (Day of Month) <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowWifiDayPicker(!showWifiDayPicker)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-left flex justify-between items-center focus:border-black outline-none bg-white hover:border-gray-300 transition-colors"
                      >
                        <span className={wifiDueDay ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                          {wifiDueDay ? `Day ${wifiDueDay} of month` : 'Select day (1-31)'}
                        </span>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </button>

                      {showWifiDayPicker && (
                        <div className="absolute z-10 bottom-full mb-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl p-3 animate-in fade-in zoom-in-95 duration-200">
                          <div className="flex justify-between items-center mb-2 px-1">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Select Day</span>
                            <button onClick={() => setShowWifiDayPicker(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {[...Array(31)].map((_, i) => {
                              const day = i + 1;
                              const isSelected = parseInt(wifiDueDay) === day;
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => { setWifiDueDay(day); setShowWifiDayPicker(false); }}
                                  className={`aspect-square flex items-center justify-center text-xs font-bold rounded-lg transition-all ${isSelected
                                    ? 'bg-black text-white shadow-md transform scale-105'
                                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:scale-110'
                                    }`}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Electricity reminders are sent automatically.
                  </p>
                </div>

                <button
                  onClick={confirmAssignTenant}
                  disabled={uploadingContract || !selectedPropertyId}
                  className="w-full py-3 bg-black text-white text-sm font-bold rounded-xl cursor-pointer hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {uploadingContract ? 'Uploading...' : 'Assign Tenant'}
                </button>
              </>
            ) : (
              /* Confirmation Warning */
              <div className="text-center">
                <div className="w-14 h-14 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-500">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Assignment</h3>
                <p className="text-gray-500 text-sm mb-1">Are you sure you want to assign</p>
                <p className="font-bold text-gray-900 mb-1">{assignBooking.tenant_profile?.first_name} {assignBooking.tenant_profile?.last_name}</p>
                <p className="text-gray-500 text-sm mb-4">to <strong>{availableProperties.find(p => p.id === selectedPropertyId)?.title}</strong>?</p>
                <p className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded-lg border border-yellow-200 mb-5">This will mark the property as occupied and create a move-in payment bill.</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowAssignWarning(false)} className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">Go Back</button>
                  <button onClick={confirmAssignTenant} disabled={uploadingContract} className="flex-1 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-900 transition-colors shadow-lg cursor-pointer disabled:opacity-50">{uploadingContract ? 'Processing...' : 'Yes, Assign'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}