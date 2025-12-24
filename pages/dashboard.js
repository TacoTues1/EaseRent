import { useEffect, useState } from 'react'
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
  // Landlord end requests
  const [pendingEndRequests, setPendingEndRequests] = useState([])
  const [showEndRequestsModal, setShowEndRequestsModal] = useState(false)
  // Property summaries (bills & maintenance)
  const [propertySummaries, setPropertySummaries] = useState({})
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
        loadPropertySummaries()
      } else if (profile.role === 'tenant') {
        loadTenantOccupancy()
      }
    }
  }, [profile])

  // Load property summaries (pending bills & maintenance requests)
  async function loadPropertySummaries() {
    // Get landlord's properties
    const { data: myProps } = await supabase
      .from('properties')
      .select('id, title')
      .eq('landlord', session.user.id)
    
    if (!myProps || myProps.length === 0) return

    const summaries = {}
    for (const prop of myProps) {
      // Get pending/awaiting payment requests (pending = unpaid, pending_confirmation = awaiting landlord confirmation)
      const { data: bills } = await supabase
        .from('payment_requests')
        .select('id, rent_amount, water_bill, electrical_bill, other_bills, due_date, status')
        .eq('property_id', prop.id)
        .in('status', ['pending', 'pending_confirmation'])
      
      // Get open maintenance requests (pending or in_progress)
      const { data: maintenance } = await supabase
        .from('maintenance_requests')
        .select('id, title, priority, status')
        .eq('property_id', prop.id)
        .in('status', ['pending', 'in_progress'])
      
      summaries[prop.id] = {
        pendingBills: bills || [],
        maintenanceRequests: maintenance || []
      }
    }
    setPropertySummaries(summaries)
  }

  // Load tenant's current occupancy
  async function loadTenantOccupancy() {
    const { data } = await supabase
      .from('tenant_occupancies')
      .select(`
        *,
        property:properties(id, title, address, city, images),
        landlord:profiles!tenant_occupancies_landlord_id_fkey(id, first_name, middle_name, last_name)
      `)
      .eq('tenant_id', session.user.id)
      .in('status', ['active', 'pending_end'])
      .maybeSingle()
    
    setTenantOccupancy(data)
  }

  // Load pending end requests for landlord
  async function loadPendingEndRequests() {
    const { data } = await supabase
      .from('tenant_occupancies')
      .select(`
        *,
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone),
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
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name),
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
        tenant_profile:profiles!applications_tenant_fkey(id, first_name, middle_name, last_name, phone)
      `)
      .eq('property_id', propertyId)
      .eq('status', 'accepted')
      .not('tenant', 'is', null)
    
    // Filter out applications with null tenant profiles (deleted users)
    const validApplications = (data || []).filter(app => 
      app.tenant && app.tenant_profile && app.tenant_profile.first_name
    )
    
    setAcceptedApplications(validApplications)
  }

  // Open assign tenant modal
  function openAssignModal(property) {
    setSelectedProperty(property)
    loadAcceptedApplicationsForProperty(property.id)
    setShowAssignModal(true)
  }

  // Assign tenant to property
  async function assignTenant(application) {
    // Validate tenant exists
    if (!application.tenant || !application.tenant_profile) {
      toast.error('Invalid tenant - user may have been deleted')
      return
    }

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

    toast.success(`${application.tenant_profile?.first_name} ${application.tenant_profile?.last_name} assigned to property!`)
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
      message: `${profile.first_name} ${profile.last_name} has requested to end their occupancy at "${tenantOccupancy.property?.title}". Please review and approve/reject.`,
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

    const { data, error } = await supabase
      .from('tenant_occupancies')
      .update({
        status: 'ended',
        end_date: new Date().toISOString(),
        end_request_status: 'approved'
      })
      .eq('id', occupancyId)
      .select()

    if (error) {
      console.error('Error approving end request:', error)
      toast.error(`Failed to approve: ${error.message || error.details || 'Unknown error'}`)
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
      .maybeSingle()
    
    if (data) {
      const user = session?.user || (await supabase.auth.getUser()).data.user
      const emailPrefix = user?.email?.split('@')[0] || ''
      const nameNeedsUpdate = !data.first_name || 
                              data.first_name === emailPrefix ||
                              /\d/.test(data.first_name)
      
      if (nameNeedsUpdate) {
        const metadata = user?.user_metadata || {}
        const identityData = user?.identities?.[0]?.identity_data || {}
        
        let firstName = identityData.given_name || metadata.given_name || 
                        identityData.first_name || metadata.first_name || 
                        identityData.name || metadata.name || 
                        identityData.full_name || metadata.full_name || null
        let middleName = identityData.middle_name || metadata.middle_name || null
        let lastName = identityData.family_name || metadata.family_name || 
                       identityData.last_name || metadata.last_name || null
        
        if (firstName && firstName.includes(' ')) {
          const nameParts = firstName.trim().split(/\s+/)
          firstName = nameParts[0]
          if (nameParts.length >= 2) {
            lastName = nameParts[nameParts.length - 1]
          }
          if (nameParts.length >= 3) {
            middleName = nameParts.slice(1, -1).join(' ')
          }
        }
        
        if (firstName && firstName !== emailPrefix && !/\d/.test(firstName)) {
          const { data: updatedProfile } = await supabase
            .from('profiles')
            .update({
              first_name: firstName,
              middle_name: middleName || null,
              last_name: lastName || null
            })
            .eq('id', userId)
            .select()
            .maybeSingle()
          
          if (updatedProfile) {
            setProfile(updatedProfile)
            return
          }
        }
      }
      setProfile(data)
    } else {
      const user = session?.user || (await supabase.auth.getUser()).data.user
      const metadata = user?.user_metadata || {}
      const identityData = user?.identities?.[0]?.identity_data || {}
      
      let firstName = identityData.given_name || metadata.given_name || 
                      identityData.first_name || metadata.first_name || 
                      identityData.name || metadata.name ||
                      identityData.full_name || metadata.full_name || null
      let middleName = identityData.middle_name || metadata.middle_name || null
      let lastName = identityData.family_name || metadata.family_name || 
                     identityData.last_name || metadata.last_name || null
      
      if (firstName && firstName.includes(' ')) {
        const nameParts = firstName.trim().split(/\s+/)
        firstName = nameParts[0]
        if (nameParts.length >= 2 && !lastName) {
          lastName = nameParts[nameParts.length - 1]
        }
        if (nameParts.length >= 3 && !middleName) {
          middleName = nameParts.slice(1, -1).join(' ')
        }
      }
      
      if (!firstName) {
        firstName = user?.email?.split('@')[0] || 'User'
      }
      
      const { data: newProfile, error } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          first_name: firstName,
          middle_name: middleName || null,
          last_name: lastName || null,
          role: 'tenant'
        })
        .select()
        .maybeSingle()
      
      if (newProfile) setProfile(newProfile)
    }
  }

  async function loadProperties() {
    setLoading(true)
    
    let query = supabase
      .from('properties')
      .select('*, landlord_profile:profiles!properties_landlord_fkey(id, first_name, middle_name, last_name, role)')
      .order('created_at', { ascending: false })

    if (profile?.role === 'landlord') {
      query = query.eq('landlord', session.user.id)
    }

    const { data, error } = await query
    
    if (error) {
      console.error('Error loading properties:', error)
    }
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-black"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Hero Section - Compact & Straight */}
      <div className="bg-black text-white pt-10 pb-8 shadow-sm mb-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              {profile.role === 'landlord' ? 'Landlord Workspace' : 'Tenant Portal'}
            </span>
            <h1 className="text-3xl font-bold text-white">
              Welcome back, {profile.first_name}!
            </h1>
            <p className="text-gray-400 text-sm">
              {profile.role === 'landlord' 
                ? 'Here is an overview of your properties and tenant requests.' 
                : 'Find your perfect home or manage your current stay.'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 relative z-10">
        
        {/* Tenant Current Occupancy Section - Card Style */}
        {profile.role === 'tenant' && tenantOccupancy && (
          <div className="mb-8 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
             <div className="bg-gradient-to-r from-gray-900 to-black px-6 py-4 border-b border-gray-800 flex justify-between items-center">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  Your Current Residence
                </h3>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  tenantOccupancy.status === 'pending_end' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'
                }`}>
                  {tenantOccupancy.status === 'pending_end' ? 'Move-out Pending' : 'Active Resident'}
                </span>
             </div>
            
            <div className="p-6 flex flex-col md:flex-row gap-6">
              <div className="w-full md:w-1/3 aspect-video rounded-xl overflow-hidden bg-gray-100">
                 {tenantOccupancy.property?.images && tenantOccupancy.property.images.length > 0 ? (
                   <img src={tenantOccupancy.property.images[0]} alt="Property" className="w-full h-full object-cover" />
                 ) : (
                   <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">
                     No Image
                   </div>
                 )}
              </div>

              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-2xl font-bold text-gray-900 mb-1">{tenantOccupancy.property?.title}</h4>
                  <p className="text-gray-500 flex items-center gap-1.5 mb-4">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                     {tenantOccupancy.property?.address}, {tenantOccupancy.property?.city}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-6">
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
                    <div className="px-5 py-3 bg-yellow-50 text-yellow-800 rounded-xl border border-yellow-200 text-sm font-medium flex items-center gap-2">
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       Move-out request awaiting approval
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowEndRequestModal(true)}
                      className="px-6 py-2.5 bg-white text-red-600 border border-red-100 hover:bg-red-50 hover:border-red-200 font-semibold rounded-xl transition-colors shadow-sm"
                    >
                      Request to Move Out
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Landlord: Pending End Requests Section */}
        {profile.role === 'landlord' && pendingEndRequests.length > 0 && (
          <div className="mb-8 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-orange-50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-orange-900 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                Pending Move-Out Requests
              </h3>
              <span className="bg-orange-200 text-orange-800 text-xs font-bold px-2.5 py-1 rounded-full">{pendingEndRequests.length}</span>
            </div>
            
            <div className="divide-y divide-gray-100">
              {pendingEndRequests.map(request => (
                <div key={request.id} className="p-6 flex flex-col md:flex-row justify-between gap-6 items-start md:items-center hover:bg-gray-50 transition-colors">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 text-lg mb-1">{request.property?.title}</h4>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-3">
                       <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          {request.tenant?.first_name} {request.tenant?.last_name}
                       </span>
                       <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          Req: {new Date(request.end_requested_at).toLocaleDateString()}
                       </span>
                    </div>
                    {request.end_request_reason && (
                      <div className="bg-white p-3 rounded-lg border border-gray-200 text-sm text-gray-600 inline-block max-w-xl">
                        <span className="font-semibold text-gray-900 mr-1">Reason:</span> {request.end_request_reason}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => rejectEndRequest(request.id)}
                      className="px-4 py-2 bg-white text-gray-700 border border-gray-300 font-semibold rounded-xl text-sm hover:bg-gray-50 hover:text-red-600 hover:border-red-200 transition-all shadow-sm"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => approveEndRequest(request.id)}
                      className="px-5 py-2 bg-black text-white font-semibold rounded-xl text-sm hover:bg-gray-800 shadow-md hover:shadow-lg transition-all"
                    >
                      Approve Request
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {profile.role === 'landlord' ? 'Your Properties' : 'Explore Properties'}
            </h2>
            <p className="text-gray-500 text-sm">
              {profile.role === 'landlord' 
                ? 'Manage listings, assignments, and property details.' 
                : 'Find the perfect place to call home.'}
            </p>
          </div>
          {profile.role === 'landlord' && (
            <button
              onClick={() => router.push('/properties/new')}
              className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 text-sm font-semibold cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add New Property
            </button>
          )}
        </div>
        
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
             {[1,2,3].map(i => (
                <div key={i} className="h-96 bg-gray-200 rounded-3xl animate-pulse"></div>
             ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100">
            <div className="w-20 h-20 mx-auto mb-6 bg-gray-50 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No properties found</h3>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">
              {profile.role === 'landlord' 
                ? "You haven't added any properties yet. Get started by adding your first listing." 
                : 'There are no properties available at the moment. Please check back later.'}
            </p>
            {profile.role === 'landlord' && (
              <button
                onClick={() => router.push('/properties/new')}
                className="px-8 py-3 bg-black text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
              >
                Add Your First Property
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {properties.map((property) => {
              const images = getPropertyImages(property)
              const currentIndex = currentImageIndex[property.id] || 0
              const occupancy = getPropertyOccupancy(property.id)
              
              return (
                <div key={property.id} className="group bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer flex flex-col">
                  {/* Image Slider - Top */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                    <img 
                      src={images[currentIndex]} 
                      alt={property.title}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Navigation Arrows (Only show on hover) */}
                    {images.length > 1 && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button
                          onClick={(e) => { e.stopPropagation(); prevImage(property.id, images.length); }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-black w-9 h-9 flex items-center justify-center rounded-full shadow-md hover:bg-white hover:scale-110 transition-all"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); nextImage(property.id, images.length); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-black w-9 h-9 flex items-center justify-center rounded-full shadow-md hover:bg-white hover:scale-110 transition-all"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                    )}
                    
                    {/* Image Indicators */}
                    {images.length > 1 && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                        {images.map((_, idx) => (
                          <div
                            key={idx}
                            className={`h-1.5 rounded-full transition-all duration-300 shadow-sm ${
                              idx === currentIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/60'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    {/* Gradient Overlay for Text Visibility */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60"></div>

                    {/* Status Badge */}
                    <div className="absolute top-4 right-4 z-10">
                      <span className={`px-3 py-1 text-xs font-bold rounded-full shadow-sm backdrop-blur-md ${
                        property.status === 'available'
                          ? 'bg-white text-black' 
                          : 'bg-black/80 text-white'
                      }`}>
                        {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
                      </span>
                    </div>

                    {/* Price Overlay */}
                    <div className="absolute bottom-4 left-4 z-10 text-white">
                      <p className="text-xl font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
                      <p className="text-xs opacity-90 font-medium">per month</p>
                    </div>
                  </div>
                  
                  {/* Property Info - Bottom */}
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="mb-4">
                        <div className="flex justify-between items-start mb-1">
                            <h3 className="text-lg font-bold text-gray-900 line-clamp-1">{property.title}</h3>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-500 text-sm">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            <span className="line-clamp-1">{property.address}, {property.city}</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 mb-5 pb-5 border-b border-gray-100 text-gray-600 text-sm">
                      <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 640 512"><path d="M32 32c17.7 0 32 14.3 32 32V320H288V160c0-17.7 14.3-32 32-32H544c53 0 96 43 96 96V448c0 17.7-14.3 32-32 32s-32-14.3-32-32V416H352 320 64v32c0 17.7-14.3 32-32 32s-32-14.3-32-32V64C0 46.3 14.3 32 32 32zm144 96a80 80 0 1 1 0 160 80 80 0 1 1 0-160z"/></svg>
                        <span className="font-semibold">{property.bedrooms}</span> Bed
                      </div>
                      <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 512 512"><path d="M96 77.3c0-7.3 5.9-13.3 13.3-13.3c3.5 0 6.9 1.4 9.4 3.9l14.9 14.9C130 91.8 128 101.7 128 112c0 19.9 7.2 38 19.2 52c-5.3 9.2-4 21.1 3.8 29c9.4 9.4 24.6 9.4 33.9 0L289 89c9.4-9.4 9.4-24.6 0-33.9c-7.9-7.9-19.8-9.1-29-3.8C246 39.2 227.9 32 208 32c-10.3 0-20.2 2-29.2 5.5L163.9 22.6C149.4 8.1 129.7 0 109.3 0C66.6 0 32 34.6 32 77.3V256c-17.7 0-32 14.3-32 32s14.3 32 32 32H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H96V77.3zM32 352v16c0 28.4 12.4 54 32 71.6V480c0 17.7 14.3 32 32 32s32-14.3 32-32V464H384v16c0 17.7 14.3 32 32 32s32-14.3 32-32V439.6c19.6-17.6 32-43.1 32-71.6V352H32z"/></svg>
                        <span className="font-semibold">{property.bathrooms}</span> Bath
                      </div>
                      <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        <span className="font-semibold">{property.area_sqft}</span> Sqm
                      </div>
                    </div>

                    <div className="mt-auto flex flex-col gap-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePropertyAction(property.id)}
                          className="flex-1 bg-black text-white py-2.5 px-4 text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors shadow-md cursor-pointer"
                        >
                          {profile.role === 'landlord' ? 'Edit Details' : 'View Property'}
                        </button>
                        {profile.role === 'landlord' && (
                          <button
                            onClick={() => router.push(`/properties/${property.id}`)}
                            className="w-12 flex items-center justify-center bg-gray-100 text-black border border-gray-200 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
                            title="Preview Public View"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>
                        )}
                      </div>
                      
                      {/* Landlord Actions */}
                      {profile.role === 'landlord' && (
                        <div className="pt-3 border-t border-gray-100">
                          {occupancy ? (
                            <div className="flex items-center justify-between gap-2">
                               <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-2 py-1.5 rounded-lg flex-1 truncate">
                                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                  <span className="truncate font-medium">{occupancy.tenant?.first_name} {occupancy.tenant?.last_name}</span>
                               </div>
                               <button
                                onClick={() => endOccupancy(property.id)}
                                className="text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                               >
                                End
                               </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => openAssignModal(property)}
                              className="w-full py-2 px-3 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
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

      {/* Tenant End Request Modal */}
      {showEndRequestModal && tenantOccupancy && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden scale-in-95 animate-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-bold text-gray-900">Request to Leave</h3>
              <button
                onClick={() => {
                  setShowEndRequestModal(false)
                  setEndRequestReason('')
                }}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-start gap-3">
                 <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-2xl border border-gray-100">🏠</div>
                 <div>
                    <p className="text-sm font-bold text-gray-900">{tenantOccupancy.property?.title}</p>
                    <p className="text-xs text-gray-500">{tenantOccupancy.property?.address}</p>
                 </div>
              </div>

              {/* Reminder Box */}
              <div className="mb-6 p-4 bg-yellow-50 rounded-2xl border border-yellow-100 text-yellow-800">
                <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                   Important Notice
                </h4>
                <ul className="text-xs space-y-1.5 list-disc list-inside opacity-90">
                  <li>Minimum 30-day notice required</li>
                  <li>Property must be returned in original condition</li>
                  <li>Outstanding bills must be settled</li>
                </ul>
              </div>
              
              <div className="space-y-4">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">When do you plan to move out?</label>
                    <input
                      type="date"
                      value={endRequestReason.split('|')[1] || ''}
                      onChange={(e) => {
                        const reason = endRequestReason.split('|')[0] || ''
                        setEndRequestReason(reason + '|' + e.target.value)
                      }}
                      min={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                      className="w-full p-3 rounded-xl border border-gray-300 focus:border-black focus:ring-1 focus:ring-black outline-none transition-all text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1 ml-1">Must be at least 30 days from today</p>
                </div>
                
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Reason for Leaving</label>
                    <textarea
                      value={endRequestReason.split('|')[0] || ''}
                      onChange={(e) => {
                        const date = endRequestReason.split('|')[1] || ''
                        setEndRequestReason(e.target.value + '|' + date)
                      }}
                      placeholder="e.g. Work relocation, larger space needed..."
                      className="w-full p-3 rounded-xl border border-gray-300 focus:border-black focus:ring-1 focus:ring-black outline-none transition-all text-sm resize-none"
                      rows={3}
                    />
                </div>
              </div>
              
              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => {
                    setShowEndRequestModal(false)
                    setEndRequestReason('')
                  }}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={requestEndOccupancy}
                  disabled={submittingEndRequest}
                  className="flex-1 py-3 px-4 bg-black text-white font-bold rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all"
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col scale-in-95 animate-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Assign Tenant</h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">{selectedProperty.title}</p>
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <p className="text-sm text-gray-600 mb-4 font-medium">
                Select a tenant from accepted applications:
              </p>
              
              {acceptedApplications.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm text-gray-400">
                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  </div>
                  <p className="text-sm text-gray-900 font-bold">No accepted applications</p>
                  <p className="text-xs text-gray-500 mt-1">Review and accept an application first</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {acceptedApplications.map(app => (
                    <div
                      key={app.id}
                      className="p-4 rounded-2xl border border-gray-200 hover:border-black hover:shadow-md cursor-pointer flex justify-between items-center transition-all bg-white group"
                      onClick={() => assignTenant(app)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-600 group-hover:bg-black group-hover:text-white transition-colors">
                           {app.tenant_profile?.first_name?.charAt(0)}
                        </div>
                        <div>
                           <p className="font-bold text-gray-900 text-sm">{app.tenant_profile?.first_name} {app.tenant_profile?.last_name}</p>
                           <p className="text-xs text-gray-500">{app.tenant_profile?.phone || 'No phone provided'}</p>
                        </div>
                      </div>
                      <button className="px-4 py-2 bg-gray-50 text-gray-900 text-xs font-bold rounded-lg group-hover:bg-black group-hover:text-white transition-colors">
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
    </div>
  )
}