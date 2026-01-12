import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { createNotification, NotificationTemplates } from '../lib/notifications'
import { showToast } from 'nextjs-toast-notify'

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
            tenant_profile:profiles(first_name, middle_name, last_name, phone)
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
          tenant_profile:profiles(first_name, middle_name, last_name, phone),
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

      showToast.success(`Application ${newStatus}`, {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      loadApplications()
    } else {
      showToast.error('Failed to update application status', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
    }
  }

  async function deleteApplication(applicationId) {
    setApplicationToDelete(applicationId)
    setShowDeleteModal(true)
  }

  async function confirmDelete() {
    if (!applicationToDelete) return

    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('id', applicationToDelete)

    if (!error) {
      setShowDeleteModal(false)
      setApplicationToDelete(null)
      showToast.success('Application deleted successfully', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      loadApplications()
    } else {
      console.error('Error deleting application:', error)
      showToast.error('Failed to delete application', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
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

      if (bookingError) throw bookingError

      // If a time slot was selected, mark it as booked
      if (timeSlotId) {
        await supabase
          .from('available_time_slots')
          .update({ is_booked: true })
          .eq('id', timeSlotId)
      }

      // Send notification to landlord
      const notificationMessage = `${profile.first_name} ${profile.last_name} has requested a viewing for ${selectedApplication.property?.title} on ${new Date(bookingDateTime).toLocaleString()}. Please approve or reject.`
      
      await createNotification({
        recipient: selectedApplication.property.landlord,
        actor: session.user.id,
        type: 'booking_request',
        message: notificationMessage,
        link: '/applications'
      })

      showToast.success('Viewing request sent! Waiting for landlord approval.', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      closeBookingModal()
      loadApplications()
    } catch (err) {
      console.error('Error creating booking:', err)
      showToast.error('Failed to schedule viewing', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
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
      showToast.success('Booking approved!', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      loadPendingBookings()
      loadApplications()
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
      showToast.success('Booking rejected', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      loadPendingBookings()
      loadApplications()
    } else {
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

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#FAFAFA] p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
             <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
               {profile.role === 'landlord' ? 'Tenant Applications' : 'My Applications'}
             </h1>
             <p className="text-gray-500 text-sm mt-1">
               {profile.role === 'landlord' 
                ? 'Review and manage tenant applications for your properties.' 
                : 'Track the status of your rental applications.'}
             </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white border-2 border-black mb-8 p-1.5 rounded-xl inline-flex flex-wrap gap-2 w-full md:w-auto">
           {['all', 'pending', 'accepted', 'rejected'].map((tab) => (
             <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg cursor-pointer transition-all uppercase tracking-wide ${
                  filter === tab 
                    ? 'bg-black text-white' 
                    : 'bg-transparent text-gray-500 hover:text-black'
                }`}
             >
                {tab}
             </button>
           ))}
        </div>

        {/* Landlord: Pending Booking Requests Banner */}
        {profile.role === 'landlord' && pendingBookings.length > 0 && (
          <div className="mb-8 bg-white border border-gray-100 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
               <div className="w-10 h-10 bg-yellow-50 rounded-full flex items-center justify-center text-yellow-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               </div>
               <div>
                  <h3 className="font-bold text-gray-900 text-sm">
                    {pendingBookings.length} Pending Viewing Request{pendingBookings.length !== 1 && 's'}
                  </h3>
                  <p className="text-xs text-gray-500">Tenants are waiting for your approval.</p>
               </div>
            </div>
            <button
              onClick={() => setShowBookingsListModal(true)}
              className="px-4 py-2.5 bg-black text-white text-sm font-bold rounded-lg cursor-pointer hover:bg-gray-900 transition-colors"
            >
              View Requests
            </button>
          </div>
        )}

        {/* Applications List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-20">
              <p className="text-gray-400 text-sm">Loading applications...</p>
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
               <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
               </div>
               <h3 className="text-gray-900 font-bold mb-1">No applications found</h3>
               <p className="text-gray-500 text-sm">
                  {filter === 'all' 
                    ? 'There are no applications to show right now.' 
                    : `No applications with status "${filter}".`}
               </p>
            </div>
          ) : (
            applications.map(app => {
              const isExpanded = expandedApplications[app.id]
              
              return (
                <div key={app.id} className="bg-white border border-gray-100 p-5 md:p-6 rounded-2xl shadow-sm transition-all">
                  {/* Card Header */}
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-bold text-gray-900">
                          {app.property?.title}
                        </h3>
                        <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full border ${
                          app.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                          app.status === 'accepted' ? 'bg-green-50 text-green-700 border-green-100' :
                          app.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' :
                          'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                          {app.status}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-500 mb-3">
                        {app.property?.address}, {app.property?.city}
                      </p>
                      
                      <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
                        <span className="text-black">₱{Number(app.property?.price).toLocaleString()}/mo</span>
                        <span>•</span>
                        <span>Applied {new Date(app.submitted_at).toLocaleDateString()}</span>
                      </div>

                      {/* Compact Booking Status */}
                      {profile.role === 'tenant' && app.status === 'accepted' && app.hasBooking && !isExpanded && (
                        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-800 text-xs font-medium rounded-lg border border-green-100">
                           <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                           Viewing scheduled for {new Date(app.latestBooking.booking_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                         <button
                           onClick={() => toggleApplicationDetails(app.id)}
                           className="px-4 py-2 bg-gray-50 text-black border border-gray-200 text-xs font-bold rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                         >
                           {isExpanded ? 'Hide Details' : 'View Details'}
                         </button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-gray-50 grid grid-cols-1 md:grid-cols-2 gap-6">
                       
                       {/* Left: Message & Info */}
                       <div className="space-y-4">
                          {/* Applicant Info (Landlord View) */}
                          {profile.role === 'landlord' && app.tenant_profile && (
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Applicant</h4>
                              <p className="text-sm font-bold text-gray-900">{app.tenant_profile.first_name} {app.tenant_profile.last_name}</p>
                              <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                                {app.tenant_profile.email && <p>{app.tenant_profile.email}</p>}
                                {app.tenant_profile.phone && <p>{app.tenant_profile.phone}</p>}
                              </div>
                            </div>
                          )}

                          {/* Message */}
                          {app.message && (
                            <div className="bg-white p-4 rounded-xl border border-gray-100">
                               <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                                 {profile.role === 'landlord' ? 'Message' : 'Your Note'}
                               </h4>
                               <p className="text-sm text-gray-600 leading-relaxed">{app.message}</p>
                            </div>
                          )}
                       </div>

                       {/* Right: Actions & Status */}
                       <div className="space-y-4">
                          
                          {/* Viewing Details (Tenant View) */}
                          {profile.role === 'tenant' && app.status === 'accepted' && app.hasBooking && (
                             <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-green-800 mb-3">Viewing Details</h4>
                                <div className="space-y-2 text-sm">
                                   <div className="flex justify-between">
                                      <span className="text-green-700">Date</span>
                                      <span className="font-bold text-green-900">{new Date(app.latestBooking.booking_date).toLocaleDateString()}</span>
                                   </div>
                                   <div className="flex justify-between">
                                      <span className="text-green-700">Time</span>
                                      <span className="font-bold text-green-900">{new Date(app.latestBooking.booking_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                   </div>
                                   <div className="flex justify-between pt-2 border-t border-green-200 mt-2">
                                      <span className="text-green-700">Status</span>
                                      <span className="font-bold text-green-900 uppercase text-xs tracking-wide bg-white px-2 py-0.5 rounded-full">
                                        {app.latestBooking.status.replace('_', ' ')}
                                      </span>
                                   </div>
                                </div>
                             </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex flex-col gap-2">
                             {/* Landlord Actions */}
                             {profile.role === 'landlord' && app.status === 'pending' && (
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    onClick={() => updateApplicationStatus(app.id, 'accepted')}
                                    className="px-4 py-3 bg-green-600 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-green-700 transition-colors"
                                  >
                                    Accept Application
                                  </button>
                                  <button
                                    onClick={() => updateApplicationStatus(app.id, 'rejected')}
                                    className="px-4 py-3 bg-red-600 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-red-700 transition-colors"
                                  >
                                    Reject Application
                                  </button>
                                </div>
                             )}

                             {/* Tenant Schedule Button */}
                             {profile.role === 'tenant' && app.status === 'accepted' && !app.hasBooking && (
                                <button
                                  onClick={() => openBookingModal(app)}
                                  className="w-full px-4 py-3 bg-black text-white text-sm font-bold rounded-lg cursor-pointer hover:bg-gray-900 transition-colors shadow-lg shadow-gray-100"
                                >
                                  Schedule Viewing
                                </button>
                             )}

                             {/* Delete Button */}
                             {app.status !== 'accepted' && (
                                <button
                                  onClick={() => deleteApplication(app.id)}
                                  className="w-full px-4 py-3 text-red-600 bg-red-50 hover:bg-red-100 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                                >
                                  Delete Application
                                </button>
                             )}
                          </div>
                       </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Booking Modal */}
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
                          className={`block p-3 border rounded-xl cursor-pointer transition-all ${
                            selectedTimeSlot === slot.id
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
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                                selectedTimeSlot === slot.id ? 'border-white bg-white' : 'border-gray-300'
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
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6 text-center">
             <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
             </div>
             <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Application?</h3>
             <p className="text-sm text-gray-500 mb-6">Are you sure you want to delete this application? This action cannot be undone.</p>
             
             <div className="flex gap-3">
               <button
                 onClick={cancelDelete}
                 className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl cursor-pointer hover:bg-gray-50"
               >
                 Cancel
               </button>
               <button
                 onClick={confirmDelete}
                 className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl cursor-pointer hover:bg-red-700 shadow-lg shadow-red-100"
               >
                 Delete
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Pending Bookings List Modal */}
      {showBookingsListModal && profile.role === 'landlord' && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Viewing Requests</h3>
              <button
                onClick={() => setShowBookingsListModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 text-gray-500 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {pendingBookings.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-gray-500 text-sm">No pending requests at the moment.</p>
                </div>
              ) : (
                pendingBookings.map((booking) => (
                  <div key={booking.id} className="p-5 bg-white border border-gray-100 rounded-xl shadow-sm">
                    <div className="flex justify-between items-start gap-4 mb-4">
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm">{booking.property?.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">{booking.property?.address}</p>
                      </div>
                      <span className="px-2 py-1 bg-yellow-50 text-yellow-700 text-[10px] font-bold uppercase rounded-full border border-yellow-100">
                        Pending
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                       <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Tenant</p>
                          <p className="text-sm font-bold text-gray-900">{booking.tenant_profile?.first_name} {booking.tenant_profile?.last_name}</p>
                       </div>
                       <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Requested Time</p>
                          <p className="text-sm font-bold text-gray-900">
                            {new Date(booking.booking_date).toLocaleDateString()}
                            <span className="text-gray-400 font-normal mx-1">•</span>
                            {new Date(booking.booking_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                       </div>
                    </div>

                    {booking.notes && (
                      <div className="mb-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100 italic">
                        "{booking.notes}"
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          approveBooking(booking.id)
                          setShowBookingsListModal(false)
                        }}
                        className="flex-1 py-2.5 bg-green-600 text-white font-bold text-xs rounded-lg cursor-pointer hover:bg-green-700 transition-colors"
                      >
                        Accept Request
                      </button>
                      <button
                        onClick={() => {
                          rejectBooking(booking.id)
                          setShowBookingsListModal(false)
                        }}
                        className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold text-xs rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        Decline
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