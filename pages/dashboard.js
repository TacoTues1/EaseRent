import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { createNotification } from '../lib/notifications'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import Footer from '../components/Footer'

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
  const [priceRange, setPriceRange] = useState({ min: '', max: '' })
  const [sortBy, setSortBy] = useState('newest')
  const [isExpanded, setIsExpanded] = useState(false) 
  
  // --- Filter Dropdown State ---
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [showPriceDropdown, setShowPriceDropdown] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const filterRef = useRef(null)
  const priceRef = useRef(null)
  
  // --- Comparison Feature State ---
  const [comparisonList, setComparisonList] = useState([])
  
  // --- Favorites & Property Stats (Tenants) ---
  const [favorites, setFavorites] = useState([])
  const [propertyStats, setPropertyStats] = useState({})
  const [guestFavorites, setGuestFavorites] = useState([])
  const [topRated, setTopRated] = useState([])
  
  // --- Display limit for property sections ---
  const maxDisplayItems = 8

  const router = useRouter()

  const filterAmenities = [
    'Wifi', 'Pool', 'Gym', 'Parking', 'Air conditioning', 'Pet friendly'
  ]

  // Auto-slide images for property cards
  useEffect(() => {
    const allProperties = [...properties, ...guestFavorites, ...topRated]
    if (allProperties.length === 0) return
    
    const interval = setInterval(() => {
      setCurrentImageIndex(prev => {
        const newIndex = { ...prev }
        allProperties.forEach(property => {
          if (property.images && Array.isArray(property.images) && property.images.length > 1) {
            const currentIdx = prev[property.id] || 0
            newIndex[property.id] = (currentIdx + 1) % property.images.length
          }
        })
        return newIndex
      })
    }, 3000) // Change image every 3 seconds
    
    return () => clearInterval(interval)
  }, [properties, guestFavorites, topRated])

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
      loadPropertyStats()
      if (profile.role === 'landlord') {
        loadOccupancies()
        loadPendingEndRequests()
        loadPropertySummaries()
      } else if (profile.role === 'tenant') {
        loadTenantOccupancy()
        checkPendingReviews(session.user.id)
        loadUserFavorites()
        loadFeaturedSections()
      }
    }
  }, [profile])
  
  // Click outside to close filter dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setShowFilterDropdown(false)
      }
      if (priceRef.current && !priceRef.current.contains(event.target)) {
        setShowPriceDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [filterRef, priceRef]);

  // Scroll effect for search bar animation
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Load properties on profile load (no auto-search for tenants)
  // Search is triggered manually via Search button

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
      .eq('user_id', userId)
    
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
        user_id: session.user.id,
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

    if (profile?.role === 'landlord') {
      query = query.eq('landlord', session.user.id).order('created_at', { ascending: false })
    } else {
      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%`)
      }
      if (priceRange.min) {
        query = query.gte('price', parseInt(priceRange.min))
      }
      if (priceRange.max) {
        query = query.lte('price', parseInt(priceRange.max))
      }
      if (selectedAmenities.length > 0) {
        query = query.contains('amenities', selectedAmenities)
      }
      // Apply sorting
      if (sortBy === 'newest') {
        query = query.order('created_at', { ascending: false })
      } else if (sortBy === 'oldest') {
        query = query.order('created_at', { ascending: true })
      } else if (sortBy === 'price_low') {
        query = query.order('price', { ascending: true })
      } else if (sortBy === 'price_high') {
        query = query.order('price', { ascending: false })
      }
      if (!expanded && !searchQuery && selectedAmenities.length === 0 && !priceRange.min && !priceRange.max) {
        query = query.limit(5)
      }
    }

    const { data, error } = await query
    if (error) console.error('Error loading properties:', error)
    setProperties(data || [])
    setLoading(false)
  }

  const handleSeeMore = () => { router.push('/properties') }
  
  // Handle search button click - redirect to all properties page with filters (tenants only)
  const handleSearch = () => {
    // Only search if at least one filter is applied
    const hasFilters = searchQuery.trim() || priceRange.min || priceRange.max || selectedAmenities.length > 0 || sortBy !== 'newest'
    if (!hasFilters) return
    
    const params = new URLSearchParams()
    if (searchQuery.trim()) params.set('search', searchQuery.trim())
    if (priceRange.min) params.set('minPrice', priceRange.min)
    if (priceRange.max) params.set('maxPrice', priceRange.max)
    if (selectedAmenities.length > 0) params.set('amenities', selectedAmenities.join(','))
    if (sortBy !== 'newest') params.set('sort', sortBy)
    
    router.push(`/properties${params.toString() ? '?' + params.toString() : ''}`)
  }
  
  // Check if search button should be enabled
  const canSearch = searchQuery.trim() || priceRange.min || priceRange.max || selectedAmenities.length > 0 || sortBy !== 'newest'

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

  // Load user's favorite properties
  async function loadUserFavorites() {
    if (!session) return
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('property_id')
        .eq('user_id', session.user.id)
      if (error) {
        console.log('Favorites not available:', error.message)
        return
      }
      if (data) {
        setFavorites(data.map(f => f.property_id))
      }
    } catch (err) {
      console.log('Error loading favorites:', err.message)
    }
  }

  // Load property stats (favorites count, ratings)
  async function loadPropertyStats() {
    try {
      const { data, error } = await supabase
        .from('property_stats')
        .select('*')
      if (error) {
        console.log('Property stats not available:', error.message)
        return
      }
      if (data) {
        const statsMap = {}
        data.forEach(stat => {
          statsMap[stat.property_id] = {
            favorite_count: stat.favorite_count || 0,
            avg_rating: stat.avg_rating || 0,
            review_count: stat.review_count || 0
          }
        })
        setPropertyStats(statsMap)
      }
    } catch (err) {
      console.log('Error loading property stats:', err.message)
    }
  }

  // Load Guest Favorites and Top Rated for tenants
  async function loadFeaturedSections() {
    try {
      const { data: allProps } = await supabase
        .from('properties')
        .select('*')
        .eq('status', 'available')

      const { data: stats, error: statsError } = await supabase
        .from('property_stats')
        .select('*')

      if (statsError) {
        console.log('Property stats not available:', statsError.message)
        return
      }

      if (allProps && stats) {
        const statsMap = {}
        stats.forEach(s => { 
          statsMap[s.property_id] = {
            favorite_count: s.favorite_count || 0,
            avg_rating: s.avg_rating || 0,
            review_count: s.review_count || 0
          }
        })

        // Guest Favorites - properties with 1+ favorites
        const favorites = allProps
          .filter(p => statsMap[p.id]?.favorite_count >= 1)
          .sort((a, b) => (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0))
          .slice(0, 5)
        setGuestFavorites(favorites)

        // Top Rated - properties with highest ratings
        const rated = allProps
          .filter(p => statsMap[p.id]?.review_count > 0)
          .sort((a, b) => (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0))
          .slice(0, 5)
        setTopRated(rated)
      }
    } catch (err) {
      console.log('Featured sections not available:', err.message)
    }
  }

  // Toggle favorite on a property
  async function toggleFavorite(e, propertyId) {
    e.stopPropagation()
    if (!session) {
      toast.error('Please login to save favorites')
      return
    }
    const isFavorite = favorites.includes(propertyId)
    if (isFavorite) {
      await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('property_id', propertyId)
      setFavorites(favorites.filter(id => id !== propertyId))
      toast.success('Removed from favorites')
    } else {
      await supabase.from('favorites').insert({ user_id: session.user.id, property_id: propertyId })
      setFavorites([...favorites, propertyId])
      toast.success('Added to favorites')
    }
    loadPropertyStats()
    loadFeaturedSections()
  }

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
    <div className="min-h-screen bg-gray-50 flex flex-col scroll-smooth">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10 flex-1">
        
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

        {/* Search and Filter Bar - ONLY FOR TENANTS - with Scroll Animation */}
        {profile.role === 'tenant' && (
          <>
            <div className={`sticky top-21 z-40 transition-all duration-300 ease-out ${isScrolled ? 'py-2' : 'py-0'}`}>
              <div className="flex justify-center mb-8">
                <div className={`w-full bg-white rounded-2xl shadow-lg border border-gray-100 relative z-30 transition-all duration-300 ease-out ${isScrolled ? 'max-w-2xl p-2' : 'max-w-3xl p-3'}`}>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
                    {/* Search Input */}
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-1 flex items-center pointer-events-none">
                        <svg className={`text-gray-400 transition-all duration-300 ease-out ${isScrolled ? 'w-4 h-4' : 'w-5 h-5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <input 
                        type="text" 
                        placeholder="Search properties..." 
                        className={`w-full bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black font-medium transition-all duration-300 ease-out ${isScrolled ? 'pl-9 pr-3 py-2 text-xs' : 'pl-10 pr-4 py-2.5 text-sm'}`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && canSearch && handleSearch()}
                      />
                    </div>

                    {/* Search Button */}
                    <button
                      onClick={handleSearch}
                      disabled={!canSearch}
                      className={`rounded-xl font-bold transition-all duration-300 ease-out flex items-center gap-2 ${isScrolled ? 'px-3 py-2 text-xs' : 'px-5 py-2.5 text-sm'} ${
                        canSearch 
                          ? 'bg-black text-white hover:bg-gray-800 cursor-pointer'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <svg className={`transition-all duration-300 ease-out ${isScrolled ? 'w-3 h-3' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      {!isScrolled && 'Search'}
                    </button>

                    {/* Filter & Sort Controls */}
                    <div className={`flex transition-all duration-300 ease-out ${isScrolled ? 'gap-1' : 'gap-2'}`}>
                      {/* Price Filter Button */}
                      <div className="relative" ref={priceRef}>
                        <button 
                          onClick={() => setShowPriceDropdown(!showPriceDropdown)}
                          className={`flex items-center gap-1.5 rounded-xl font-bold transition-all duration-300 ease-out border whitespace-nowrap cursor-pointer ${isScrolled ? 'px-2 py-2 text-[10px]' : 'px-3 py-2.5 text-xs'} ${
                            priceRange.min || priceRange.max
                            ? 'bg-gray-900 text-white border-black' 
                            : 'bg-white text-gray-700 border-gray-200 hover:border-black'
                        }`}
                      >
                        <span>₱</span>
                        {!isScrolled && 'Price'}
                        {(priceRange.min || priceRange.max) && (
                          <span className="bg-white text-black text-[10px] w-4 h-4 flex items-center justify-center rounded-full">✓</span>
                        )}
                      </button>

                      {showPriceDropdown && (
                        <div className="fixed inset-x-0 bottom-0 sm:bottom-auto sm:absolute sm:inset-x-auto sm:top-full sm:right-0 mt-0 sm:mt-2 w-full sm:w-56 bg-white border-t sm:border border-gray-200 rounded-t-2xl sm:rounded-xl shadow-2xl p-4 sm:p-3 z-[100]">
                          <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
                          <div className="flex justify-between items-center mb-2">
                            <h3 className="text-xs font-bold text-gray-500 uppercase">Price Range</h3>
                            {(priceRange.min || priceRange.max) && (
                              <button 
                                onClick={() => setPriceRange({ min: '', max: '' })}
                                className="text-[10px] font-bold text-red-500 hover:text-red-700 cursor-pointer"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 mb-3">
                            <input 
                              type="number" 
                              placeholder="Min Price" 
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-black"
                              value={priceRange.min}
                              onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
                            />
                            <input 
                              type="number" 
                              placeholder="Max Price" 
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-black"
                              value={priceRange.max}
                              onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
                            />
                          </div>
                          <div className="border-t border-gray-100 pt-2">
                            <p className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">Sort By</p>
                            <div className="flex flex-col gap-1">
                              <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors">
                                <input 
                                  type="radio" 
                                  name="priceSortDashboard"
                                  checked={sortBy === 'price_low'}
                                  onChange={() => setSortBy('price_low')}
                                  className="w-3.5 h-3.5 cursor-pointer"
                                />
                                <span className="text-xs font-medium text-gray-700 group-hover:text-black">Price: Low to High</span>
                              </label>
                              <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors">
                                <input 
                                  type="radio" 
                                  name="priceSortDashboard"
                                  checked={sortBy === 'price_high'}
                                  onChange={() => setSortBy('price_high')}
                                  className="w-3.5 h-3.5 cursor-pointer"
                                />
                                <span className="text-xs font-medium text-gray-700 group-hover:text-black">Price: High to Low</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Filter Button */}
                    <div className="relative" ref={filterRef}>
                      <button 
                        onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                        className={`flex items-center gap-1.5 rounded-xl font-bold transition-all duration-300 ease-out border whitespace-nowrap cursor-pointer ${isScrolled ? 'px-2 py-2 text-[10px]' : 'px-3 py-2.5 text-xs'} ${
                          showFilterDropdown || selectedAmenities.length > 0
                            ? 'bg-gray-900 text-white border-black' 
                            : 'bg-white text-gray-700 border-gray-200 hover:border-black'
                        }`}
                      >
                        <svg className={`transition-all duration-300 ease-out ${isScrolled ? 'w-3 h-3' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        {!isScrolled && 'Filters'}
                        {selectedAmenities.length > 0 && (
                          <span className="bg-white text-black text-[10px] w-4 h-4 flex items-center justify-center rounded-full">
                            {selectedAmenities.length}
                          </span>
                        )}
                      </button>

                      {showFilterDropdown && (
                        <div className="fixed inset-x-0 bottom-0 sm:bottom-auto sm:absolute sm:inset-x-auto sm:top-full sm:right-0 mt-0 sm:mt-2 w-full sm:w-56 bg-white border-t sm:border border-gray-200 rounded-t-2xl sm:rounded-xl shadow-2xl p-4 sm:p-3 z-[100]">
                          <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
                          <div className="mb-3">
                            <p className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">Sort By Date</p>
                            <div className="flex flex-col gap-1">
                              <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors">
                                <input 
                                  type="radio" 
                                  name="dateSortDashboard"
                                  checked={sortBy === 'newest'}
                                  onChange={() => setSortBy('newest')}
                                  className="w-3.5 h-3.5 cursor-pointer"
                                />
                                <span className="text-xs font-medium text-gray-700 group-hover:text-black">Newest First</span>
                              </label>
                              <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors">
                                <input 
                                  type="radio" 
                                  name="dateSortDashboard"
                                  checked={sortBy === 'oldest'}
                                  onChange={() => setSortBy('oldest')}
                                  className="w-3.5 h-3.5 cursor-pointer"
                                />
                                <span className="text-xs font-medium text-gray-700 group-hover:text-black">Oldest First</span>
                              </label>
                            </div>
                          </div>
                          <div className="border-t border-gray-100 pt-2">
                            <div className="flex justify-between items-center mb-1.5">
                              <h3 className="text-[10px] font-bold text-gray-500 uppercase">Amenities</h3>
                              {selectedAmenities.length > 0 && (
                                <button 
                                  onClick={() => setSelectedAmenities([])}
                                  className="text-[10px] font-bold text-red-500 hover:text-red-700 cursor-pointer"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                              {filterAmenities.map(amenity => (
                                <label key={amenity} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors">
                                  <div className="relative flex items-center">
                                    <input 
                                      type="checkbox" 
                                      className="peer h-3.5 w-3.5 cursor-pointer appearance-none rounded border border-gray-300 checked:bg-black checked:border-black transition-all"
                                      checked={selectedAmenities.includes(amenity)}
                                      onChange={() => toggleAmenity(amenity)}
                                    />
                                    <svg className="absolute w-2.5 h-2.5 pointer-events-none hidden peer-checked:block text-white left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                  </div>
                                  <span className="text-xs font-medium text-gray-700 group-hover:text-black transition-colors">{amenity}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </>
        )}

        {/* All Properties Section - Fixed height container to prevent layout shift */}
        <div className="mb-0">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2">
              <div className="mb-2 sm:mb-0 w-full sm:w-auto">
                  <h2 className="text-2xl font-black text-black uppercase">
                  {profile.role === 'landlord' ? 'Your Properties' : 'All Properties'}
                  </h2>
                  {profile.role === 'landlord' ? (
                    <p className="text-gray-500 text-sm mt-1">
                      Manage listings, assignments, and property details.
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500">List of Properties</p>
                  )}
              </div>
              
              <div className="flex items-center gap-4">
                {profile.role === 'landlord' ? (
                  <button
                  onClick={() => router.push('/properties/new')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-full shadow-lg text-sm font-semibold cursor-pointer"
                  >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add New Property
                  </button>
              ) : (
                /* See More link for Tenants */
                <span 
                  onClick={handleSeeMore}
                  className="text-sm font-semibold text-black hover:text-gray-600 cursor-pointer flex items-center gap-1"
                >
                  See More
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              )}
            </div>
        </div>
        
          {loading ? (
            <div className="text-center py-20 h-[400px] flex items-center justify-center">
               <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-black"></div>
            </div>
          ) : properties.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100 h-[400px] flex flex-col items-center justify-center">
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
            <div className={profile.role === 'tenant' ? 
                "grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4" : 
                "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
              }>
            {(profile.role === 'tenant' ? 
              // Show up to 8 properties for tenants
              properties.slice(0, maxDisplayItems)
            : properties).map((item) => {
              const property = item
              const images = getPropertyImages(property)
              const currentIndex = currentImageIndex[property.id] || 0
              const occupancy = getPropertyOccupancy(property.id)
              const isSelectedForCompare = comparisonList.some(p => p.id === property.id)
              const isFavorite = favorites.includes(property.id)
              const stats = propertyStats[property.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
              
              return (
                <div 
                  key={property.id} 
                  className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer flex flex-col  transition-all duration-300 ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100'}`}
                  onClick={() => handlePropertyAction(property.id)}
                >
                  {/* Image Slider - Top - Matches Guest Favorites card size */}
                  {/* TO ADJUST IMAGE ASPECT RATIO: Change aspect-[4/3] below */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                    <img 
                      src={images[currentIndex]} 
                      alt={property.title}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Top Right Icons - Favorite & Compare - Smaller on mobile */}
                    <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 md:top-3 md:right-3 z-20 flex items-center gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                       {/* Favorite Heart Button (Tenants Only) */}
                       {profile.role === 'tenant' && (
                         <button 
                           onClick={(e) => toggleFavorite(e, property.id)}
                           className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all cursor-pointer ${
                             isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:bg-white hover:text-red-500'
                           }`}
                           title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                         >
                           <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                           </svg>
                         </button>
                       )}

                       {/* Compare Checkbox */}
                       <label className="flex items-center cursor-pointer">
                         <input 
                           type="checkbox" 
                           className="hidden"
                           checked={isSelectedForCompare}
                           onChange={(e) => toggleComparison(e, property)}
                         />
                         <div className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all ${isSelectedForCompare ? 'bg-black text-white' : 'bg-white/90 text-gray-400 hover:bg-white'}`}>
                           {isSelectedForCompare ? (
                             <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                           ) : (
                             <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                           )}
                         </div>
                       </label>
                    </div>
                    
                    {/* Image Indicators - Smaller on mobile */}
                    {images.length > 1 && (
                      <div className="absolute bottom-1.5 sm:bottom-2 md:bottom-3 left-1/2 -translate-x-1/2 flex gap-0.5 sm:gap-1 z-10">
                        {images.map((_, idx) => (
                          <div
                            key={idx}
                            className={`h-0.5 sm:h-1 rounded-full transition-all duration-300 shadow-sm ${
                              idx === currentIndex ? 'w-3 sm:w-4 bg-white' : 'w-0.5 sm:w-1 bg-white/60'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>

                    {/* Status Badge & Guest Favorite Badge - Smaller on mobile */}
                    <div className="absolute top-1.5 sm:top-2 md:top-3 left-1.5 sm:left-2 md:left-3 z-10 flex flex-col gap-0.5 sm:gap-1">
                       <span className={`px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] uppercase font-bold tracking-wider rounded sm:rounded-md shadow-sm backdrop-blur-md ${
                        property.status === 'available'
                          ? 'bg-white text-black' 
                          : 'bg-black/80 text-white'
                      }`}>
                        {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
                      </span>
                      {stats.favorite_count >= 1 && (
                        <span className="px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] font-bold rounded sm:rounded-md shadow-sm backdrop-blur-md bg-gradient-to-r from-pink-500 to-red-500 text-white flex items-center gap-0.5 sm:gap-1">
                          <svg className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                          <span className="hidden sm:inline">Guest Favorite</span>
                        </span>
                      )}
                    </div>

                    {/* Price Overlay */}
                    <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-10 text-white">
                      <p className="text-sm sm:text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
                      <p className="text-[8px] sm:text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
                    </div>
                  </div>
                  
                  {/* Property Info - Bottom */}
                  <div className="p-1.5 sm:p-2">
                    <div className="mb-0.5 sm:mb-1">
                        <div className="flex justify-between items-start">
                            <h3 className="text-xs sm:text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
                            {/* Rating Display */}
                            {stats.review_count > 0 && (
                              <div className="flex items-center gap-1 text-xs shrink-0">
                                <svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24">
                                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                                <span className="font-bold text-gray-900">{stats.avg_rating.toFixed(1)}</span>
                                <span className="text-gray-400">({stats.review_count})</span>
                              </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1 text-gray-500 text-[10px] sm:text-xs">
                            <span className="truncate">{property.city}, Philippines</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 sm:gap-3 text-gray-600 text-[10px] sm:text-xs">
                       <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                         <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                         {property.bedrooms}
                       </span>
                       <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                       <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                         <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>
                         {property.bathrooms}
                       </span>
                       <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                       <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                         <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                         {property.area_sqft} sqm
                       </span>
                    </div>

                    {/* Landlord Actions Only */}
                    {profile.role === 'landlord' && (
                      <div className="mt-auto flex flex-col gap-2">
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
                        
                          {/* Landlord Actions (Assign/Kick Out) */}
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
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            
            </div>
          )}
        </div>

        {/* Guest Favorites Section (Tenants Only) */}
        {profile.role === 'tenant' && guestFavorites.length > 0 && (
          <div className="mb-2 mt-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Tenants Favorites</h2>
                <p className="text-sm text-gray-500">Most loved by our community</p>
              </div>
              {/* See More link */}
              <span 
                onClick={handleSeeMore}
                className="text-sm font-semibold text-black hover:text-gray-600 cursor-pointer flex items-center gap-1 mt-4 sm:mt-0"
              >
                See More
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {guestFavorites.slice(0, maxDisplayItems).map((property) => {
                  const images = getPropertyImages(property)
                  const currentIndex = currentImageIndex[property.id] || 0
                  const stats = propertyStats[property.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
                  const isFavorite = favorites.includes(property.id)
                  const isSelectedForCompare = comparisonList.some(p => p.id === property.id)
                  
                  return (
                    <div 
                      key={property.id} 
                      className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-md ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100'}`}
                      onClick={() => router.push(`/properties/${property.id}`)}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                        <img src={images[currentIndex]} alt={property.title} className="w-full h-full object-cover" />
                        <div className="absolute top-3 right-3 z-20 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={(e) => toggleFavorite(e, property.id)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all cursor-pointer ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:bg-white hover:text-red-500'}`}
                          >
                            <svg className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </button>
                          {/* Compare Checkbox */}
                          <label className="flex items-center cursor-pointer">
                            <input type="checkbox" className="hidden" checked={isSelectedForCompare} onChange={(e) => toggleComparison(e, property)} />
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all ${isSelectedForCompare ? 'bg-black text-white' : 'bg-white/90 text-gray-400 hover:bg-white'}`}>
                              {isSelectedForCompare ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                              )}
                            </div>
                          </label>
                        </div>
                        <div className="absolute top-3 left-3 z-10">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md shadow-sm backdrop-blur-md bg-gradient-to-r from-pink-500 to-red-500 text-white flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            {stats.favorite_count} favorites
                          </span>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>
                        <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-10 text-white">
                          <p className="text-sm sm:text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
                          <p className="text-[8px] sm:text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
                        </div>
                      </div>
                      <div className="p-2 sm:p-3">
                        <div className="mb-1 sm:mb-2">
                            <div className="flex justify-between items-start mb-0.5">
                              <h3 className="text-xs sm:text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
                              {stats.review_count > 0 && (
                                <div className="flex items-center gap-1 text-xs shrink-0">
                                  <svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24">
                                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                  </svg>
                                  <span className="font-bold text-gray-900">{stats.avg_rating.toFixed(1)}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-gray-500 text-[10px] sm:text-xs">
                                <span className="truncate">{property.city}, Philippines</span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 sm:gap-3 text-gray-600 text-[10px] sm:text-xs">
                           <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                             <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                             {property.bedrooms}
                           </span>
                           <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                           <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                             <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>
                             {property.bathrooms}
                           </span>
                           <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                           <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                             <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                             {property.area_sqft} sqm
                           </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Top Rated Section (Tenants Only) */}
        {profile.role === 'tenant' && topRated.length > 0 && (
          <div className="mb-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Top Rated</h2>
                <p className="text-sm text-gray-500">Highest rated by tenants</p>
              </div>
              {/* See More link */}
              <span 
                onClick={handleSeeMore}
                className="text-sm font-semibold text-black hover:text-gray-600 cursor-pointer flex items-center gap-1 mt-4 sm:mt-0"
              >
                See More
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {topRated.slice(0, maxDisplayItems).map((property) => {
                  const images = getPropertyImages(property)
                  const currentIndex = currentImageIndex[property.id] || 0
                  const stats = propertyStats[property.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
                  const isFavorite = favorites.includes(property.id)
                  const isSelectedForCompare = comparisonList.some(p => p.id === property.id)
                  
                  return (
                    <div 
                      key={property.id} 
                      className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-md ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100'}`}
                      onClick={() => router.push(`/properties/${property.id}`)}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                        <img src={images[currentIndex]} alt={property.title} className="w-full h-full object-cover" />
                        <div className="absolute top-3 right-3 z-20 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={(e) => toggleFavorite(e, property.id)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all cursor-pointer ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:bg-white hover:text-red-500'}`}
                          >
                            <svg className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </button>
                          {/* Compare Checkbox */}
                          <label className="flex items-center cursor-pointer">
                            <input type="checkbox" className="hidden" checked={isSelectedForCompare} onChange={(e) => toggleComparison(e, property)} />
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all ${isSelectedForCompare ? 'bg-black text-white' : 'bg-white/90 text-gray-400 hover:bg-white'}`}>
                              {isSelectedForCompare ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                              )}
                            </div>
                          </label>
                        </div>
                        <div className="absolute top-3 left-3 z-10">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md shadow-sm backdrop-blur-md bg-gradient-to-r from-yellow-400 to-orange-500 text-white flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            {stats.avg_rating.toFixed(1)} rating
                          </span>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>
                        <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-10 text-white">
                          <p className="text-sm sm:text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
                          <p className="text-[8px] sm:text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
                        </div>
                      </div>
                      <div className="p-2 sm:p-3">
                        <div className="mb-1 sm:mb-2">
                            <div className="flex justify-between items-start mb-0.5">
                              <h3 className="text-xs sm:text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
                              <div className="flex items-center gap-1 text-xs shrink-0">
                                <svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24">
                                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                                <span className="font-bold text-gray-900">{stats.avg_rating.toFixed(1)}</span>
                                <span className="text-gray-400">({stats.review_count})</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-gray-500 text-[10px] sm:text-xs">
                                <span className="truncate">{property.city}, Philippines</span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 sm:gap-3 text-gray-600 text-[10px] sm:text-xs">
                           <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                             <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                             {property.bedrooms}
                           </span>
                           <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                           <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                             <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>
                             {property.bathrooms}
                           </span>
                           <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                           <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                             <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                             {property.area_sqft} sqm
                           </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
      
      {/* --- NEW: Floating Compare Button --- */}
      {comparisonList.length > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40 animate-bounce-in">
          <button 
            onClick={handleCompareClick}
            className="bg-black text-white px-8 py-4 rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center gap-3 border-2 border-white/20 cursor-pointer"
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

      <Footer />
    </div>
  )
}