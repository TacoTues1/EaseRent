import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { createNotification } from '../lib/notifications'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Footer from './Footer'

export default function LandlordDashboard({ session, profile }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState({})

  // Modal States
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [acceptedApplications, setAcceptedApplications] = useState([])
  const [penaltyDetails, setPenaltyDetails] = useState('')
  const [startDate, setStartDate] = useState('') // NEW: Start Date State

  // Confirmation Modal State
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    type: null, // 'approve' or 'reject'
    requestId: null
  })

  // End Contract Confirmation Modal State
  const [endContractModal, setEndContractModal] = useState({
    isOpen: false,
    occupancy: null
  })

  // Landlord data states
  const [occupancies, setOccupancies] = useState([])
  const [pendingEndRequests, setPendingEndRequests] = useState([])
  const [dashboardTasks, setDashboardTasks] = useState({ maintenance: [], payments: [] })

  const router = useRouter()

  // Auto-slide images
  useEffect(() => {
    if (properties.length === 0) return
    const interval = setInterval(() => {
      setCurrentImageIndex(prev => {
        const newIndex = { ...prev }
        properties.forEach(property => {
          if (property.images && Array.isArray(property.images) && property.images.length > 1) {
            const currentIdx = prev[property.id] || 0
            newIndex[property.id] = (currentIdx + 1) % property.images.length
          }
        })
        return newIndex
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [properties])

  useEffect(() => {
    if (profile) {
      loadProperties()
      loadOccupancies()
      loadPendingEndRequests()
      loadDashboardTasks()
    }
    fetch('/api/manual-reminders').catch(err => console.error("Reminder check failed", err));
  }, [profile])

  async function loadProperties() {
    if (properties.length === 0) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    let query = supabase
      .from('properties')
      .select('*, landlord_profile:profiles!properties_landlord_fkey(id, first_name, middle_name, last_name, role)')
      .eq('landlord', session.user.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) console.error('Error loading properties:', error)
    setProperties(data || [])
    setLoading(false)
    setRefreshing(false)
  }

  async function loadDashboardTasks() {
    const { data: myProps } = await supabase.from('properties').select('id, title').eq('landlord', session.user.id)
    if (!myProps || myProps.length === 0) return

    const propIds = myProps.map(p => p.id)
    const propMap = myProps.reduce((acc, p) => ({ ...acc, [p.id]: p.title }), {})

    const { data: maint } = await supabase
      .from('maintenance_requests')
      .select('id, title, status, created_at, property_id')
      .in('property_id', propIds)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(5)

    const { data: payments } = await supabase
      .from('payment_requests')
      .select('id, amount, status, due_date, property_id')
      .in('property_id', propIds)
      .in('status', ['pending', 'pending_confirmation'])
      .order('due_date', { ascending: true })
      .limit(5)

    setDashboardTasks({
      maintenance: maint?.map(m => ({ ...m, property_title: propMap[m.property_id] })) || [],
      payments: payments?.map(p => ({ ...p, property_title: propMap[p.property_id] })) || []
    })
  }

  async function loadPendingEndRequests() {
    const { data } = await supabase.from('tenant_occupancies').select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone), property:properties(id, title, address)`).eq('landlord_id', session.user.id).eq('end_request_status', 'pending')
    setPendingEndRequests(data || [])
  }

  async function loadOccupancies() {
    const { data } = await supabase.from('tenant_occupancies').select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone), property:properties(id, title)`).eq('landlord_id', session.user.id).eq('status', 'active')
    setOccupancies(data || [])
  }

  function getPropertyOccupancy(propertyId) { return occupancies.find(o => o.property_id === propertyId) }

  const getPropertyImages = (property) => {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) return property.images
    return []
  }

  const handlePropertyAction = (propertyId) => {
    router.push(`/properties/edit/${propertyId}`)
  }

  async function loadAcceptedApplicationsForProperty(propertyId) {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('property_id', propertyId)
      .eq('status', 'approved')

    if (error) {
      console.error("Error loading bookings:", error)
      return
    }

    if (!bookings || bookings.length === 0) {
      setAcceptedApplications([])
      return
    }

    const tenantIds = bookings.map(b => b.tenant)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, middle_name, last_name, phone')
      .in('id', tenantIds)

    const profileMap = {}
    profiles?.forEach(p => profileMap[p.id] = p)

    const candidates = bookings.map(b => ({
      ...b,
      tenant_profile: profileMap[b.tenant]
    })).filter(item => item.tenant && item.tenant_profile)

    setAcceptedApplications(candidates)
  }

  function openAssignModal(property) {
    setSelectedProperty(property);
    loadAcceptedApplicationsForProperty(property.id);
    setPenaltyDetails('');
    setStartDate(new Date().toISOString().split('T')[0]); // Default to today
    setShowAssignModal(true)
  }

  async function assignTenant(candidate) {
    if (!candidate.tenant || !candidate.tenant_profile) {
      showToast.error("Invalid tenant", { duration: 4000, transition: "bounceIn" });
      return
    }

    if (!startDate) {
      showToast.error("Please select a start date", { duration: 4000, transition: "bounceIn" });
      return
    }

    // UPDATED: Use selected startDate
    const { error } = await supabase.from('tenant_occupancies').insert({
      property_id: selectedProperty.id,
      tenant_id: candidate.tenant,
      landlord_id: session.user.id,
      status: 'active',
      start_date: new Date(startDate).toISOString()
    })

    if (error) {
      console.error('Assign Tenant Error:', error);
      showToast.error('Failed to assign tenant. Check console.', { duration: 4000, transition: "bounceIn" });
      return
    }

    await supabase.from('properties').update({ status: 'occupied' }).eq('id', selectedProperty.id)

    // UPDATED: Notification message includes start date
    let message = `You have been assigned to occupy "${selectedProperty.title}" starting from ${new Date(startDate).toLocaleDateString()}.`
    if (penaltyDetails && penaltyDetails.trim() !== "") {
      message += ` House rent bill due date penalty: ${penaltyDetails}`
    }

    await createNotification({
      recipient: candidate.tenant,
      actor: session.user.id,
      type: 'occupancy_assigned',
      message: message,
      link: '/maintenance'
    })

    if (candidate.tenant_profile.phone) {
      fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: candidate.tenant_profile.phone,
          message: message
        })
      }).catch(err => console.error("SMS Error:", err));
    }

    // --- NEW CODE: Send Email ---
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: candidate.id, // Using the booking ID to look up details
        type: 'assignment',      // New type we will handle in the API
        customMessage: message
      })
    }).catch(err => console.error("Email Error:", err));

    showToast.success('Tenant assigned!', { duration: 4000, transition: "bounceIn" });
    setShowAssignModal(false);
    loadProperties();
    loadOccupancies();
  }

  async function cancelAssignment(booking) {
    if (!confirm(`Cancel assignment for ${booking.tenant_profile?.first_name}?`)) return

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'rejected' })
      .eq('id', booking.id)

    if (error) {
      showToast.error('Failed to cancel assignment', { duration: 4000, transition: "bounceIn" });
      return
    }

    await createNotification({
      recipient: booking.tenant,
      actor: session.user.id,
      type: 'booking_rejected',
      message: `The assignment for "${selectedProperty.title}" was cancelled.`,
      link: '/bookings'
    })

    showToast.success('Cancelled', { duration: 4000, transition: "bounceIn" });
    loadAcceptedApplicationsForProperty(selectedProperty.id)
  }

  function openEndContractModal(occupancy) {
    setEndContractModal({ isOpen: true, occupancy })
  }

  async function confirmEndContract() {
    const occupancy = endContractModal.occupancy
    if (!occupancy) return

    setEndContractModal({ isOpen: false, occupancy: null })

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({ status: 'ended', end_date: new Date().toISOString() })
      .eq('id', occupancy.id)

    if (error) {
      showToast.error(`Failed: ${error.message}`, { duration: 4000, transition: "bounceIn" });
      return
    }

    await supabase.from('properties').update({ status: 'available' }).eq('id', occupancy.property_id)

    // Mark the tenant's booking as completed so they can book new viewings
    await supabase.from('bookings')
      .update({ status: 'completed' })
      .eq('tenant', occupancy.tenant_id)
      .eq('property_id', occupancy.property_id)
      .in('status', ['pending', 'pending_approval', 'approved', 'accepted', 'cancelled'])

    // Also mark the application as completed so 'Ready to Book' disappears
    await supabase.from('applications')
      .update({ status: 'completed' })
      .eq('tenant', occupancy.tenant_id)
      .eq('property_id', occupancy.property_id)
      .eq('status', 'accepted')

    // Notification Message
    const message = `Your contract for "${occupancy.property?.title}" has been ended by the landlord. Please vacate the premises.`

    // 1. In-App
    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'occupancy_ended', message: message, link: '/dashboard' })

    // 2. SMS
    if (occupancy.tenant?.phone) {
      fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: occupancy.tenant.phone, message })
      }).catch(err => console.error("SMS Error:", err));
    }

    // 3. Email
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        occupancyId: occupancy.id, // Using occupancyId
        type: 'end_contract',
        customMessage: message
      })
    }).catch(err => console.error("Email Error:", err));

    showToast.success('Contract ended successfully', { duration: 4000, transition: "bounceIn" });
    loadProperties(); loadOccupancies()
  }

  // --- CONFIRMATION HANDLERS ---

  function openEndConfirmation(type, requestId) {
    setConfirmationModal({ isOpen: true, type, requestId })
  }

  function handleConfirmEndAction() {
    if (confirmationModal.type === 'approve') {
      approveEndRequest(confirmationModal.requestId)
    } else if (confirmationModal.type === 'reject') {
      rejectEndRequest(confirmationModal.requestId)
    }
    setConfirmationModal({ isOpen: false, type: null, requestId: null })
  }

  // --- ACTION FUNCTIONS ---

  async function approveEndRequest(occupancyId) {
    const occupancy = pendingEndRequests.find(o => o.id === occupancyId);
    if (!occupancy) return

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({
        status: 'ended',
        end_date: new Date().toISOString(),
        end_request_status: 'approved'
      })
      .eq('id', occupancyId)

    if (error) {
      showToast.error(`Failed: ${error.message}`, { duration: 4000, transition: "bounceIn" });
      return
    }

    await supabase.from('properties').update({ status: 'available' }).eq('id', occupancy.property_id)

    // Mark the tenant's booking as completed so they can book new viewings
    await supabase.from('bookings')
      .update({ status: 'completed' })
      .eq('tenant', occupancy.tenant_id)
      .eq('property_id', occupancy.property_id)
      .in('status', ['pending', 'pending_approval', 'approved', 'accepted', 'cancelled'])

    // Also mark the application as completed so 'Ready to Book' disappears
    await supabase.from('applications')
      .update({ status: 'completed' })
      .eq('tenant', occupancy.tenant_id)
      .eq('property_id', occupancy.property_id)
      .eq('status', 'accepted')

    // Notification Message
    const message = `Your request to move out of "${occupancy.property?.title}" has been APPROVED. The contract is now ended.`

    // 1. In-App
    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'end_request_approved', message: message, link: '/dashboard' })

    // 2. SMS
    if (occupancy.tenant?.phone) {
      fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: occupancy.tenant.phone, message })
      }).catch(err => console.error("SMS Error:", err));
    }

    // 3. Email
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        occupancyId: occupancyId, // Using occupancyId
        type: 'end_contract',
        customMessage: message
      })
    }).catch(err => console.error("Email Error:", err));

    showToast.success('Approved successfully', { duration: 4000, transition: "bounceIn" });
    loadPendingEndRequests(); loadOccupancies(); loadProperties()
  }

  async function rejectEndRequest(occupancyId) {
    const occupancy = pendingEndRequests.find(o => o.id === occupancyId);
    if (!occupancy) return

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({
        status: 'active',
        end_request_status: 'rejected',
        end_requested_at: null,
        end_request_reason: null,
        end_request_date: null
      })
      .eq('id', occupancyId)

    if (error) {
      console.error('Reject End Request Error:', error);
      showToast.error(`Failed to reject: ${error.message}`, { duration: 4000, transition: "bounceIn" });
      return
    }

    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'end_request_rejected', message: `End occupancy request for "${occupancy.property?.title}" rejected.`, link: '/dashboard' })
    showToast.success('Request rejected', { duration: 4000, transition: "bounceIn" });
    loadPendingEndRequests()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col scroll-smooth">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10 flex-1 w-full">

        {/* NEW LAYOUT: STACKED (Tasks on Top, Properties Below) */}
        <div className="flex flex-col gap-10 mt-4">

          {/* SECTION 1: DASHBOARD OVERVIEW (Tasks) */}
          <div className="w-full">
            <h3 className="text-xl font-black text-gray-900 mb-4 px-1 uppercase tracking-tight">Dashboard Action Center</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              {/* 1. Pending Move-Out Requests */}
              <div className="bg-white rounded-3xl shadow-sm border border-orange-100 overflow-hidden h-full flex flex-col">
                <div className="px-5 py-4 border-b border-orange-100 bg-orange-50/50 flex items-center justify-between">
                  <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                    Move-Out Requests
                  </h4>
                  {pendingEndRequests.length > 0 && <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{pendingEndRequests.length}</span>}
                </div>
                {pendingEndRequests.length === 0 ? (
                  <div className="p-8 text-center flex-1 flex items-center justify-center">
                    <p className="text-sm text-gray-400 italic">No pending requests</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
                    {pendingEndRequests.map(request => (
                      <div key={request.id} className="p-4 flex flex-col gap-3">
                        <div>
                          <p className="font-bold text-gray-900 text-sm mb-0.5">{request.property?.title}</p>
                          <p className="text-xs text-gray-500 mb-2">{request.tenant?.first_name} {request.tenant?.last_name}</p>

                          {request.end_request_date && (
                            <p className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded inline-block mb-1">
                              Requested Date: {new Date(request.end_request_date).toLocaleDateString()}
                            </p>
                          )}
                          {request.end_request_reason && (
                            <p className="text-xs text-gray-600 italic mt-1 bg-gray-50 p-2 rounded border border-gray-100">
                              "{request.end_request_reason}"
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => openEndConfirmation('approve', request.id)} className="flex-1 py-1.5 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 shadow-lg shadow-black/20 cursor-pointer">Approve</button>
                          <button onClick={() => openEndConfirmation('reject', request.id)} className="flex-1 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Pending Maintenance */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    Pending Maintenance
                  </h4>
                  {dashboardTasks.maintenance.length > 0 && <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{dashboardTasks.maintenance.length}</span>}
                </div>
                <div className="divide-y divide-gray-100 flex-1 flex flex-col">
                  {dashboardTasks.maintenance.length === 0 ? (
                    <div className="p-8 text-center flex-1 flex items-center justify-center">
                      <p className="text-sm text-gray-400 italic">All caught up!</p>
                    </div>
                  ) : (
                    <div className="flex-1">
                      {dashboardTasks.maintenance.map(task => (
                        <div key={task.id} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => router.push('/maintenance')}>
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-sm font-bold text-gray-900 line-clamp-1 group-hover:text-blue-600 transition-colors">{task.title}</p>
                            <span className="text-[9px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">{task.status}</span>
                          </div>
                          <p className="text-xs text-gray-500 mb-2 truncate">{task.property_title}</p>
                          <p className="text-[10px] text-gray-400">{new Date(task.created_at).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="p-3 text-center border-t border-gray-50 bg-gray-50/50 mt-auto">
                    <button onClick={() => router.push('/maintenance')} className="text-xs font-bold text-gray-600 hover:text-black cursor-pointer">View All Requests</button>
                  </div>
                </div>
              </div>

              {/* 3. Pending Payments */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    Pending Payments Approval
                  </h4>
                  {dashboardTasks.payments.length > 0 && <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">{dashboardTasks.payments.length}</span>}
                </div>
                <div className="divide-y divide-gray-100 flex-1 flex flex-col">
                  {dashboardTasks.payments.length === 0 ? (
                    <div className="p-8 text-center flex-1 flex items-center justify-center">
                      <p className="text-sm text-gray-400 italic">No pending bills</p>
                    </div>
                  ) : (
                    <div className="flex-1">
                      {dashboardTasks.payments.map(pay => (
                        <div key={pay.id} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => router.push('/payments')}>
                          <div className="flex justify-between items-center mb-1">
                            <p className="text-sm font-bold text-gray-900 group-hover:text-green-600 transition-colors">₱{pay.amount?.toLocaleString()}</p>
                            <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">{pay.status}</span>
                          </div>
                          <p className="text-xs text-gray-500 mb-1 truncate">{pay.property_title}</p>
                          <p className="text-[10px] text-red-500 font-medium">Due: {new Date(pay.due_date).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="p-3 text-center border-t border-gray-50 bg-gray-50/50 mt-auto">
                    <button onClick={() => router.push('/payments')} className="text-xs font-bold text-gray-600 hover:text-black">View All Payments</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: PROPERTIES (Full Width) */}
          <div className="w-full">
            <div className="mb-0">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <div className="mb-2 sm:mb-0 w-full sm:w-auto">
                  <h2 className="text-3xl font-black text-black uppercase tracking-tight">Your Properties</h2>
                  <div className="flex items-center gap-2">
                    <p className="text-gray-500 text-sm mt-1">Manage listings, assignments, and property details.</p>
                    {refreshing && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full animate-pulse">Updating...</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => router.push('/properties/new')}
                    className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-2xl shadow-xl shadow-black/10 hover:shadow-black/20 text-sm font-bold cursor-pointer hover:bg-gray-800 transition-all transform hover:-translate-y-0.5"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add New Property
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white rounded-3xl h-[300px] animate-pulse border border-gray-100"></div>
                  ))}
                </div>
              ) : properties.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100 h-[400px] flex flex-col items-center justify-center">
                  <div className="w-20 h-20 mx-auto mb-6 bg-gray-50 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No properties yet</h3>
                  <p className="text-gray-500 mb-8 max-w-sm mx-auto">You don't have any properties created.</p>
                </div>
              ) : (
                // LANDLORD SPECIFIC GRID - Full width allows for 4 cols on XL screens
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
                  {properties.map((item) => {
                    const property = item
                    const images = getPropertyImages(property)
                    const currentIndex = currentImageIndex[property.id] || 0
                    const occupancy = getPropertyOccupancy(property.id)

                    return (
                      <div
                        key={property.id}
                        className="group bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer flex flex-col"
                        onClick={() => handlePropertyAction(property.id)}
                      >
                        <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                          <img src={images[currentIndex]} alt={property.title} className="w-full h-full object-cover" />

                          {images.length > 1 && (
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                              {images.map((_, idx) => (
                                <div key={idx} className={`h-1 rounded-full transition-all duration-300 shadow-sm ${idx === currentIndex ? 'w-4 bg-white' : 'w-1 bg-white/60'}`} />
                              ))}
                            </div>
                          )}

                          <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10 flex flex-col gap-1">
                            <span className={`px-2 py-0.5 sm:px-3 sm:py-1 text-[8px] sm:text-[10px] uppercase font-bold tracking-wider rounded-lg shadow-sm backdrop-blur-md border border-white/20 ${property.status === 'available' ? 'bg-white/90 text-black' : 'bg-black/80 text-white'}`}>
                              {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
                            </span>
                          </div>
                        </div>

                        <div className="p-2 sm:p-4 flex flex-col flex-1">
                          <div className="mb-2 sm:mb-3">
                            <div className="flex justify-between items-start mb-0.5 sm:mb-1">
                              <h3 className="text-sm sm:text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-1.5 text-gray-500 text-[10px] sm:text-xs">
                              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              <span className="truncate">{property.city}, Philippines</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 sm:gap-3 text-gray-700 text-[10px] sm:text-xs bg-gray-50 p-2 sm:p-2.5 rounded-xl mb-3 sm:mb-4">
                            <span className="flex items-center gap-1 font-bold">
                              <svg
                                className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
                              </svg>{property.bedrooms}
                            </span>
                            <span className="w-px h-3 bg-gray-300"></span>
                            <span className="flex items-center gap-1 font-bold">
                              <svg
                                className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" />
                              </svg>{property.bathrooms}
                            </span>
                            <span className="w-px h-3 bg-gray-300"></span>
                            <span className="flex items-center gap-1 font-bold">
                              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                              {property.area_sqft}
                            </span>
                          </div>

                          <div className="mt-auto">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                                <div className="flex items-baseline gap-1">
                                  <p className="text-base sm:text-lg font-black text-black">
                                    ₱{Number(property.price).toLocaleString()}
                                  </p>
                                  <span className="text-sm text-gray-600">/Monthly</span>
                                </div>                              <button onClick={(e) => { e.stopPropagation(); router.push(`/properties/${property.id}`); }} className="text-[10px] sm:text-xs font-bold text-gray-400 hover:text-black hover:underline cursor-pointer" title="Preview">
                                View Details
                              </button>
                            </div>

                            <div className="pt-2 sm:pt-3 border-t border-gray-100">
                              {occupancy ? (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-700">
                                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500 animate-pulse"></div>
                                    <span className="font-bold truncate max-w-[80px] sm:max-w-[100px]">{occupancy.tenant?.first_name}</span>
                                  </div>
                                  <button onClick={(e) => { e.stopPropagation(); openEndContractModal(occupancy) }} className="text-[9px] sm:text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg cursor-pointer transition-colors">End Contract</button>
                                </div>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); openAssignModal(property); }} className="w-full py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-xl transition-colors text-center cursor-pointer flex items-center justify-center gap-1 sm:gap-2">
                                  <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                  Assign Tenant
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Confirmation Modal */}
      {confirmationModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-gray-200">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${confirmationModal.type === 'approve' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {confirmationModal.type === 'approve' ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              )}
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {confirmationModal.type === 'approve' ? 'Approve Move-Out?' : 'Reject Request?'}
            </h3>

            <p className="text-sm text-gray-500 mb-6">
              {confirmationModal.type === 'approve'
                ? 'Are you sure you want to approve this request? The contract will be ended and the property will be marked as available.'
                : 'Are you sure you want to reject this request? The tenant will remain in the property and the contract will continue.'}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmationModal({ isOpen: false, type: null, requestId: null })}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEndAction}
                className={`flex-1 px-4 py-2 text-white font-bold rounded-xl cursor-pointer shadow-lg ${confirmationModal.type === 'approve' ? 'bg-black hover:bg-gray-800' : 'bg-red-600 hover:bg-red-700'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && selectedProperty && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl text-gray-900">Assign Tenant</h3>
              <button onClick={() => setShowAssignModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer text-gray-500 hover:text-black transition-colors">✕</button>
            </div>

            {/* Start Date Input */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Start Date</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black transition-colors"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* Penalty Input */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">House Rent Bill Due Date Penalty</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black transition-colors"
                placeholder="e.g. 5% surcharge per day"
                value={penaltyDetails}
                onChange={(e) => setPenaltyDetails(e.target.value)}
              />
              <p className="text-[10px] text-gray-400 mt-1">This will be sent to the tenant in the notification.</p>
            </div>

            <div className="overflow-y-auto space-y-3">
              {acceptedApplications.map(app => (
                <div key={app.id} className="p-4 border border-gray-100 rounded-2xl hover:bg-gray-50 flex justify-between items-center cursor-default transition-colors">
                  <div>
                    <p className="font-bold text-sm text-gray-900">{app.tenant_profile?.first_name} {app.tenant_profile?.last_name}</p>
                    <p className="text-xs text-gray-500">{app.tenant_profile?.phone}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => cancelAssignment(app)} className="text-xs bg-white text-red-600 border border-red-100 px-3 py-2 rounded-xl cursor-pointer hover:bg-red-50 font-bold transition-colors">Cancel</button>
                    <button onClick={() => assignTenant(app)} className="text-xs bg-black text-white px-3 py-2 rounded-xl cursor-pointer hover:bg-gray-800 font-bold shadow-md transition-all transform active:scale-95">Assign</button>
                  </div>
                </div>
              ))}
              {acceptedApplications.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm">No approved bookings found.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* End Contract Confirmation Modal */}
      {endContractModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-gray-200">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-red-100 text-red-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">End Contract?</h3>

            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to end the contract for <strong>{endContractModal.occupancy?.tenant?.first_name} {endContractModal.occupancy?.tenant?.last_name}</strong>?
              This action cannot be undone. The tenant will be notified and the property will be marked as available.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setEndContractModal({ isOpen: false, occupancy: null })}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmEndContract}
                className="flex-1 px-4 py-2 text-white font-bold rounded-xl cursor-pointer shadow-lg bg-red-600 hover:bg-red-700"
              >
                End Contract
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}