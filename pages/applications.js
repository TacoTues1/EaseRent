import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { createNotification, NotificationTemplates } from '../lib/notifications'
import toast, { Toaster } from 'react-hot-toast'

export default function ApplicationsPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, pending, accepted, rejected
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [bookingDate, setBookingDate] = useState('')
  const [bookingTime, setBookingTime] = useState('')
  const [bookingNotes, setBookingNotes] = useState('')
  const [submittingBooking, setSubmittingBooking] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [applicationToDelete, setApplicationToDelete] = useState(null)
  const [availableTimeSlots, setAvailableTimeSlots] = useState([])
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('')
  const [pendingBookings, setPendingBookings] = useState([])
  const [showBookingsListModal, setShowBookingsListModal] = useState(false)
  const [expandedApplications, setExpandedApplications] = useState({})

  const toggleApplicationDetails = (appId) => {
    setExpandedApplications(prev => ({
      ...prev,
      [appId]: !prev[appId]
    }))
  }

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
      loadApplications()
      if (profile.role === 'landlord') {
        loadPendingBookings()
      }
    }
  }, [session, profile, filter])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    
    if (data) setProfile(data)
  }

  async function loadApplications() {
    setLoading(true)

    if (profile?.role === 'landlord') {
      // Get applications for landlord's properties
      const { data: myProperties } = await supabase
        .from('properties')
        .select('id')
        .eq('landlord', session.user.id)

      if (myProperties && myProperties.length > 0) {
        const propertyIds = myProperties.map(p => p.id)
        
        let query = supabase
          .from('applications')
          .select(`
            *,
            property:properties(title, address, city, price),
            tenant_profile:profiles(full_name, phone)
          `)
          .in('property_id', propertyIds)
          .order('submitted_at', { ascending: false })

        if (filter !== 'all') {
          query = query.eq('status', filter)
        }

        const { data, error } = await query

        if (error) {
          console.error('Error loading applications:', error)
        } else {
          setApplications(data || [])
        }
      } else {
        setApplications([])
      }
    } else if (profile?.role === 'tenant') {
      // Get tenant's own applications
      let query = supabase
        .from('applications')
        .select(`
          *,
          property:properties(title, address, city, price, landlord),
          landlord_profile:properties(landlord)
        `)
        .eq('tenant', session.user.id)
        .order('submitted_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data: appsData, error } = await query

      if (error) {
        console.error('Error loading applications:', error)
        setApplications([])
      } else {
        // Load bookings for each application
        const appsWithBookings = await Promise.all(
          (appsData || []).map(async (app) => {
            const { data: bookings } = await supabase
              .from('bookings')
              .select('*')
              .eq('application_id', app.id)
              .order('booking_date', { ascending: false })
              .limit(1)
            
            return {
              ...app,
              hasBooking: bookings && bookings.length > 0,
              latestBooking: bookings?.[0] || null
            }
          })
        )
        setApplications(appsWithBookings)
      }
    }

    setLoading(false)
  }

  async function loadPendingBookings() {
    // Load pending bookings for landlord's properties
    const { data: myProperties } = await supabase
      .from('properties')
      .select('id')
      .eq('landlord', session.user.id)

    if (myProperties && myProperties.length > 0) {
      const propertyIds = myProperties.map(p => p.id)
      
      const { data } = await supabase
        .from('bookings')
        .select(`
          *,
          property:properties(title, address, city),
          tenant_profile:profiles(full_name, phone),
          application:applications(id)
        `)
        .in('property_id', propertyIds)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false })

      setPendingBookings(data || [])
    }
  }

  async function loadAvailableTimeSlots(application) {
    // Get the landlord_id from the application's property
    const landlordId = application.property?.landlord || application.property?.landlord_id
    
    if (!landlordId) {
      console.error('No landlord ID found for application')
      setAvailableTimeSlots([])
      return
    }

    const { data } = await supabase
      .from('available_time_slots')
      .select('*')
      .eq('landlord_id', landlordId)
      .eq('is_booked', false)
      .gte('start_time', new Date().toISOString())
      .or(`property_id.is.null,property_id.eq.${application.property_id}`)
      .order('start_time', { ascending: true })

    setAvailableTimeSlots(data || [])
  }

  async function updateApplicationStatus(applicationId, newStatus) {
    const { error } = await supabase
      .from('applications')
      .update({ status: newStatus })
      .eq('id', applicationId)

    if (!error) {
      // Send notification to tenant
      const application = applications.find(a => a.id === applicationId)
      if (application && application.tenant) {
        const template = NotificationTemplates.applicationStatusUpdate(
          application.property?.title || 'the property',
          newStatus
        )
        await createNotification({
          recipient: application.tenant,
          actor: session.user.id,
          type: template.type,
          message: template.message,
          link: '/applications'
        })
      }

      toast.success(`Application ${newStatus}`)
      loadApplications()
    } else {
      toast.error('Failed to update application status')
    }
  }

  async function deleteApplication(applicationId) {
    setApplicationToDelete(applicationId)
    setShowDeleteModal(true)
  }

  async function confirmDelete() {
    if (!applicationToDelete) return

    console.log('Attempting to delete application:', applicationToDelete)
    console.log('Current user:', session.user.id)
    console.log('User role:', profile.role)

    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('id', applicationToDelete)

    if (!error) {
      console.log('Application deleted successfully')
      setShowDeleteModal(false)
      setApplicationToDelete(null)
      toast.success('Application deleted successfully')
      loadApplications()
    } else {
      console.error('Error deleting application:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      
      let errorMessage = 'Failed to delete application. '
      if (error.message) {
        errorMessage += error.message
      }
      if (error.hint) {
        errorMessage += '\n\nHint: ' + error.hint
      }
      if (error.details) {
        errorMessage += '\n\nDetails: ' + error.details
      }
      
      toast.error(errorMessage)
    }
  }

  function cancelDelete() {
    setShowDeleteModal(false)
    setApplicationToDelete(null)
  }

  function openBookingModal(application) {
    setSelectedApplication(application)
    setShowBookingModal(true)
    setBookingDate('')
    setBookingTime('')
    setSelectedTimeSlot('')
    setBookingNotes('')
    // Load available time slots for this landlord
    loadAvailableTimeSlots(application)
  }

  function closeBookingModal() {
    setShowBookingModal(false)
    setSelectedApplication(null)
    setBookingDate('')
    setBookingTime('')
    setSelectedTimeSlot('')
    setBookingNotes('')
    setAvailableTimeSlots([])
  }

  async function submitBooking(e) {
    e.preventDefault()
    setSubmittingBooking(true)

    try {
      let bookingDateTime
      let timeSlotId = null

      if (selectedTimeSlot) {
        // Using landlord's available time slot
        const slot = availableTimeSlots.find(s => s.id === selectedTimeSlot)
        if (slot) {
          bookingDateTime = new Date(slot.start_time)
          timeSlotId = slot.id
        }
      } else {
        // Manual date/time entry (should not happen if slots are available)
        bookingDateTime = new Date(`${bookingDate}T${bookingTime}`)
      }

      // Create booking with pending_approval status
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          property_id: selectedApplication.property_id,
          tenant: session.user.id,
          landlord: selectedApplication.property.landlord,
          application_id: selectedApplication.id,
          start_time: bookingDateTime.toISOString(),
          booking_date: bookingDateTime.toISOString(),
          notes: bookingNotes,
          status: 'pending_approval'
        })
        .select()
        .single()

      if (bookingError) {
        console.error('Booking error details:', bookingError)
        throw bookingError
      }

      // If a time slot was selected, mark it as booked
      if (timeSlotId) {
        await supabase
          .from('available_time_slots')
          .update({ is_booked: true })
          .eq('id', timeSlotId)
      }

      // Send notification to landlord
      const notificationMessage = `${profile.full_name} has requested a viewing for ${selectedApplication.property?.title} on ${new Date(bookingDateTime).toLocaleString()}. Please approve or reject.`
      
      await createNotification({
        recipient: selectedApplication.property.landlord,
        actor: session.user.id,
        type: 'booking_request',
        message: notificationMessage,
        link: '/applications'
      })

      toast.success('Viewing request sent! Waiting for landlord approval.')
      closeBookingModal()
      loadApplications()
    } catch (err) {
      console.error('Error creating booking:', err)
      console.error('Error details:', JSON.stringify(err, null, 2))
      
      let errorMessage = 'Failed to schedule viewing. '
      if (err.message) {
        errorMessage += err.message
      }
      if (err.hint) {
        errorMessage += '\n\nHint: ' + err.hint
      }
      if (err.details) {
        errorMessage += '\n\nDetails: ' + err.details
      }
      
      toast.error(errorMessage)
    } finally {
      setSubmittingBooking(false)
    }
  }

  async function approveBooking(bookingId) {
    const booking = pendingBookings.find(b => b.id === bookingId)
    
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'approved' })
      .eq('id', bookingId)

    if (!error) {
      // Mark the time slot as booked
      if (booking?.time_slot_id) {
        await supabase
          .from('available_time_slots')
          .update({ is_booked: true })
          .eq('id', booking.time_slot_id)
      }
      
      if (booking) {
        await createNotification({
          recipient: booking.tenant,
          actor: session.user.id,
          type: 'booking_approved',
          message: `Your viewing request for ${booking.property?.title} on ${new Date(booking.booking_date).toLocaleString()} has been approved!`,
          link: '/applications'
        })
      }
      toast.success('Booking approved!')
      loadPendingBookings()
      loadApplications()
    } else {
      console.error('Error approving booking:', error)
      toast.error('Failed to approve booking')
    }
  }

  async function rejectBooking(bookingId) {
    const booking = pendingBookings.find(b => b.id === bookingId)
    
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'rejected' })
      .eq('id', bookingId)

    if (!error) {
      // Unbook the time slot if it was booked
      if (booking?.time_slot_id) {
        await supabase
          .from('available_time_slots')
          .update({ is_booked: false })
          .eq('id', booking.time_slot_id)
      }

      if (booking) {
        await createNotification({
          recipient: booking.tenant,
          actor: session.user.id,
          type: 'booking_rejected',
          message: `Your viewing request for ${booking.property?.title} has been rejected. Please choose another time slot.`,
          link: '/applications'
        })
      }
      toast.success('Booking rejected')
      loadPendingBookings()
      loadApplications()
    } else {
      toast.error('Failed to reject booking')
    }
  }

  // Get minimum date (today)
  const getMinDate = () => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="inline-block animate-spin h-12 w-12 border-b-2 border-black"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold mb-2">
            {profile.role === 'landlord' ? 'Tenant Applications' : 'My Applications'}
          </h1>
          <p className="text-xs sm:text-sm text-black">
            {profile.role === 'landlord' 
              ? 'Review and manage tenant applications for your properties' 
              : 'Track the status of your rental applications'}
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white border-2 border-black mb-4 sm:mb-6 p-2 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 min-w-[calc(50%-0.25rem)] sm:min-w-0 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-[4px] cursor-pointer ${
              filter === 'all' 
                ? 'bg-black text-white' 
                : 'text-black'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`flex-1 min-w-[calc(50%-0.25rem)] sm:min-w-0 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-[4px] cursor-pointer ${
              filter === 'pending' 
                ? 'bg-black text-white' 
                : 'text-black'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('accepted')}
            className={`flex-1 min-w-[calc(50%-0.25rem)] sm:min-w-0 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-[4px] cursor-pointer ${
              filter === 'accepted' 
                ? 'bg-black text-white' 
                : 'text-black'
            }`}
          >
            Accepted
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`flex-1 min-w-[calc(50%-0.25rem)] sm:min-w-0 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-[4px] cursor-pointer ${
              filter === 'rejected' 
                ? 'bg-black text-white' 
                : 'text-black'
            }`}
          >
            Rejected
          </button>
        </div>

        {/* Landlord: Pending Booking Requests Banner */}
        {profile.role === 'landlord' && pendingBookings.length > 0 && (
          <div className="mb-4 sm:mb-6 bg-yellow-50 border-2 border-yellow-600 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold text-black">
                    {pendingBookings.length} Pending Viewing {pendingBookings.length === 1 ? 'Request' : 'Requests'}
                  </p>
                  <p className="text-sm text-black">Tenants are waiting for your approval</p>
                </div>
              </div>
              <button
                onClick={() => setShowBookingsListModal(true)}
                className="px-4 py-2 bg-yellow-600 text-white font-medium hover:bg-yellow-700 whitespace-nowrap"
              >
                View Requests ({pendingBookings.length})
              </button>
            </div>
          </div>
        )}

        {/* Applications List */}
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-12 bg-white">
              <div className="inline-block animate-spin h-12 w-12"></div>
              <p className="mt-4 text-black">Loading applications...</p>
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-12 bg-white">
              <p className="text-black mb-2">
                {filter === 'all' 
                  ? 'No applications yet' 
                  : `No ${filter} applications`}
              </p>
              <p className="text-sm text-black">
                {profile.role === 'landlord' 
                  ? 'Applications from tenants will appear here' 
                  : 'Apply to properties to see them here'}
              </p>
            </div>
          ) : (
            applications.map(app => {
              const isExpanded = expandedApplications[app.id]
              
              return (
                <div key={app.id} className="bg-white border-2 border-black p-2 sm:p-3">
                  {/* Compact Header - Always Visible */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm sm:text-base font-bold text-black leading-tight">
                          {app.property?.title}
                        </h3>
                        <span className={`px-2 py-0.5 text-[10px] sm:text-xs font-semibold whitespace-nowrap ${
                          app.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          app.status === 'accepted' ? 'bg-green-100 text-green-700' :
                          app.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                        </span>
                      </div>
                      
                      <p className="text-xs text-gray-600 mb-1">
                        {app.property?.city}
                      </p>
                      
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm sm:text-base font-bold text-black">
                          ₱{Number(app.property?.price).toLocaleString()}
                        </p>
                        <span className="text-gray-400">•</span>
                        <p className="text-[10px] sm:text-xs text-gray-500">
                          {new Date(app.submitted_at).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Booking Status for Tenants - Compact */}
                      {profile.role === 'tenant' && app.status === 'accepted' && app.hasBooking && !isExpanded && (
                        <div className="flex items-center gap-1 text-[10px] sm:text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded mt-1 w-fit">
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Viewing: {new Date(app.latestBooking.booking_date).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expandable Details Section */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                      {/* Full Address */}
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Address:</span> {app.property?.address}, {app.property?.city}
                      </div>

                      {/* Applicant Info for Landlords */}
                      {profile.role === 'landlord' && app.tenant_profile && (
                        <div className="bg-gray-50 p-2 rounded text-xs">
                          <p className="font-semibold text-black mb-1">Applicant:</p>
                          <div className="space-y-0.5">
                            <p className="text-black">{app.tenant_profile.full_name}</p>
                            {app.tenant_profile.email && (
                              <p className="text-black break-all">{app.tenant_profile.email}</p>
                            )}
                            {app.tenant_profile.phone && (
                              <p className="text-black">{app.tenant_profile.phone}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Application Message */}
                      {app.message && (
                        <div className="bg-blue-50 p-2 rounded text-xs">
                          <p className="font-semibold text-black mb-0.5">
                            {profile.role === 'landlord' ? 'Message:' : 'Your message:'}
                          </p>
                          <p className="text-black break-words">{app.message}</p>
                        </div>
                      )}

                      {/* Booking Details for Tenants */}
                      {profile.role === 'tenant' && app.status === 'accepted' && app.hasBooking && (
                        <div className="bg-green-50 p-2 rounded text-xs">
                          <p className="font-semibold text-black mb-0.5">Viewing Details:</p>
                          <p className="text-black">
                            {new Date(app.latestBooking.booking_date).toLocaleString()}
                          </p>
                          <p className="text-black">
                            Status: {app.latestBooking.status.replace('_', ' ').toUpperCase()}
                          </p>
                          {app.latestBooking.notes && (
                            <p className="text-black mt-1">
                              <span className="font-medium">Notes:</span> {app.latestBooking.notes}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-200">
                    {/* View Details Toggle */}
                    <button
                      onClick={() => toggleApplicationDetails(app.id)}
                      className="px-2 py-1 border border-black text-black hover:bg-gray-100 text-[10px] sm:text-xs font-medium flex items-center gap-1"
                    >
                      {isExpanded ? (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                          <span className="hidden sm:inline">Hide</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          <span className="hidden sm:inline">Details</span>
                        </>
                      )}
                    </button>

                    {/* Landlord Actions */}
                    {profile.role === 'landlord' && app.status === 'pending' && (
                      <>
                        <button
                          onClick={() => updateApplicationStatus(app.id, 'accepted')}
                          className="px-2 sm:px-3 py-1 bg-green-600 text-white hover:bg-green-700 text-[10px] sm:text-xs font-medium"
                        >
                          ✓ Accept
                        </button>
                        <button
                          onClick={() => updateApplicationStatus(app.id, 'rejected')}
                          className="px-2 sm:px-3 py-1 bg-red-600 text-white hover:bg-red-700 text-[10px] sm:text-xs font-medium"
                        >
                          ✕ Reject
                        </button>
                      </>
                    )}

                    {/* Tenant Actions */}
                    {profile.role === 'tenant' && app.status === 'accepted' && !app.hasBooking && (
                      <button
                        onClick={() => openBookingModal(app)}
                        className="px-2 sm:px-3 py-1 bg-black text-white hover:bg-gray-800 text-[10px] sm:text-xs font-medium flex items-center gap-1"
                      >
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="hidden sm:inline">Schedule</span>
                      </button>
                    )}

                    {/* Delete button - hidden for accepted applications */}
                    {app.status !== 'accepted' && (
                      <button
                        onClick={() => deleteApplication(app.id)}
                        className="ml-auto px-2 sm:px-3 py-1 bg-red-600 text-white hover:bg-red-700 text-[10px] sm:text-xs font-medium flex items-center gap-1"
                        title="Delete application"
                      >
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Booking Modal */}
      {showBookingModal && selectedApplication && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg sm:text-xl font-bold text-black">Schedule Property Viewing</h3>
              <button
                onClick={closeBookingModal}
                className="text-black flex-shrink-0"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-2 sm:p-3 bg-white">
              <p className="font-medium text-black text-sm sm:text-base break-words">{selectedApplication.property?.title}</p>
              <p className="text-xs sm:text-sm text-black break-words">{selectedApplication.property?.address}, {selectedApplication.property?.city}</p>
            </div>

            <form onSubmit={submitBooking} className="space-y-4">
              {availableTimeSlots.length > 0 ? (
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-black mb-2">
                    Select Available Time Slot *
                  </label>
                  <div className="space-y-2 max-h-60 overflow-y-auto border-2 border-black p-2">
                    {availableTimeSlots.map((slot) => {
                      const startTime = new Date(slot.start_time)
                      const startHour = startTime.getHours()
                      
                      // Determine time slot label
                      let timeLabel = 'Custom'
                      let timeRange = `${startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${new Date(slot.end_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                      let badgeColor = 'bg-purple-100 text-purple-800'
                      let emoji = '⏰'
                      
                      if (startHour === 8) {
                        timeLabel = 'Morning'
                        timeRange = '8AM - 11AM'
                        badgeColor = 'bg-yellow-100 text-yellow-800'
                        emoji = '🌅'
                      } else if (startHour === 13) {
                        timeLabel = 'Afternoon'
                        timeRange = '1PM - 5:30PM'
                        badgeColor = 'bg-orange-100 text-orange-800'
                        emoji = '☀️'
                      }
                      
                      return (
                        <label
                          key={slot.id}
                          className={`block p-2 border-2 cursor-pointer transition-colors ${
                            selectedTimeSlot === slot.id
                              ? 'border-black bg-black text-white'
                              : 'border-gray-300 hover:border-black'
                          }`}
                        >
                          <input
                            type="radio"
                            name="timeSlot"
                            value={slot.id}
                            checked={selectedTimeSlot === slot.id}
                            onChange={(e) => setSelectedTimeSlot(e.target.value)}
                            className="sr-only"
                            required
                          />
                          <div className="flex justify-between items-center gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-base flex-shrink-0">{emoji}</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">
                                  {startTime.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric'
                                  })} • {timeRange}
                                </div>
                              </div>
                              <span className={`px-2 py-0.5 text-xs font-semibold flex-shrink-0 ${
                                selectedTimeSlot === slot.id 
                                  ? 'bg-white text-black' 
                                  : badgeColor
                              }`}>
                                {timeLabel}
                              </span>
                            </div>
                            {selectedTimeSlot === slot.id && (
                              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Choose your preferred viewing time
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-gray-100 border-2 border-black">
                  <p className="text-sm text-black">
                    No available time slots yet. The landlord hasn't set up viewing times for this property. Please contact the landlord directly.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs sm:text-sm font-medium text-black mb-1">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  rows={3}
                  placeholder="Any specific requirements or questions..."
                  className="w-full px-3 py-2 bg-white border-2 border-black text-black placeholder-gray-400 focus:outline-none text-sm sm:text-base"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={closeBookingModal}
                  className="flex-1 px-4 py-2 border-2 border-black text-black text-sm sm:text-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBooking || availableTimeSlots.length === 0}
                  className="flex-1 px-4 py-2 bg-black text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  {submittingBooking ? 'Sending Request...' : 'Request Viewing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black max-w-md w-full p-4 sm:p-6">
            <div className="flex items-start sm:items-center mb-4">
              <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-white flex items-center justify-center mr-3 sm:mr-4">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-black">Delete Application</h3>
                <p className="text-xs sm:text-sm text-black">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-black mb-6 text-sm sm:text-base">
              Are you sure you want to delete this application? All associated data will be permanently removed.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={cancelDelete}
                className="flex-1 px-4 py-2 border-2 border-black text-black text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-black text-white text-sm sm:text-base"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Bookings List Modal (for Landlords) */}
      {showBookingsListModal && profile.role === 'landlord' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black max-w-3xl w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg sm:text-xl font-bold text-black">Pending Viewing Requests</h3>
              <button
                onClick={() => setShowBookingsListModal(false)}
                className="text-black flex-shrink-0"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {pendingBookings.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-black">No pending booking requests</p>
                </div>
              ) : (
                pendingBookings.map((booking) => (
                  <div key={booking.id} className="border-2 border-black p-3">
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm text-black truncate">{booking.property?.title}</h4>
                        <p className="text-xs text-gray-600 truncate">{booking.property?.address}, {booking.property?.city}</p>
                      </div>
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold flex-shrink-0">
                        Pending
                      </span>
                    </div>

                    <div className="space-y-1.5 mb-3 text-sm">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-black flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="font-medium text-xs">Tenant:</span>
                        <span className="text-xs">{booking.tenant_profile?.full_name}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-black flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="font-medium text-xs">Date:</span>
                        <span className="text-xs">{new Date(booking.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(booking.booking_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {booking.notes && (
                        <div className="flex items-start gap-2 bg-gray-50 p-2 rounded">
                          <svg className="w-3.5 h-3.5 text-black flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          <span className="text-xs flex-1">{booking.notes}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          approveBooking(booking.id)
                          setShowBookingsListModal(false)
                        }}
                        className="flex-1 px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 font-medium text-xs"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => {
                          rejectBooking(booking.id)
                          setShowBookingsListModal(false)
                        }}
                        className="flex-1 px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 font-medium text-xs"
                      >
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
