import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import { createNotification } from '../lib/notifications'

export default function Dashboard() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState({})
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [acceptedApplications, setAcceptedApplications] = useState([])
  const [occupancies, setOccupancies] = useState([])
  
  // Tenant occupancy states
  const [tenantOccupancy, setTenantOccupancy] = useState(null)
  const [showEndRequestModal, setShowEndRequestModal] = useState(false)
  const [endRequestReason, setEndRequestReason] = useState('')
  const [submittingEndRequest, setSubmittingEndRequest] = useState(false)
  
  // Review Modal States
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewTarget, setReviewTarget] = useState(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  // Landlord states
  const [pendingEndRequests, setPendingEndRequests] = useState([])
  const [propertySummaries, setPropertySummaries] = useState({})
  
  // Search & Filter State (Tenants Only)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAmenities, setSelectedAmenities] = useState([])
  const [isExpanded, setIsExpanded] = useState(false) 
  
  // --- Filter Dropdown State ---
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const filterRef = useRef(null)
  
  // --- Comparison Feature State ---
  const [comparisonList, setComparisonList] = useState([])

  const router = useRouter()

  const filterAmenities = [
    'Wifi', 'Pool', 'Gym', 'Parking', 'Air conditioning', 'Pet friendly'
  ]

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
      } else {
        router.push('/')
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session)
        loadProfile(session.user.id)
      } else {
        router.push('/')
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [router])

  useEffect(() => {
    if (profile) {
      loadProperties()
      if (profile.role === 'landlord') {
        loadOccupancies()
        loadPendingEndRequests()
        loadPropertySummaries()
      } else if (profile.role === 'tenant') {
        loadTenantOccupancy()
        checkPendingReviews(session.user.id)
      }
    }
  }, [profile])
  
  // Click outside to close filter dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setShowFilterDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [filterRef]);

  // Real-time Search (Tenants)
  useEffect(() => {
    if (profile && profile.role === 'tenant') {
      const delayDebounceFn = setTimeout(() => {
        const shouldExpand = searchQuery.length > 0 ? true : isExpanded
        if (searchQuery.length > 0 && !isExpanded) setIsExpanded(true)
        loadProperties(shouldExpand)
      }, 300)
      return () => clearTimeout(delayDebounceFn)
    }
  }, [searchQuery, selectedAmenities])

  async function checkPendingReviews(userId) {
    const { data: endedOccupancies } = await supabase
      .from('tenant_occupancies')
      .select('*, property:properties(id, title)')
      .eq('tenant_id', userId)
      .eq('status', 'ended')
    
    if (!endedOccupancies || endedOccupancies.length === 0) return

    const { data: existingReviews } = await supabase
      .from('reviews')
      .select('occupancy_id')
      .eq('tenant_id', userId)
    
    const reviewedOccupancyIds = existingReviews?.map(r => r.occupancy_id) || []
    const unreviewed = endedOccupancies.find(o => !reviewedOccupancyIds.includes(o.id))

    if (unreviewed) {
      setReviewTarget(unreviewed)
      setShowReviewModal(true)
    }
  }

  async function submitReview() {
    if (!reviewTarget) return
    setSubmittingReview(true)

    const { error } = await supabase
      .from('reviews')
      .insert({
        property_id: reviewTarget.property_id,
        tenant_id: session.user.id,
        occupancy_id: reviewTarget.id,
        rating: reviewRating,
        comment: reviewComment,
        created_at: new Date().toISOString()
      })

    if (error) {
      toast.error('Failed to submit review')
      console.error(error)
    } else {
      toast.success('Review submitted successfully!')
      setShowReviewModal(false)
      checkPendingReviews(session.user.id)
    }
    setSubmittingReview(false)
  }

  const toggleAmenity = (amenity) => {
    setSelectedAmenities(prev => {
      return prev.includes(amenity)
        ? prev.filter(a => a !== amenity)
        : [...prev, amenity]
    })
  }

  // --- NEW: Comparison Handlers ---
  const toggleComparison = (e, property) => {
    e.stopPropagation() 
    setComparisonList(prev => {
      const isSelected = prev.some(p => p.id === property.id)
      if (isSelected) {
        return prev.filter(p => p.id !== property.id)
      } else {
        if (prev.length >= 3) {
          toast.error("You can only compare up to 3 properties.")
          return prev
        }
        return [...prev, property]
      }
    })
  }

  const handleCompareClick = () => {
    const ids = comparisonList.map(p => p.id).join(',')
    router.push(`/compare?ids=${ids}`)
  }

  async function loadProperties(expanded = isExpanded) {
    setLoading(true)
    let query = supabase
      .from('properties')
      .select('*, landlord_profile:profiles!properties_landlord_fkey(id, first_name, middle_name, last_name, role)')
      .order('created_at', { ascending: false })

    if (profile?.role === 'landlord') {
      query = query.eq('landlord', session.user.id)
    } else {
      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%`)
      }
      if (selectedAmenities.length > 0) {
        query = query.contains('amenities', selectedAmenities)
      }
      if (!expanded && !searchQuery && selectedAmenities.length === 0) {
        query = query.limit(5)
      }
    }

    const { data, error } = await query
    if (error) console.error('Error loading properties:', error)
    setProperties(data || [])
    setLoading(false)
  }

  const handleSeeMore = () => { setIsExpanded(true); setSearchQuery(''); loadProperties(true) }
  const handleSeeFewer = () => { setIsExpanded(false); setSearchQuery(''); loadProperties(false) }
  const handleSearch = () => { setIsExpanded(true); loadProperties(true) }

  async function loadPropertySummaries() {
    const { data: myProps } = await supabase.from('properties').select('id, title').eq('landlord', session.user.id)
    if (!myProps || myProps.length === 0) return
    const summaries = {}
    for (const prop of myProps) {
      const { data: bills } = await supabase.from('payment_requests').select('id, status').eq('property_id', prop.id).in('status', ['pending', 'pending_confirmation'])
      const { data: maintenance } = await supabase.from('maintenance_requests').select('id, status').eq('property_id', prop.id).in('status', ['pending', 'in_progress'])
      summaries[prop.id] = { pendingBills: bills || [], maintenanceRequests: maintenance || [] }
    }
    setPropertySummaries(summaries)
  }

  async function loadTenantOccupancy() {
    const { data } = await supabase.from('tenant_occupancies').select(`*, property:properties(id, title, address, city, images), landlord:profiles!tenant_occupancies_landlord_id_fkey(id, first_name, middle_name, last_name)`).eq('tenant_id', session.user.id).in('status', ['active', 'pending_end']).maybeSingle()
    setTenantOccupancy(data)
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

  async function loadAcceptedApplicationsForProperty(propertyId) {
    const { data } = await supabase.from('applications').select(`*, tenant_profile:profiles!applications_tenant_fkey(id, first_name, middle_name, last_name, phone)`).eq('property_id', propertyId).eq('status', 'accepted').not('tenant', 'is', null)
    setAcceptedApplications((data || []).filter(app => app.tenant && app.tenant_profile))
  }

  function openAssignModal(property) { setSelectedProperty(property); loadAcceptedApplicationsForProperty(property.id); setShowAssignModal(true) }

  async function assignTenant(application) {
    if (!application.tenant || !application.tenant_profile) { toast.error('Invalid tenant'); return }
    const { error } = await supabase.from('tenant_occupancies').insert({ property_id: selectedProperty.id, tenant_id: application.tenant, landlord_id: session.user.id, application_id: application.id, status: 'active', start_date: new Date().toISOString() })
    if (error) { console.error('Assign Error:', error); toast.error('Failed to assign tenant'); return }
    await supabase.from('properties').update({ status: 'occupied' }).eq('id', selectedProperty.id)
    await createNotification({ recipient: application.tenant, actor: session.user.id, type: 'occupancy_assigned', message: `You have been assigned to occupy "${selectedProperty.title}".`, link: '/maintenance' })
    toast.success('Tenant assigned!'); setShowAssignModal(false); loadProperties(); loadOccupancies()
  }

  async function cancelAssignment(application) {
    if (!confirm(`Cancel assignment for ${application.tenant_profile?.first_name}?`)) return
    const { error } = await supabase.from('applications').update({ status: 'rejected' }).eq('id', application.id)
    if (error) { toast.error('Failed'); return }
    await createNotification({ recipient: application.tenant, actor: session.user.id, type: 'application_rejected', message: `The viewing for "${selectedProperty.title}" failed. Application cancelled.`, link: '/applications' })
    toast.success('Cancelled'); loadAcceptedApplicationsForProperty(selectedProperty.id)
  }

  async function kickOutTenant(occupancy) {
    if (!confirm(`Are you sure you want to end the contract for ${occupancy.tenant?.first_name}? This action cannot be undone.`)) return
    
    const { error } = await supabase
      .from('tenant_occupancies')
      .update({ status: 'ended', end_date: new Date().toISOString() })
      .eq('id', occupancy.id)

    if (error) {
      toast.error('Failed to end contract. Check permissions.')
      console.error(error)
      return
    }

    await supabase.from('properties').update({ status: 'available' }).eq('id', occupancy.property_id)
    await createNotification({ 
        recipient: occupancy.tenant_id, 
        actor: session.user.id, 
        type: 'occupancy_ended', 
        message: `Your contract for "${occupancy.property?.title}" has been ended by the landlord.`, 
        link: '/dashboard' 
    })
    
    toast.success('Contract ended successfully')
    loadProperties()
    loadOccupancies()
  }

  async function requestEndOccupancy() {
    if (!tenantOccupancy) return; setSubmittingEndRequest(true)
    const { error } = await supabase.from('tenant_occupancies').update({ status: 'pending_end', end_requested_at: new Date().toISOString(), end_request_reason: endRequestReason.trim() || 'No reason', end_request_status: 'pending' }).eq('id', tenantOccupancy.id)
    if (error) { toast.error('Failed to submit request'); setSubmittingEndRequest(false); return }
    await createNotification({ recipient: tenantOccupancy.landlord_id, actor: session.user.id, type: 'end_occupancy_request', message: `${profile.first_name} ${profile.last_name} requested to end occupancy at "${tenantOccupancy.property?.title}".`, link: '/dashboard' })
    toast.success('Request submitted'); setShowEndRequestModal(false); setEndRequestReason(''); setSubmittingEndRequest(false); loadTenantOccupancy()
  }

  async function approveEndRequest(occupancyId) {
    const occupancy = pendingEndRequests.find(o => o.id === occupancyId); if (!occupancy) return
    const { error } = await supabase.from('tenant_occupancies').update({ status: 'ended', end_date: new Date().toISOString(), end_request_status: 'approved' }).eq('id', occupancyId)
    if (error) { toast.error('Failed to approve'); return }
    await supabase.from('properties').update({ status: 'available' }).eq('id', occupancy.property_id)
    await supabase.from('applications').delete().eq('property_id', occupancy.property_id).eq('tenant', occupancy.tenant_id)
    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'end_request_approved', message: `End occupancy request for "${occupancy.property?.title}" approved.`, link: '/dashboard' })
    toast.success('Approved'); loadPendingEndRequests(); loadOccupancies(); loadProperties()
  }

  async function rejectEndRequest(occupancyId) {
    const occupancy = pendingEndRequests.find(o => o.id === occupancyId); if (!occupancy) return
    const { error } = await supabase.from('tenant_occupancies').update({ status: 'active', end_request_status: 'rejected', end_requested_at: null, end_request_reason: null }).eq('id', occupancyId)
    if (error) { toast.error('Failed to reject'); return }
    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'end_request_rejected', message: `End occupancy request for "${occupancy.property?.title}" rejected.`, link: '/dashboard' })
    toast.success('Rejected'); loadPendingEndRequests()
  }

  async function loadProfile(userId) {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      if(data) setProfile(data)
  }

  const getPropertyImages = (property) => {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) return property.images
    return []
  }

  const nextImage = (propertyId, imagesLength) => {
    setCurrentImageIndex(prev => ({ ...prev, [propertyId]: ((prev[propertyId] || 0) + 1) % imagesLength }))
  }

  const prevImage = (propertyId, imagesLength) => {
    setCurrentImageIndex(prev => ({ ...prev, [propertyId]: ((prev[propertyId] || 0) - 1 + imagesLength) % imagesLength }))
  }

  const handlePropertyAction = (propertyId) => {
    if (profile?.role === 'landlord') {
      router.push(`/properties/edit/${propertyId}`)
    } else {
      router.push(`/properties/${propertyId}`)
    }
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-black"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Hero Section */}
      <div className="bg-black text-white pt-10 pb-8 shadow-sm mb-5">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              {profile.role === 'landlord' ? 'Landlord Workspace' : 'Tenant Portal'}
            </span>
            <h1 className="text-3xl font-bold text-white">
              Welcome, {profile.first_name}!
            </h1>
            <p className="text-gray-400 text-sm">
              {profile.role === 'landlord' 
                ? 'Here is an overview of your properties and tenant requests.' 
                : 'Find your perfect home or manage your current stay.'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 mt-8 relative z-10">
        
        {/* Tenant Current Occupancy Section */}
        {profile.role === 'tenant' && tenantOccupancy && (
          <div className="mb-8 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
             {/* ... existing occupancy JSX ... */}
             <div className="bg-gradient-to-r from-gray-900 to-black px-6 py-4 border-b border-gray-800 flex justify-between items-center">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                  Your Current Residence
                </h3>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${tenantOccupancy.status === 'pending_end' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'}`}>
                  {tenantOccupancy.status === 'pending_end' ? 'Move-out Pending' : 'Active Resident'}
                </span>
             </div>
            <div className="p-4 md:p-6 flex flex-col md:flex-row gap-6">
              <div className="w-full md:w-1/3 aspect-video rounded-xl overflow-hidden bg-gray-100">
                 {tenantOccupancy.property?.images && tenantOccupancy.property.images.length > 0 ? (
                   <img src={tenantOccupancy.property.images[0]} alt="Property" className="w-full h-full object-cover" />
                 ) : (
                   <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">No Image</div>
                 )}
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-2xl font-bold text-gray-900 mb-1">{tenantOccupancy.property?.title}</h4>
                  <p className="text-gray-500 flex items-center gap-1.5 mb-4">
                     {tenantOccupancy.property?.address}, {tenantOccupancy.property?.city}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-600 mb-6">
                     <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <span className="block text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Landlord</span>
                        <span className="font-medium text-gray-900">{tenantOccupancy.landlord?.first_name} {tenantOccupancy.landlord?.last_name}</span>
                     </div>
                     <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <span className="block text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Move-in Date</span>
                        <span className="font-medium text-gray-900">{new Date(tenantOccupancy.start_date).toLocaleDateString()}</span>
                     </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  {tenantOccupancy.status === 'pending_end' ? (
                    <div className="px-5 py-3 bg-yellow-50 text-yellow-800 rounded-xl border border-yellow-200 text-sm font-medium flex items-center gap-2">Move-out request awaiting approval</div>
                  ) : (
                    <button onClick={() => setShowEndRequestModal(true)} className="px-6 py-2.5 bg-white text-red-600 border border-red-100 hover:bg-red-50 hover:border-red-200 font-semibold rounded-xl cursor-pointer">Request to Move Out</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Landlord Pending Requests Section */}
        {profile.role === 'landlord' && pendingEndRequests.length > 0 && (
          <div className="mb-8 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
             {/* ... existing landlord requests JSX ... */}
             <div className="px-6 py-4 border-b border-gray-100 bg-orange-50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-orange-900 flex items-center gap-2">Pending Move-Out Requests</h3>
              <span className="bg-orange-200 text-orange-800 text-xs font-bold px-2.5 py-1 rounded-full">{pendingEndRequests.length}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {pendingEndRequests.map(request => (
                <div key={request.id} className="p-4 md:p-6 flex flex-col md:flex-row justify-between gap-6 items-start md:items-center">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 text-lg mb-1">{request.property?.title}</h4>
                    <p className="text-sm text-gray-500 mb-2">{request.tenant?.first_name} {request.tenant?.last_name} • Requested: {new Date(request.end_requested_at).toLocaleDateString()}</p>
                    {request.end_request_reason && <div className="bg-white p-2 rounded border text-sm text-gray-600 inline-block">Reason: {request.end_request_reason}</div>}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => rejectEndRequest(request.id)} className="px-4 py-2 bg-white text-gray-700 border border-gray-300 font-semibold rounded-xl text-sm cursor-pointer">Reject</button>
                    <button onClick={() => approveEndRequest(request.id)} className="px-5 py-2 bg-black text-white font-semibold rounded-xl text-sm cursor-pointer">Approve</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search and Filter Bar - ONLY FOR TENANTS */}
        {profile.role === 'tenant' && (
          <div className="flex flex-col gap-6 mb-8">
            <div className="w-full max-w-3xl mx-auto bg-white p-3 rounded-2xl shadow-lg border border-gray-100 flex flex-col sm:flex-row gap-3 items-center relative z-30">
              {/* Search Input */}
              <div className="relative flex-1 w-full">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <input 
                  type="text" 
                  placeholder="Search by city, address, or property..." 
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black text-sm font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
              </div>

              <div className="flex gap-2 w-full sm:w-auto items-center">
                {/* Filter Dropdown */}
                <div className="relative flex-1 sm:flex-none" ref={filterRef}>
                    <button 
                        onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                        className={`w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all border whitespace-nowrap cursor-pointer ${
                            showFilterDropdown || selectedAmenities.length > 0
                            ? 'bg-gray-900 text-white border-black' 
                            : 'bg-white text-gray-700 border-gray-200 hover:border-black'
                        }`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                        Filters
                        {selectedAmenities.length > 0 && (
                            <span className="bg-white text-black text-[10px] w-5 h-5 flex items-center justify-center rounded-full ml-1">
                                {selectedAmenities.length}
                            </span>
                        )}
                    </button>

                    {/* Dropdown Content */}
                    {showFilterDropdown && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 z-40 animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Amenities</h3>
                                {selectedAmenities.length > 0 && (
                                    <button 
                                        onClick={() => setSelectedAmenities([])}
                                        className="text-[10px] font-bold text-red-500 hover:text-red-700 underline"
                                    >
                                        Clear all
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1">
                                {filterAmenities.map(amenity => (
                                    <label key={amenity} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors">
                                        <div className="relative flex items-center">
                                            <input 
                                                type="checkbox" 
                                                className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 checked:bg-black checked:border-black transition-all"
                                                checked={selectedAmenities.includes(amenity)}
                                                onChange={() => toggleAmenity(amenity)}
                                            />
                                            <svg className="absolute w-3 h-3 pointer-events-none hidden peer-checked:block text-white left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                        </div>
                                        <span className="text-sm font-medium text-gray-700 group-hover:text-black transition-colors">{amenity}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Search Button */}
                <button 
                  onClick={handleSearch}
                  className="flex-1 sm:flex-none w-full sm:w-auto justify-center bg-black text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors shadow-md flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 border-b border-gray-100 pb-4">
            <div className="mb-4 sm:mb-0 w-full sm:w-auto">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-1">
                {profile.role === 'landlord' ? 'Your Properties' : (isExpanded ? 'All Properties' : 'Featured Properties')}
                </h2>
                <div className="w-16 h-1 bg-black mt-2"></div>
                {profile.role === 'landlord' && (
                  <p className="text-gray-500 text-sm mt-2">
                    Manage listings, assignments, and property details.
                  </p>
                )}
            </div>
            
<div className="flex gap-2 w-full sm:w-auto justify-end">              {profile.role === 'landlord' ? (
                  <button
                  onClick={() => router.push('/properties/new')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-full shadow-lg text-sm font-semibold cursor-pointer"
                  >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add New Property
                  </button>
              ) : (
                <>
                  {!isExpanded ? (
                    <button 
                      onClick={handleSeeMore}
                      className="group flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-black transition-colors cursor-pointer"
                    >
                      See More
                      <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </button>
                  ) : (
                    <button 
                      onClick={handleSeeFewer}
                      className="group flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-black transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                      </svg>
                      See Fewer
                    </button>
                  )}
                </>
              )}
            </div>
        </div>
        
        {loading ? (
          <div className="text-center py-20">
             <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-black"></div>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100">
             {/* ... no results JSX ... */}
             <div className="w-20 h-20 mx-auto mb-6 bg-gray-50 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No properties found</h3>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">
              {profile.role === 'landlord' 
                ? "You don't have any properties matching these filters." 
                : 'No properties match your search. Try adjusting your filters.'}
            </p>
            <button 
                onClick={() => { setSearchQuery(''); setSelectedAmenities([]) }}
                className="text-black font-bold underline text-sm"
            >
                Clear all filters
            </button>
          </div>
        ) : (
          /* Grid Layout - 5 Columns for Tenants, 3 Columns for Landlords */
          <div className={profile.role === 'tenant' ? 
              "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6" : 
              "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6"
            }>
            {properties.map((property) => {
              const images = getPropertyImages(property)
              const currentIndex = currentImageIndex[property.id] || 0
              const occupancy = getPropertyOccupancy(property.id)
              const isSelectedForCompare = comparisonList.some(p => p.id === property.id)
              
              return (
                <div 
                  key={property.id} 
                  className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer flex flex-col  transition-all duration-300 ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100'}`}
                  onClick={() => handlePropertyAction(property.id)}
                >
                  {/* Image Slider - Top */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                    <img 
                      src={images[currentIndex]} 
                      alt={property.title}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* --- NEW: Compare Checkbox --- */}
                    <div className="absolute top-3 right-3 z-20" onClick={(e) => e.stopPropagation()}>
                       <label className="flex items-center gap-2 cursor-pointer group/check">
                          <input 
                            type="checkbox" 
                            className="hidden"
                            checked={isSelectedForCompare}
                            onChange={(e) => toggleComparison(e, property)}
                          />
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all ${isSelectedForCompare ? 'bg-black text-white' : 'bg-white/90 text-gray-400 hover:bg-white'}`}>
                            {isSelectedForCompare ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            ) : (
                                <span className="text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover/check:opacity-100 transition-opacity absolute right-10 bg-black text-white px-2 py-1 rounded">Compare</span>
                            )}
                            {!isSelectedForCompare && (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            )}
                          </div>
                       </label>
                    </div>

                    {/* Navigation Arrows */}
                    {images.length > 1 && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button
                          onClick={(e) => { e.stopPropagation(); prevImage(property.id, images.length); }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-black w-7 h-7 flex items-center justify-center rounded-full shadow-md cursor-pointer"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); nextImage(property.id, images.length); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-black w-7 h-7 flex items-center justify-center rounded-full shadow-md cursor-pointer"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                    )}
                    
                    {/* Image Indicators */}
                    {images.length > 1 && (
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                        {images.map((_, idx) => (
                          <div
                            key={idx}
                            className={`h-1 rounded-full transition-all duration-300 shadow-sm ${
                              idx === currentIndex ? 'w-4 bg-white' : 'w-1 bg-white/60'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>

                    {/* Status Badge */}
                    <div className="absolute top-3 left-3 z-10">
                       <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-md shadow-sm backdrop-blur-md ${
                        property.status === 'available'
                          ? 'bg-white text-black' 
                          : 'bg-black/80 text-white'
                      }`}>
                        {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
                      </span>
                    </div>

                    {/* Price Overlay */}
                    <div className="absolute bottom-3 left-3 z-10 text-white">
                      <p className="text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
                      <p className="text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
                    </div>
                  </div>
                  
                  {/* Property Info - Bottom */}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="mb-3">
                        <div className="flex justify-between items-start mb-0.5">
                            <h3 className="text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
                        </div>
                        <div className="flex items-center gap-1 text-gray-500 text-xs">
                            <span className="truncate">{property.city}, Philippines</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 mb-4 text-gray-600 text-xs">
                       <span className="font-medium">{property.bedrooms} beds</span>
                       <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                       <span className="font-medium">{property.bathrooms} baths</span>
                       <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                       <span className="font-medium">{property.area_sqft} sqm</span>
                    </div>

                    <div className="mt-auto flex flex-col gap-2">
                        {profile.role === 'landlord' ? (
                          <div className="flex gap-2">
                             <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePropertyAction(property.id);
                              }}
                              className="flex-1 bg-black text-white py-2.5 px-3 rounded-xl text-xs font-bold shadow-md cursor-pointer"
                            >
                              Edit Details
                            </button>
                            <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/properties/${property.id}`);
                                }}
                                className="w-10 flex items-center justify-center bg-gray-100 text-black border border-gray-200 rounded-xl cursor-pointer"
                                title="Preview Public View"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePropertyAction(property.id);
                            }}
                            className="w-full bg-black text-white py-2.5 px-3 rounded-xl text-xs font-bold shadow-md cursor-pointer"
                          >
                            View Details
                          </button>
                        )}
                        
                        {/* Landlord Actions (Assign/Kick Out) */}
                        {profile.role === 'landlord' && (
                          <div className="pt-2 border-t border-gray-100">
                             {occupancy ? (
                                <div className="flex items-center justify-between bg-gray-50 px-2 py-1.5 rounded-lg">
                                   <div className="flex items-center gap-1.5 text-[10px] text-gray-600 truncate flex-1">
                                      <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                      <span className="truncate font-medium">{occupancy.tenant?.first_name}</span>
                                   </div>
                                   <button 
                                      onClick={(e) => { e.stopPropagation(); kickOutTenant(occupancy) }}
                                      className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded cursor-pointer transition-colors"
                                   >
                                      End Contract
                                   </button>
                                </div>
                             ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openAssignModal(property);
                                  }}
                                  className="w-full py-1.5 px-2 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-center cursor-pointer"
                                >
                                  Assign Tenant
                                </button>
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
      
      {/* --- NEW: Floating Compare Button --- */}
      {comparisonList.length > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40 animate-bounce-in">
          <button 
            onClick={handleCompareClick}
            className="bg-black text-white px-8 py-4 rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center gap-3 border-2 border-white/20"
          >
            <span className="relative">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-black">
                {comparisonList.length}
              </span>
            </span>
            <span className="font-bold text-sm uppercase tracking-wider">Compare Selected</span>
            {comparisonList.length < 2 && (
               <span className="text-xs text-gray-400 font-normal normal-case">(Select at least 2)</span>
            )}
          </button>
        </div>
      )}

      {/* End Request Modal & Assign Modal */}
      {showEndRequestModal && tenantOccupancy && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold mb-4">Request to Leave</h3>
              <textarea value={endRequestReason} onChange={(e) => setEndRequestReason(e.target.value)} placeholder="Reason..." className="w-full p-3 border rounded-xl mb-4" />
              <div className="flex gap-2">
                  <button onClick={() => setShowEndRequestModal(false)} className="flex-1 py-2 bg-gray-100 rounded-xl cursor-pointer">Cancel</button>
                  <button onClick={requestEndOccupancy} disabled={submittingEndRequest} className="flex-1 py-2 bg-black text-white rounded-xl cursor-pointer">Submit</button>
              </div>
          </div>
        </div>
      )}
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
                            <button 
                              onClick={() => cancelAssignment(app)} 
                              className="text-xs bg-red-50 text-red-600 border border-red-100 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-red-100"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => assignTenant(app)} 
                              className="text-xs bg-black text-white px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-800"
                            >
                              Assign
                            </button>
                          </div>
                      </div>
                  ))}
                  {acceptedApplications.length === 0 && <p className="text-center text-sm text-gray-500 py-4">No accepted applications.</p>}
              </div>
           </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && reviewTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in-95 duration-200">
             <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
             </div>
             <h2 className="text-2xl font-bold text-gray-900 mb-2">How was your stay?</h2>
             <p className="text-gray-500 text-sm mb-6">
                You recently ended your contract at <strong>{reviewTarget.property?.title}</strong>. Please leave a review to continue.
             </p>
             
             {/* Star Rating Input */}
             <div className="flex justify-center gap-2 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setReviewRating(star)}
                    className="focus:outline-none transition-transform hover:scale-110"
                  >
                    <svg className={`w-8 h-8 ${star <= reviewRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </button>
                ))}
             </div>

             <textarea
               value={reviewComment}
               onChange={(e) => setReviewComment(e.target.value)}
               placeholder="Write your experience here..."
               className="w-full p-4 border border-gray-200 rounded-xl mb-6 text-sm bg-gray-50 focus:bg-white focus:border-black outline-none resize-none h-32"
             />

             <button
                onClick={submitReview}
                disabled={submittingReview || !reviewComment.trim()}
                className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all ${
                  submittingReview || !reviewComment.trim()
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-black hover:bg-gray-800 hover:shadow-xl'
                }`}
             >
                {submittingReview ? 'Submitting...' : 'Submit Review'}
             </button>
          </div>
        </div>
      )}
    </div>
  )
}