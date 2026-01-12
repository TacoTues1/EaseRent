import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { createNotification } from '../lib/notifications'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Footer from './Footer'

export default function LandlordDashboard({ session, profile }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState({})
  
  // Modal States
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [acceptedApplications, setAcceptedApplications] = useState([])
  
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
  }, [profile])

  async function loadProperties() {
    setLoading(true)
    let query = supabase
      .from('properties')
      .select('*, landlord_profile:profiles!properties_landlord_fkey(id, first_name, middle_name, last_name, role)')
      .eq('landlord', session.user.id)
      .order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) console.error('Error loading properties:', error)
    setProperties(data || [])
    setLoading(false)
  }

  async function loadDashboardTasks() {
    const { data: myProps } = await supabase.from('properties').select('id, title').eq('landlord', session.user.id)
    if (!myProps || myProps.length === 0) return
    
    const propIds = myProps.map(p => p.id)
    const propMap = myProps.reduce((acc, p) => ({...acc, [p.id]: p.title}), {})

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
      maintenance: maint?.map(m => ({...m, property_title: propMap[m.property_id]})) || [],
      payments: payments?.map(p => ({...p, property_title: propMap[p.property_id]})) || []
    })
  }

  async function loadPendingEndRequests() {
    const { data } = await supabase.from('tenant_occupancies').select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone), property:properties(id, title, address)`).eq('landlord_id', session.user.id).eq('end_request_status', 'pending')
    setPendingEndRequests(data || [])
  }

  async function loadOccupancies() {
    const { data } = await supabase.from('tenant_occupancies').select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name), property:properties(id, title)`).eq('landlord_id', session.user.id).eq('status', 'active')
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
    const { data } = await supabase.from('applications').select(`*, tenant_profile:profiles!applications_tenant_fkey(id, first_name, middle_name, last_name, phone)`).eq('property_id', propertyId).eq('status', 'accepted').not('tenant', 'is', null)
    setAcceptedApplications((data || []).filter(app => app.tenant && app.tenant_profile))
  }

  function openAssignModal(property) { setSelectedProperty(property); loadAcceptedApplicationsForProperty(property.id); setShowAssignModal(true) }

  async function assignTenant(application) {
    if (!application.tenant || !application.tenant_profile) { 
    showToast.error("Invalid tenant", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

      return }
    const { error } = await supabase.from('tenant_occupancies').insert({ property_id: selectedProperty.id, tenant_id: application.tenant, landlord_id: session.user.id, application_id: application.id, status: 'active', start_date: new Date().toISOString() })
    if (error) { console.error('Assign Error:', error); 
      showToast.error('Failed to assign tenant', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      return }
    await supabase.from('properties').update({ status: 'occupied' }).eq('id', selectedProperty.id)
    await createNotification({ recipient: application.tenant, actor: session.user.id, type: 'occupancy_assigned', message: `You have been assigned to occupy "${selectedProperty.title}".`, link: '/maintenance' })
    showToast.success('Tenant assigned!', {
      duration: 4000,
      progress: true,
      position: "top-center",
      transition: "bounceIn",
      icon: '',
      sound: true,
    });
    setShowAssignModal(false); loadProperties(); loadOccupancies()
  }

  async function cancelAssignment(application) {
    if (!confirm(`Cancel assignment for ${application.tenant_profile?.first_name}?`)) return
    const { error } = await supabase.from('applications').update({ status: 'rejected' }).eq('id', application.id)
    if (error) { 
      showToast.error('Failed', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      return }
    await createNotification({ recipient: application.tenant, actor: session.user.id, type: 'application_rejected', message: `The viewing for "${selectedProperty.title}" failed. Application cancelled.`, link: '/applications' })
    showToast.success('Cancelled', {
      duration: 4000,
      progress: true,
      position: "top-center",
      transition: "bounceIn",
      icon: '',
      sound: true,
    });
    loadAcceptedApplicationsForProperty(selectedProperty.id)
  }

  async function kickOutTenant(occupancy) {
    if (!confirm(`Are you sure you want to end the contract for ${occupancy.tenant?.first_name}? This action cannot be undone.`)) return
    const { error } = await supabase.from('tenant_occupancies').update({ status: 'ended', end_date: new Date().toISOString() }).eq('id', occupancy.id)
    if (error) { 
      showToast.error('Failed to end contract. Check permissions.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      return }
    await supabase.from('properties').update({ status: 'available' }).eq('id', occupancy.property_id)
    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'occupancy_ended', message: `Your contract for "${occupancy.property?.title}" has been ended by the landlord.`, link: '/dashboard' })
    showToast.success('Contract ended successfully', {
      duration: 4000,
      progress: true,
      position: "top-center",
      transition: "bounceIn",
      icon: '',
      sound: true,
    });
    loadProperties(); loadOccupancies()
  }

  async function approveEndRequest(occupancyId) {
    const occupancy = pendingEndRequests.find(o => o.id === occupancyId); if (!occupancy) return
    const { error } = await supabase.from('tenant_occupancies').update({ status: 'ended', end_date: new Date().toISOString(), end_request_status: 'approved' }).eq('id', occupancyId)
    if (error) { 
      showToast.error('Failed to approve', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      return }
    await supabase.from('properties').update({ status: 'available' }).eq('id', occupancy.property_id)
    await supabase.from('applications').delete().eq('property_id', occupancy.property_id).eq('tenant', occupancy.tenant_id)
    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'end_request_approved', message: `End occupancy request for "${occupancy.property?.title}" approved.`, link: '/dashboard' })
    showToast.success('Approved', {
      duration: 4000,
      progress: true,
      position: "top-center",
      transition: "bounceIn",
      icon: '',
      sound: true,
    });
    loadPendingEndRequests(); loadOccupancies(); loadProperties()
  }

  async function rejectEndRequest(occupancyId) {
    const occupancy = pendingEndRequests.find(o => o.id === occupancyId); if (!occupancy) return
    const { error } = await supabase.from('tenant_occupancies').update({ status: 'active', end_request_status: 'rejected', end_requested_at: null, end_request_reason: null }).eq('id', occupancyId)
    if (error) { 
      showToast.error('Failed to reject', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      return }
    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'end_request_rejected', message: `End occupancy request for "${occupancy.property?.title}" rejected.`, link: '/dashboard' })
    showToast.success('Rejected', {
      duration: 4000,
      progress: true,
      position: "top-center",
      transition: "bounceIn",
      icon: '',
      sound: true,
    });
    loadPendingEndRequests()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col scroll-smooth">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10 flex-1">
        
        {/* LANDLORD SPLIT VIEW LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4">
            
            {/* LEFT PANEL: PROPERTIES */}
            <div className="lg:col-span-2">
              <div className="mb-0">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                    <div className="mb-2 sm:mb-0 w-full sm:w-auto">
                        <h2 className="text-2xl font-black text-black uppercase">Your Properties</h2>
                        <p className="text-gray-500 text-sm mt-1">Manage listings, assignments, and property details.</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => router.push('/properties/new')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-full shadow-lg text-sm font-semibold cursor-pointer hover:bg-gray-800"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Add New
                      </button>
                    </div>
                </div>

                {loading ? (
                  <div className="text-center py-20 h-[400px] flex items-center justify-center">
                     <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-black"></div>
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
                  // LANDLORD SPECIFIC GRID
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {properties.map((item) => {
                        const property = item
                        const images = getPropertyImages(property)
                        const currentIndex = currentImageIndex[property.id] || 0
                        const occupancy = getPropertyOccupancy(property.id)
                        
                        return (
                          <div 
                            key={property.id} 
                            className="group bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer flex flex-col transition-all duration-300"
                            onClick={() => handlePropertyAction(property.id)}
                          >
                            <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                              <img src={images[currentIndex]} alt={property.title} className="w-full h-full object-cover" />
                              
                              {images.length > 1 && (
                                <div className="absolute bottom-1.5 sm:bottom-2 md:bottom-3 left-1/2 -translate-x-1/2 flex gap-0.5 sm:gap-1 z-10">
                                  {images.map((_, idx) => (
                                    <div key={idx} className={`h-0.5 sm:h-1 rounded-full transition-all duration-300 shadow-sm ${idx === currentIndex ? 'w-3 sm:w-4 bg-white' : 'w-0.5 sm:w-1 bg-white/60'}`} />
                                  ))}
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>

                              <div className="absolute top-1.5 sm:top-2 md:top-3 left-1.5 sm:left-2 md:left-3 z-10 flex flex-col gap-0.5 sm:gap-1">
                                 <span className={`px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] uppercase font-bold tracking-wider rounded sm:rounded-md shadow-sm backdrop-blur-md ${property.status === 'available' ? 'bg-white text-black' : 'bg-black/80 text-white'}`}>
                                   {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
                                 </span>
                              </div>
                              <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-10 text-white">
                                <p className="text-sm sm:text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
                                <p className="text-[8px] sm:text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
                              </div>
                            </div>
                            
                            <div className="p-1.5 sm:p-2">
                              <div className="mb-0.5 sm:mb-1">
                                  <div className="flex justify-between items-start">
                                      <h3 className="text-xs sm:text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
                                  </div>
                                  <div className="flex items-center gap-1 text-gray-500 text-[10px] sm:text-xs">
                                      <span className="truncate">{property.city}, Philippines</span>
                                  </div>
                              </div>
                              
                              <div className="flex items-center gap-1.5 sm:gap-3 text-gray-600 text-[10px] sm:text-xs">
                                  <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>{property.bedrooms}</span>
                                  <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                                  <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>{property.bathrooms}</span>
                                  <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                                  <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>{property.area_sqft} sqm</span>
                              </div>

                              <div className="mt-auto flex flex-col gap-2 pt-2">
                                  <div className="flex gap-2">
                                     <button onClick={(e) => { e.stopPropagation(); handlePropertyAction(property.id); }} className="flex-1 bg-black text-white py-2.5 px-3 rounded-xl text-xs font-bold shadow-md cursor-pointer hover:bg-gray-800">Edit Details</button>
                                     <button onClick={(e) => { e.stopPropagation(); router.push(`/properties/${property.id}`); }} className="w-10 flex items-center justify-center bg-gray-100 text-black border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-200" title="Preview Public View">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                      </button>
                                  </div>
                                  <div className="pt-2 border-t border-gray-100">
                                     {occupancy ? (
                                        <div className="flex items-center justify-between bg-gray-50 px-2 py-1.5 rounded-lg">
                                           <div className="flex items-center gap-1.5 text-[10px] text-gray-600 truncate flex-1">
                                              <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                              <span className="truncate font-medium">{occupancy.tenant?.first_name}</span>
                                           </div>
                                           <button onClick={(e) => { e.stopPropagation(); kickOutTenant(occupancy) }} className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded cursor-pointer transition-colors">End Contract</button>
                                        </div>
                                     ) : (
                                        <button onClick={(e) => { e.stopPropagation(); openAssignModal(property); }} className="w-full py-1.5 px-2 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-center cursor-pointer">Assign Tenant</button>
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

            {/* RIGHT PANEL: TASKS */}
            <div className="lg:col-span-1 space-y-6">
              <div className="sticky top-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">Tasks & Attention</h3>

                {/* 1. Pending Move-Out Requests */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                  <div className="px-5 py-4 border-b border-gray-100 bg-orange-50 flex items-center justify-between">
                     <h4 className="font-bold text-orange-900 flex items-center gap-2 text-sm">Move-Out Requests</h4>
                     <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pendingEndRequests.length > 0 ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-500'}`}>{pendingEndRequests.length}</span>
                  </div>
                  {pendingEndRequests.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500 italic">No pending requests</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {pendingEndRequests.map(request => (
                        <div key={request.id} className="p-4 flex flex-col gap-3">
                           <div>
                              <p className="font-bold text-gray-900 text-sm mb-0.5">{request.property?.title}</p>
                              <p className="text-xs text-gray-500">{request.tenant?.first_name} {request.tenant?.last_name}</p>
                           </div>
                           <div className="flex gap-2">
                              <button onClick={() => approveEndRequest(request.id)} className="flex-1 py-1.5 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800">Approve</button>
                              <button onClick={() => rejectEndRequest(request.id)} className="flex-1 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50">Reject</button>
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Pending Maintenance */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                   <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                     <h4 className="font-bold text-gray-900 text-sm">Pending Maintenance</h4>
                     {dashboardTasks.maintenance.length > 0 && <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{dashboardTasks.maintenance.length}</span>}
                   </div>
                   <div className="divide-y divide-gray-100">
                      {dashboardTasks.maintenance.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-500 italic">All caught up!</div>
                      ) : (
                        dashboardTasks.maintenance.map(task => (
                           <div key={task.id} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => router.push('/maintenance')}>
                              <div className="flex justify-between items-start mb-1">
                                 <p className="text-sm font-semibold text-gray-900 line-clamp-1">{task.title}</p>
                                 <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">{task.status}</span>
                              </div>
                              <p className="text-xs text-gray-500 mb-2">{task.property_title}</p>
                              <p className="text-[10px] text-gray-400">{new Date(task.created_at).toLocaleDateString()}</p>
                           </div>
                        ))
                      )}
                      <div className="p-3 text-center border-t border-gray-50">
                         <button onClick={() => router.push('/maintenance')} className="text-xs font-bold text-blue-600 hover:text-blue-800">View All Requests</button>
                      </div>
                   </div>
                </div>

                 {/* 3. Pending Payments */}
                 <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                   <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                     <h4 className="font-bold text-gray-900 text-sm">Pending Payments</h4>
                     {dashboardTasks.payments.length > 0 && <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">{dashboardTasks.payments.length}</span>}
                   </div>
                   <div className="divide-y divide-gray-100">
                      {dashboardTasks.payments.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-500 italic">No pending bills</div>
                      ) : (
                        dashboardTasks.payments.map(pay => (
                           <div key={pay.id} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => router.push('/payments')}>
                              <div className="flex justify-between items-center mb-1">
                                 <p className="text-sm font-bold text-gray-900">₱{pay.amount?.toLocaleString()}</p>
                                 <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">{pay.status}</span>
                              </div>
                              <p className="text-xs text-gray-500 mb-1">{pay.property_title}</p>
                              <p className="text-[10px] text-red-500 font-medium">Due: {new Date(pay.due_date).toLocaleDateString()}</p>
                           </div>
                        ))
                      )}
                      <div className="p-3 text-center border-t border-gray-50">
                         <button onClick={() => router.push('/payments')} className="text-xs font-bold text-blue-600 hover:text-blue-800">View All Payments</button>
                      </div>
                   </div>
                </div>

              </div>
            </div>
        </div>

      </div>

      {/* Assign Modal */}
      {showAssignModal && selectedProperty && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col p-6">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold">Assign Tenant</h3>
                  <button onClick={() => setShowAssignModal(false)} className="cursor-pointer">✕</button>
              </div>
              <div className="overflow-y-auto space-y-2">
                  {acceptedApplications.map(app => (
                      <div key={app.id} className="p-3 border rounded-xl hover:bg-gray-50 flex justify-between items-center cursor-default">
                          <div>
                            <p className="font-bold text-sm">{app.tenant_profile?.first_name}</p>
                            <p className="text-xs text-gray-500">{app.tenant_profile?.phone}</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => cancelAssignment(app)} className="text-xs bg-red-50 text-red-600 border border-red-100 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-red-100">Cancel</button>
                            <button onClick={() => assignTenant(app)} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-800">Assign</button>
                          </div>
                      </div>
                  ))}
                  {acceptedApplications.length === 0 && <p className="text-center text-sm text-gray-500 py-4">No accepted applications.</p>}
              </div>
           </div>
        </div>
      )}

      <Footer />
    </div>
  )
}