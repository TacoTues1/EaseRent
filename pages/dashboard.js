import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast, { Toaster } from 'react-hot-toast'
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
  // Landlord end requests
  const [pendingEndRequests, setPendingEndRequests] = useState([])
  const [showEndRequestsModal, setShowEndRequestsModal] = useState(false)
  const router = useRouter()

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
      } else if (profile.role === 'tenant') {
        loadTenantOccupancy()
      }
    }
  }, [profile])

  // Load tenant's current occupancy
  async function loadTenantOccupancy() {
    const { data } = await supabase
      .from('tenant_occupancies')
      .select(`
        *,
        property:properties(id, title, address, city),
        landlord:profiles!tenant_occupancies_landlord_id_fkey(id, full_name)
      `)
      .eq('tenant_id', session.user.id)
      .in('status', ['active', 'pending_end'])
      .single()
    
    setTenantOccupancy(data)
  }

  // Load pending end requests for landlord
  async function loadPendingEndRequests() {
    const { data } = await supabase
      .from('tenant_occupancies')
      .select(`
        *,
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, full_name, phone),
        property:properties(id, title, address)
      `)
      .eq('landlord_id', session.user.id)
      .eq('end_request_status', 'pending')
    
    setPendingEndRequests(data || [])
  }

  // Load occupancies for landlord
  async function loadOccupancies() {
    const { data } = await supabase
      .from('tenant_occupancies')
      .select(`
        *,
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, full_name),
        property:properties(id, title)
      `)
      .eq('landlord_id', session.user.id)
      .eq('status', 'active')
    
    setOccupancies(data || [])
  }

  // Get occupancy for a property
  function getPropertyOccupancy(propertyId) {
    return occupancies.find(o => o.property_id === propertyId)
  }

  // Load accepted applications for a property
  async function loadAcceptedApplicationsForProperty(propertyId) {
    const { data } = await supabase
      .from('applications')
      .select(`
        *,
        tenant_profile:profiles!applications_tenant_fkey(id, full_name, phone)
      `)
      .eq('property_id', propertyId)
      .eq('status', 'accepted')
    
    setAcceptedApplications(data || [])
  }

  // Open assign tenant modal
  function openAssignModal(property) {
    setSelectedProperty(property)
    loadAcceptedApplicationsForProperty(property.id)
    setShowAssignModal(true)
  }

  // Assign tenant to property
  async function assignTenant(application) {
    const { error } = await supabase
      .from('tenant_occupancies')
      .insert({
        property_id: selectedProperty.id,
        tenant_id: application.tenant,
        landlord_id: session.user.id,
        application_id: application.id,
        status: 'active'
      })

    if (error) {
      console.error('Error assigning tenant:', error)
      toast.error('Failed to assign tenant')
      return
    }

    // Update property status to occupied
    await supabase
      .from('properties')
      .update({ status: 'occupied' })
      .eq('id', selectedProperty.id)

    // Notify tenant
    await createNotification({
      recipient: application.tenant,
      actor: session.user.id,
      type: 'occupancy_assigned',
      message: `You have been assigned to occupy "${selectedProperty.title}". You can now submit maintenance requests for this property.`,
      link: '/maintenance'
    })

    toast.success(`${application.tenant_profile?.full_name} assigned to property!`)
    setShowAssignModal(false)
    loadProperties()
    loadOccupancies()
  }

  // End tenant occupancy
  async function endOccupancy(propertyId) {
    const occupancy = getPropertyOccupancy(propertyId)
    if (!occupancy) return

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({ 
        status: 'ended',
        end_date: new Date().toISOString()
      })
      .eq('id', occupancy.id)

    if (error) {
      console.error('Error ending occupancy:', error)
      toast.error('Failed to end occupancy')
      return
    }

    // Update property status to available
    await supabase
      .from('properties')
      .update({ status: 'available' })
      .eq('id', propertyId)

    // Notify tenant
    await createNotification({
      recipient: occupancy.tenant_id,
      actor: session.user.id,
      type: 'occupancy_ended',
      message: `Your occupancy at "${occupancy.property?.title}" has ended.`,
      link: '/dashboard'
    })

    toast.success('Occupancy ended successfully!')
    loadProperties()
    loadOccupancies()
  }

  // Tenant requests to end occupancy
  async function requestEndOccupancy() {
    if (!tenantOccupancy) return
    setSubmittingEndRequest(true)

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({
        status: 'pending_end',
        end_requested_at: new Date().toISOString(),
        end_request_reason: endRequestReason.trim() || 'No reason provided',
        end_request_status: 'pending'
      })
      .eq('id', tenantOccupancy.id)

    if (error) {
      console.error('Error requesting end:', error)
      toast.error('Failed to submit end request')
      setSubmittingEndRequest(false)
      return
    }

    // Notify landlord
    await createNotification({
      recipient: tenantOccupancy.landlord_id,
      actor: session.user.id,
      type: 'end_occupancy_request',
      message: `${profile.full_name} has requested to end their occupancy at "${tenantOccupancy.property?.title}". Please review and approve/reject.`,
      link: '/dashboard'
    })

    toast.success('End occupancy request submitted! Waiting for landlord approval.')
    setShowEndRequestModal(false)
    setEndRequestReason('')
    setSubmittingEndRequest(false)
    loadTenantOccupancy()
  }

  // Landlord approves end request
  async function approveEndRequest(occupancyId) {
    const occupancy = pendingEndRequests.find(o => o.id === occupancyId)
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
      toast.error('Failed to approve end request')
      return
    }

    // Update property status to available
    await supabase
      .from('properties')
      .update({ status: 'available' })
      .eq('id', occupancy.property_id)

    // Delete the tenant's application for this property
    await supabase
      .from('applications')
      .delete()
      .eq('property_id', occupancy.property_id)
      .eq('tenant', occupancy.tenant_id)

    // Notify tenant
    await createNotification({
      recipient: occupancy.tenant_id,
      actor: session.user.id,
      type: 'end_request_approved',
      message: `Your request to end occupancy at "${occupancy.property?.title}" has been approved. You can now apply for other properties.`,
      link: '/dashboard'
    })

    toast.success('End request approved!')
    loadPendingEndRequests()
    loadOccupancies()
    loadProperties()
  }

  // Landlord rejects end request
  async function rejectEndRequest(occupancyId) {
    const occupancy = pendingEndRequests.find(o => o.id === occupancyId)
    if (!occupancy) return

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({
        status: 'active',
        end_request_status: 'rejected',
        end_requested_at: null,
        end_request_reason: null
      })
      .eq('id', occupancyId)

    if (error) {
      toast.error('Failed to reject end request')
      return
    }

    // Notify tenant
    await createNotification({
      recipient: occupancy.tenant_id,
      actor: session.user.id,
      type: 'end_request_rejected',
      message: `Your request to end occupancy at "${occupancy.property?.title}" has been rejected. Please contact your landlord for more information.`,
      link: '/dashboard'
    })

    toast.success('End request rejected')
    loadPendingEndRequests()
  }

  // Auto-slide images every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      properties.forEach(property => {
        const images = getPropertyImages(property)
        if (images.length > 1) {
          nextImage(property.id, images.length)
        }
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [properties])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (data) {
      setProfile(data)
    } else {
      // Profile doesn't exist (e.g., Google sign-in user), create one
      const user = session?.user || (await supabase.auth.getUser()).data.user
      const { data: newProfile, error } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          full_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User',
          role: 'tenant' // Default role for new users
        })
        .select()
        .single()
      
      if (newProfile) setProfile(newProfile)
    }
  }

  async function loadProperties() {
    setLoading(true)
    
    let query = supabase
      .from('properties')
      .select('*, landlord_profile:profiles!properties_landlord_fkey(id, full_name, role)')
      .order('created_at', { ascending: false })

    // If landlord, show their own properties (all statuses)
    if (profile?.role === 'landlord') {
      query = query.eq('landlord', session.user.id)
    }
    // Tenants see all properties regardless of status

    const { data, error } = await query
    
    if (error) {
      console.error('Error loading properties:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
    }
    // console.log('Dashboard properties loaded:', data)
    setProperties(data || [])
    setLoading(false)
  }

  const getPropertyImages = (property) => {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) {
      return property.images
    }
    
    return [
      `https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop`,
      `https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&h=600&fit=crop`,
      `https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop`
    ]
  }

  const nextImage = (propertyId, imagesLength) => {
    setCurrentImageIndex(prev => ({
      ...prev,
      [propertyId]: ((prev[propertyId] || 0) + 1) % imagesLength
    }))
  }

  const prevImage = (propertyId, imagesLength) => {
    setCurrentImageIndex(prev => ({
      ...prev,
      [propertyId]: ((prev[propertyId] || 0) - 1 + imagesLength) % imagesLength
    }))
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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="inline-block h-12 w-12 border-b-2 border-black"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="relative bg-black text-white py-8 sm:py-16">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold mb-2 sm:mb-3">
            Welcome, {profile.full_name}!
          </h1>
          <p className="text-sm sm:text-xl max-w-2xl leading-relaxed">
            {profile.role === 'landlord' 
              ? 'Manage your properties and track tenant applications with ease' 
              : 'Explore available properties and manage your rentals seamlessly'}
          </p>
        </div>
      </div>

      {/* Properties Section */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-12">
        
        {/* Tenant Current Occupancy Section - At Top */}
        {profile.role === 'tenant' && tenantOccupancy && (
          <div className="mb-8 bg-white border-2 border-black p-4 sm:p-6">
            <h3 className="text-xl sm:text-2xl font-bold text-black mb-4 sm:mb-6">Your Current Residence</h3>
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div>
                <h4 className="font-bold text-lg text-black">{tenantOccupancy.property?.title}</h4>
                <p className="text-sm text-gray-600 mt-1">{tenantOccupancy.property?.address}, {tenantOccupancy.property?.city}</p>
                <p className="text-sm text-gray-600 mt-1">
                  Landlord: <span className="font-medium text-black">{tenantOccupancy.landlord?.full_name}</span>
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Moved in: {new Date(tenantOccupancy.start_date).toLocaleDateString()}
                </p>
              </div>
              
              <div className="flex flex-col gap-2">
                {tenantOccupancy.status === 'pending_end' ? (
                  <div className="px-4 py-3 bg-yellow-50 border-2 border-yellow-400 text-center">
                    <p className="text-sm font-bold text-yellow-800">End Request Pending</p>
                    <p className="text-xs text-yellow-600 mt-1">Waiting for landlord approval</p>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowEndRequestModal(true)}
                    className="px-6 py-3 bg-orange-500 text-white font-bold border-2 border-orange-500 hover:bg-orange-600 transition-colors"
                  >
                    Request to Leave
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Landlord: Pending End Requests Section - At Top */}
        {profile.role === 'landlord' && pendingEndRequests.length > 0 && (
          <div className="mb-8 bg-white border-2 border-black p-4 sm:p-6">
            <h3 className="text-xl sm:text-2xl font-bold text-black mb-4 sm:mb-6">
              Pending End Requests 
              <span className="ml-2 px-2 py-1 bg-orange-500 text-white text-sm rounded">{pendingEndRequests.length}</span>
            </h3>
            <div className="space-y-4">
              {pendingEndRequests.map(request => (
                <div key={request.id} className="p-4 border-2 border-black flex flex-col sm:flex-row justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-black">{request.property?.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      Tenant: <span className="font-medium text-black">{request.tenant?.full_name}</span>
                      {request.tenant?.phone && <span className="ml-2 text-gray-500">({request.tenant.phone})</span>}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Requested: {new Date(request.end_requested_at).toLocaleDateString()}
                    </p>
                    {request.end_request_reason && (
                      <p className="text-sm text-gray-700 mt-2 p-2 bg-gray-50 border border-gray-200">
                        <span className="font-medium">Reason:</span> {request.end_request_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 sm:flex-col">
                    <button
                      onClick={() => approveEndRequest(request.id)}
                      className="flex-1 sm:flex-none px-4 py-2 bg-green-600 text-white font-bold text-sm hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => rejectEndRequest(request.id)}
                      className="flex-1 sm:flex-none px-4 py-2 bg-red-600 text-white font-bold text-sm hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 sm:mb-10">
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-black mb-1 sm:mb-2">
              {profile.role === 'landlord' ? 'Your Properties' : 'Available Properties'}
            </h2>
            <p className="text-sm sm:text-base text-gray-600">
              {profile.role === 'landlord' 
                ? 'Manage and update your property listings' 
                : 'Find your perfect rental home'}
            </p>
          </div>
          {profile.role === 'landlord' && (
            <button
            style={{ 
            borderRadius: '5px',
            }}
              onClick={() => router.push('/properties/new')}
              className="w-full sm:w-auto flex items-center justify-center gap-1 px-4 py-2 bg-black text-white border-2 border-black cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="font-semibold">Add Property</span>
            </button>
          )}
        </div>
        
        {loading ? (
          <div className="text-center py-16">
            <div 
            className="inline-block h-12 w-12 sm:h-16 sm:w-16 border-4 border-white border-t-black animate-spin rounded-full"></div>
            <p className="mt-4 sm:mt-6 text-gray-600 text-base sm:text-lg font-medium">Loading properties...</p>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-10 sm:py-16 bg-white border-2 border-black">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-black flex items-center justify-center rounded">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-gray-600 text-base sm:text-lg mb-4 sm:mb-6 px-4">
              {profile.role === 'landlord' 
                ? "You haven't listed any properties yet." 
                : 'No properties available at the moment.'}
            </p>
            {profile.role === 'landlord' && (
              <button
                onClick={() => router.push('/properties/new')}
                className="px-6 sm:px-8 py-2 sm:py-3 bg-black text-white border-2 border-black font-semibold rounded"
              >
                Add Your First Property
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            {properties.map((property) => {
              const images = getPropertyImages(property)
              const currentIndex = currentImageIndex[property.id] || 0
              
              return (
                <div key={property.id} className="bg-white border-2 border-black overflow-hidden rounded">
                  {/* Image Slider - Top */}
                  <div className="relative">
                    <div className="aspect-video relative overflow-hidden">
                      <img 
                        src={images[currentIndex]} 
                        alt={property.title}
                        className="w-full h-full object-cover"
                      />
                      
                      {/* Navigation Arrows */}
                      {images.length > 1 && (
                        <>
                          <button
                            onClick={() => prevImage(property.id, images.length)}
                            className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 bg-white text-black w-8 h-8 sm:w-10 sm:h-10 border-2 border-black flex items-center justify-center cursor-pointer rounded"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => nextImage(property.id, images.length)}
                            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 bg-white text-black w-8 h-8 sm:w-10 sm:h-10 border-2 border-black flex items-center justify-center cursor-pointer rounded"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </>
                      )}
                      
                      {/* Image Indicators */}
                      {images.length > 1 && (
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {images.map((_, idx) => (
                            <div
                              key={idx}
                              className={`h-1.5 rounded-full transition-all duration-300 ${
                                idx === currentIndex ? 'w-6 bg-white shadow-lg' : 'w-1.5 bg-white/60'
                              }`}
                            />
                          ))}
                        </div>
                      )}

                      {/* Status Badge */}
                      <div className="absolute top-4 right-4">
                        <span className={`px-3 py-1.5 text-xs font-bold border-2 border-black ${
                          property.status === 'available'
                            ? 'bg-black text-white' 
                            : property.status === 'occupied'
                            ? 'bg-white text-black'
                            : 'bg-white text-black'
                        }`}>
                          {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Property Info - Bottom */}
                  <div className="p-4">
                    <h3 className="text-lg font-bold mb-2 line-clamp-1 text-black">{property.title}</h3>
                    
                    {/* Landlord Name - Only show for tenants */}
                    {profile?.role === 'tenant' && property.landlord_profile?.full_name && (
                      <p className="text-xs text-gray-500 mb-2">
                        By {property.landlord_profile.full_name}
                      </p>
                    )}
                    
                    <div className="flex items-start gap-2 mb-3">
                      <svg className="w-4 h-4 text-black mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <p className="text-xs text-black line-clamp-1">
                        {property.address}, {property.city}
                        {property.state && `, ${property.state}`}
                      </p>
                    </div>
                    
                    <div className="mb-3">
                      <p className="text-2xl font-bold text-black">
                        ₱{Number(property.price).toLocaleString()}
                      </p>
                      <span className="text-xs text-black font-medium">per month</span>
                    </div>
                    
                    <div className="flex gap-3 mb-3 pb-3 border-b-2 border-black">
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 640 512">
                          <path d="M32 32c17.7 0 32 14.3 32 32V320H288V160c0-17.7 14.3-32 32-32H544c53 0 96 43 96 96V448c0 17.7-14.3 32-32 32s-32-14.3-32-32V416H352 320 64v32c0 17.7-14.3 32-32 32s-32-14.3-32-32V64C0 46.3 14.3 32 32 32zm144 96a80 80 0 1 1 0 160 80 80 0 1 1 0-160z"/>
                        </svg>
                        <span className="text-xs font-medium text-black">{property.bedrooms}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 512 512">
                          <path d="M96 77.3c0-7.3 5.9-13.3 13.3-13.3c3.5 0 6.9 1.4 9.4 3.9l14.9 14.9C130 91.8 128 101.7 128 112c0 19.9 7.2 38 19.2 52c-5.3 9.2-4 21.1 3.8 29c9.4 9.4 24.6 9.4 33.9 0L289 89c9.4-9.4 9.4-24.6 0-33.9c-7.9-7.9-19.8-9.1-29-3.8C246 39.2 227.9 32 208 32c-10.3 0-20.2 2-29.2 5.5L163.9 22.6C149.4 8.1 129.7 0 109.3 0C66.6 0 32 34.6 32 77.3V256c-17.7 0-32 14.3-32 32s14.3 32 32 32H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H96V77.3zM32 352v16c0 28.4 12.4 54 32 71.6V480c0 17.7 14.3 32 32 32s32-14.3 32-32V464H384v16c0 17.7 14.3 32 32 32s32-14.3 32-32V439.6c19.6-17.6 32-43.1 32-71.6V352H32z"/>
                        </svg>
                        <span className="text-xs font-medium text-black">{property.bathrooms}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                        <span className="text-xs font-medium text-black">{property.area_sqft}</span>
                      </div>
                    </div>
                    
                    {property.description && (
                      <p className="text-xs text-black mb-3 line-clamp-2 leading-relaxed">
                        {property.description}
                      </p>
                    )}
                    
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePropertyAction(property.id)}
                          className="flex-1 bg-black text-white py-2 px-3 text-xs font-semibold border-2 border-black cursor-pointer"
                        >
                          {profile.role === 'landlord' ? 'Edit' : 'View Details'}
                        </button>
                        {profile.role === 'tenant' && property.status === 'available' && (
                          <button
                            onClick={() => router.push(`/properties/${property.id}`)}
                            className="flex-1 bg-black text-white py-2 px-3 text-xs font-semibold border-2 border-black"
                          >
                          Apply
                          </button>
                        )}
                      </div>
                      
                      {/* Landlord: Assign/End Tenant Occupancy */}
                      {profile.role === 'landlord' && (
                        <div className="flex gap-2">
                          {getPropertyOccupancy(property.id) ? (
                            <>
                              <div className="flex-1 py-2 px-3 text-xs bg-blue-50 border-2 border-blue-300 flex items-center gap-2">
                                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <span className="font-medium text-blue-800 truncate">
                                  {getPropertyOccupancy(property.id)?.tenant?.full_name}
                                </span>
                              </div>
                              <button
                                onClick={() => endOccupancy(property.id)}
                                className="py-2 px-3 text-xs font-semibold bg-orange-500 text-white border-2 border-orange-500 hover:bg-orange-600"
                                title="End tenant occupancy"
                              >
                                End
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => openAssignModal(property)}
                              className="flex-1 py-2 px-3 text-xs font-semibold bg-blue-600 text-white border-2 border-blue-600 hover:bg-blue-700 flex items-center justify-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                              </svg>
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

        {/* Quick Links Section */}
        <div className="mt-12">
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-black mb-2">Quick Actions</h3>
            <p className="text-sm text-black">Access frequently used features</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {profile.role === 'tenant' && (
              <button
                onClick={() => router.push('/maintenance')}
                className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <div className="font-bold text-base mb-1 text-black">Maintenance</div>
                <div className="text-xs text-black leading-relaxed">
                  Submit request
                </div>
              </button>
            )}

            {profile.role === 'landlord' && (
              <>
                <button
                  onClick={() => router.push('/maintenance')}
                  className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </div>
                  <div className="font-bold text-base mb-1 text-black">Maintenance</div>
                  <div className="text-xs text-black leading-relaxed">
                    View requests
                  </div>
                </button>

                <button
                  onClick={() => router.push('/bookings')}
                  className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="font-bold text-base mb-1 text-black">Bookings</div>
                  <div className="text-xs text-black leading-relaxed">
                    Manage viewings
                  </div>
                </button>
              </>
            )}

            <button
              onClick={() => router.push('/payments')}
              className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="font-bold text-base mb-1 text-black">Payments</div>
              <div className="text-xs text-black leading-relaxed">
                {profile.role === 'landlord' 
                  ? 'Track income' 
                  : 'Payment history'}
              </div>
            </button>

            <button
              onClick={() => router.push('/messages')}
              className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div className="font-bold text-base mb-1 text-black">Messages</div>
              <div className="text-xs text-black leading-relaxed">
                {profile.role === 'landlord' 
                  ? 'Chat with tenants' 
                  : 'Chat with landlords'}
              </div>
            </button>

            <button
              onClick={() => router.push('/settings')}
              className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="font-bold text-base mb-1 text-black">Settings</div>
              <div className="text-xs text-black leading-relaxed">
                Account settings
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Tenant End Request Modal */}
      {showEndRequestModal && tenantOccupancy && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black max-w-md w-full">
            <div className="p-4 border-b-2 border-black flex justify-between items-center">
              <h3 className="text-lg font-bold">Request to Leave</h3>
              <button
                onClick={() => {
                  setShowEndRequestModal(false)
                  setEndRequestReason('')
                }}
                className="p-1 hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4">
              <div className="mb-4 p-3 bg-gray-50 border-2 border-gray-200">
                <p className="text-sm font-medium text-black">{tenantOccupancy.property?.title}</p>
                <p className="text-xs text-gray-600">{tenantOccupancy.property?.address}, {tenantOccupancy.property?.city}</p>
              </div>

              {/* Important Reminder */}
              <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-400">
                <h4 className="font-bold text-sm text-yellow-900 mb-2">⚠️ Important Reminders</h4>
                <div className="text-xs text-yellow-800 space-y-1">
                  <p>• <strong>30-Day Notice:</strong> Notify at least 30 days before leaving</p>
                  <p>• <strong>Property Inspection:</strong> Landlord will inspect before approval</p>
                  <p>• <strong>Return Condition:</strong> Property must be returned in original condition with all items intact</p>
                  <p>• <strong>Damages:</strong> Repair/replacement costs may be deducted from deposit</p>
                  <p>• <strong>Final Checks:</strong> Settle all bills and outstanding payments</p>
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Intended Move-Out Date</label>
                <input
                  type="date"
                  value={endRequestReason.split('|')[1] || ''}
                  onChange={(e) => {
                    const reason = endRequestReason.split('|')[0] || ''
                    setEndRequestReason(reason + '|' + e.target.value)
                  }}
                  min={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  className="w-full p-2 border-2 border-black text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Must be at least 30 days from today</p>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Reason for Leaving</label>
                <textarea
                  value={endRequestReason.split('|')[0] || ''}
                  onChange={(e) => {
                    const date = endRequestReason.split('|')[1] || ''
                    setEndRequestReason(e.target.value + '|' + date)
                  }}
                  placeholder="e.g., Moving to a new city, end of contract, etc."
                  className="w-full p-3 border-2 border-black text-sm resize-none"
                  rows={3}
                />
              </div>
              
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => {
                    setShowEndRequestModal(false)
                    setEndRequestReason('')
                  }}
                  className="flex-1 py-2 px-4 bg-gray-100 text-black font-bold border-2 border-black hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={requestEndOccupancy}
                  disabled={submittingEndRequest}
                  className="flex-1 py-2 px-4 bg-orange-500 text-white font-bold border-2 border-orange-500 hover:bg-orange-600 disabled:opacity-50"
                >
                  {submittingEndRequest ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Tenant Modal */}
      {showAssignModal && selectedProperty && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b-2 border-black flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold">Assign Tenant</h3>
                <p className="text-sm text-gray-600">{selectedProperty.title}</p>
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-1 hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">
                Select a tenant with an accepted application to assign to this property:
              </p>
              
              {acceptedApplications.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 border-2 border-dashed border-gray-300">
                  <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <p className="text-sm text-gray-600 font-medium">No accepted applications</p>
                  <p className="text-xs text-gray-500 mt-1">Accept a tenant's application first</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {acceptedApplications.map(app => (
                    <div
                      key={app.id}
                      className="p-3 border-2 border-black hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                      onClick={() => assignTenant(app)}
                    >
                      <div>
                        <p className="font-medium">{app.tenant_profile?.full_name}</p>
                        <p className="text-xs text-gray-500">{app.tenant_profile?.phone || 'No phone'}</p>
                      </div>
                      <button className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
                        Assign
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Toaster position="top-right" />
    </div>
  )
}
