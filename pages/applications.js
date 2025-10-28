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
    }
  }, [session, profile, filter])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
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
    setBookingNotes('')
  }

  function closeBookingModal() {
    setShowBookingModal(false)
    setSelectedApplication(null)
    setBookingDate('')
    setBookingTime('')
    setBookingNotes('')
  }

  async function submitBooking(e) {
    e.preventDefault()
    setSubmittingBooking(true)

    try {
      // Combine date and time
      const bookingDateTime = new Date(`${bookingDate}T${bookingTime}`)

      console.log('Submitting booking with data:', {
        property_id: selectedApplication.property_id,
        tenant: session.user.id,
        landlord: selectedApplication.property.landlord,
        application_id: selectedApplication.id,
        start_time: bookingDateTime.toISOString(),
        booking_date: bookingDateTime.toISOString(),
        notes: bookingNotes,
        status: 'scheduled'
      })

      // Create booking
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
          status: 'scheduled'
        })
        .select()
        .single()

      if (bookingError) {
        console.error('Booking error details:', bookingError)
        throw bookingError
      }

      console.log('Booking created successfully:', booking)

      // Send notification to landlord
      const notificationMessage = `${profile.full_name} has scheduled a viewing for ${selectedApplication.property?.title} on ${new Date(bookingDateTime).toLocaleString()}`
      
      await createNotification({
        recipient: selectedApplication.property.landlord,
        actor: session.user.id,
        type: 'booking',
        message: notificationMessage,
        link: '/applications'
      })

      toast.success('Viewing scheduled successfully! The landlord has been notified.')
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

  // Get minimum date (today)
  const getMinDate = () => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Toaster position="top-right" />
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">
            {profile.role === 'landlord' ? 'Tenant Applications' : 'My Applications'}
          </h1>
          <p className="text-sm text-gray-600">
            {profile.role === 'landlord' 
              ? 'Review and manage tenant applications for your properties' 
              : 'Track the status of your rental applications'}
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-lg shadow mb-6 p-2 flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition ${
              filter === 'all' 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            All Applications
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition ${
              filter === 'pending' 
                ? 'bg-yellow-500 text-white' 
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('accepted')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition ${
              filter === 'accepted' 
                ? 'bg-green-600 text-white' 
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Accepted
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition ${
              filter === 'rejected' 
                ? 'bg-red-600 text-white' 
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Rejected
          </button>
        </div>

        {/* Applications List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading applications...</p>
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-600 mb-2">
                {filter === 'all' 
                  ? 'No applications yet' 
                  : `No ${filter} applications`}
              </p>
              <p className="text-sm text-gray-400">
                {profile.role === 'landlord' 
                  ? 'Applications from tenants will appear here' 
                  : 'Apply to properties to see them here'}
              </p>
            </div>
          ) : (
            applications.map(app => (
              <div key={app.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      {app.property?.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      {app.property?.address}, {app.property?.city}
                    </p>
                    {profile.role === 'landlord' && app.tenant_profile && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-900">
                          Applicant: {app.tenant_profile.full_name}
                        </p>
                        {app.tenant_profile.email && (
                          <p className="text-sm text-gray-600">
                            Email: {app.tenant_profile.email}
                          </p>
                        )}
                        {app.tenant_profile.phone && (
                          <p className="text-sm text-gray-600">
                            Phone: {app.tenant_profile.phone}
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-2xl font-bold text-blue-600 mb-3">
                      ₱{Number(app.property?.price).toLocaleString()}/month
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    app.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    app.status === 'accepted' ? 'bg-green-100 text-green-700' :
                    app.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                  </span>
                </div>

                {app.message && (
                  <div className="mb-4 p-3 bg-gray-50 rounded">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      {profile.role === 'landlord' ? 'Message from applicant:' : 'Your message:'}
                    </p>
                    <p className="text-sm text-gray-600">{app.message}</p>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <p className="text-xs text-gray-400">
                    Applied: {new Date(app.submitted_at).toLocaleDateString()}
                  </p>

                  <div className="flex gap-2">
                    {profile.role === 'landlord' && app.status === 'pending' && (
                      <>
                        <button
                          onClick={() => updateApplicationStatus(app.id, 'accepted')}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => updateApplicationStatus(app.id, 'rejected')}
                          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {profile.role === 'tenant' && app.status === 'accepted' && (
                      <>
                        {app.hasBooking ? (
                          <div className="text-sm text-gray-600 flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Viewing scheduled for {new Date(app.latestBooking.booking_date).toLocaleString()}
                          </div>
                        ) : (
                          <button
                            onClick={() => openBookingModal(app)}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Schedule Viewing
                          </button>
                        )}
                      </>
                    )}

                    {/* Delete button - hidden for accepted applications */}
                    {app.status !== 'accepted' && (
                      <button
                        onClick={() => deleteApplication(app.id)}
                        className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 text-sm font-medium flex items-center gap-2"
                        title="Delete application"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Booking Modal */}
      {showBookingModal && selectedApplication && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Schedule Property Viewing</h3>
              <button
                onClick={closeBookingModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="font-medium text-gray-900">{selectedApplication.property?.title}</p>
              <p className="text-sm text-gray-600">{selectedApplication.property?.address}, {selectedApplication.property?.city}</p>
            </div>

            <form onSubmit={submitBooking} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred Date *
                </label>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  min={getMinDate()}
                  required
                  className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred Time *
                </label>
                <input
                  type="time"
                  value={bookingTime}
                  onChange={(e) => setBookingTime(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  rows={3}
                  placeholder="Any specific requirements or questions..."
                  className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeBookingModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBooking}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {submittingBooking ? 'Scheduling...' : 'Schedule Viewing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Delete Application</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this application? All associated data will be permanently removed.
            </p>

            <div className="flex gap-3">
              <button
                onClick={cancelDelete}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
