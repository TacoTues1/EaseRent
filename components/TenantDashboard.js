import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { createNotification } from '../lib/notifications'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Footer from './Footer'
import { Card, CardContent } from './ui/card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from './ui/carousel'

export default function TenantDashboard({ session, profile }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState({})
  
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
  
  // --- Comparison Feature State ---
  const [comparisonList, setComparisonList] = useState([])
  
  // --- Favorites & Property Stats ---
  const [favorites, setFavorites] = useState([])
  const [propertyStats, setPropertyStats] = useState({})
  const [guestFavorites, setGuestFavorites] = useState([])
  const [topRated, setTopRated] = useState([])
  
  const maxDisplayItems = 16 
  const router = useRouter()

  const filterAmenities = ['Wifi', 'Pool', 'Gym', 'Parking', 'Air conditioning', 'Pet friendly']

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
    }, 3000)
    return () => clearInterval(interval)
  }, [properties, guestFavorites, topRated])

  useEffect(() => {
    if (profile) {
      loadProperties()
      loadPropertyStats()
      loadTenantOccupancy()
      checkPendingReviews(session.user.id)
      loadUserFavorites()
      loadFeaturedSections()
    }
  }, [profile])

  async function checkPendingReviews(userId) {
    const { data: endedOccupancies } = await supabase.from('tenant_occupancies').select('*, property:properties(id, title)').eq('tenant_id', userId).eq('status', 'ended')
    if (!endedOccupancies || endedOccupancies.length === 0) return
    const { data: existingReviews } = await supabase.from('reviews').select('occupancy_id').eq('user_id', userId)
    const reviewedOccupancyIds = existingReviews?.map(r => r.occupancy_id) || []
    const unreviewed = endedOccupancies.find(o => !reviewedOccupancyIds.includes(o.id))
    if (unreviewed) { setReviewTarget(unreviewed); setShowReviewModal(true) }
  }

  async function submitReview() {
    if (!reviewTarget) return
    setSubmittingReview(true)
    const { error } = await supabase.from('reviews').insert({ property_id: reviewTarget.property_id, user_id: session.user.id, tenant_id: session.user.id, occupancy_id: reviewTarget.id, rating: reviewRating, comment: reviewComment, created_at: new Date().toISOString() })
    if (error) { 
      showToast.error("Failed to submit review", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
 
      console.error(error) 
    } 
    else { 
      showToast.success("Review submitted successfully!", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      setShowReviewModal(false); checkPendingReviews(session.user.id) }
    setSubmittingReview(false)
  }

  const toggleAmenity = (amenity) => { setSelectedAmenities(prev => prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]) }

  const toggleComparison = (e, property) => {
    e.stopPropagation() 
    setComparisonList(prev => {
      const isSelected = prev.some(p => p.id === property.id)
      if (isSelected) return prev.filter(p => p.id !== property.id)
      else {
        if (prev.length >= 3) { 
          showToast.error("You can only compare up to 3 properties.", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
          return prev }
        return [...prev, property]
      }
    })
  }

  const handleCompareClick = () => { const ids = comparisonList.map(p => p.id).join(','); router.push(`/compare?ids=${ids}`) }

  async function loadProperties() {
    setLoading(true)
    let query = supabase.from('properties').select('*, landlord_profile:profiles!properties_landlord_fkey(id, first_name, middle_name, last_name, role)')
    const { data, error } = await query
    if (error) console.error('Error loading properties:', error)
    setProperties(data || [])
    setLoading(false)
  }

  const handleSeeMore = () => { router.push('/properties') }
  
  const handleSearch = () => {
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

  async function loadTenantOccupancy() {
    const { data } = await supabase.from('tenant_occupancies').select(`*, property:properties(id, title, address, city, images), landlord:profiles!tenant_occupancies_landlord_id_fkey(id, first_name, middle_name, last_name)`).eq('tenant_id', session.user.id).in('status', ['active', 'pending_end']).maybeSingle()
    setTenantOccupancy(data)
  }

  async function loadUserFavorites() {
    if (!session) return
    const { data } = await supabase.from('favorites').select('property_id').eq('user_id', session.user.id)
    if (data) setFavorites(data.map(f => f.property_id))
  }

  async function loadPropertyStats() {
    const { data } = await supabase.from('property_stats').select('*')
    if (data) {
      const statsMap = {}
      data.forEach(stat => { statsMap[stat.property_id] = { favorite_count: stat.favorite_count || 0, avg_rating: stat.avg_rating || 0, review_count: stat.review_count || 0 } })
      setPropertyStats(statsMap)
    }
  }

  async function loadFeaturedSections() {
    const { data: allProps } = await supabase.from('properties').select('*').eq('status', 'available')
    const { data: stats } = await supabase.from('property_stats').select('*')
    if (allProps && stats) {
      const statsMap = {}
      stats.forEach(s => { statsMap[s.property_id] = { favorite_count: s.favorite_count || 0, avg_rating: s.avg_rating || 0, review_count: s.review_count || 0 } })
      const favorites = allProps.filter(p => statsMap[p.id]?.favorite_count >= 1).sort((a, b) => (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0)).slice(0, maxDisplayItems)
      setGuestFavorites(favorites)
      const rated = allProps.filter(p => statsMap[p.id]?.review_count > 0).sort((a, b) => (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0)).slice(0, maxDisplayItems)
      setTopRated(rated)
    }
  }

  async function toggleFavorite(e, propertyId) {
    e.stopPropagation()
    if (!session) { 
      showToast.error('Please login to save favorites', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      return }
    const isFavorite = favorites.includes(propertyId)
    if (isFavorite) {
      await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('property_id', propertyId)
      setFavorites(favorites.filter(id => id !== propertyId))
      showToast.success('Removed from favorites', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
    } else {
      await supabase.from('favorites').insert({ user_id: session.user.id, property_id: propertyId })
      setFavorites([...favorites, propertyId])
      showToast.success("Added to favorites", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

    }
    loadPropertyStats(); loadFeaturedSections()
  }

  async function requestEndOccupancy() {
    if (!tenantOccupancy) return; setSubmittingEndRequest(true)
    const { error } = await supabase.from('tenant_occupancies').update({ status: 'pending_end', end_requested_at: new Date().toISOString(), end_request_reason: endRequestReason.trim() || 'No reason', end_request_status: 'pending' }).eq('id', tenantOccupancy.id)
    if (error) { 
      showToast.error("Failed to submit request", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

      setSubmittingEndRequest(false); 
      return 
    }
    await createNotification({ recipient: tenantOccupancy.landlord_id, actor: session.user.id, type: 'end_occupancy_request', message: `${profile.first_name} ${profile.last_name} requested to end occupancy at "${tenantOccupancy.property?.title}".`, link: '/dashboard' })
     showToast.success("Request submitted", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

    setShowEndRequestModal(false); setEndRequestReason(''); setSubmittingEndRequest(false); loadTenantOccupancy()
  }

  const getPropertyImages = (property) => {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) return property.images
    return []
  }

  const PropertyCard = ({ property, images, currentIndex, isSelectedForCompare, isFavorite, stats }) => (
    <div 
        className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer flex flex-col transition-all duration-300 h-full ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100'}`}
        onClick={() => router.push(`/properties/${property.id}`)}
    >
        <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
            <img src={images[currentIndex]} alt={property.title} className="w-full h-full object-cover" />
            
            {/* Action Buttons (Original with Compare & Favorite) */}
            <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 md:top-3 md:right-3 z-20 flex items-center gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                <button onClick={(e) => toggleFavorite(e, property.id)} className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all cursor-pointer ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:bg-white hover:text-red-500'}`}>
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                </button>
                <label className="flex items-center cursor-pointer">
                    <input type="checkbox" className="hidden" checked={isSelectedForCompare} onChange={(e) => toggleComparison(e, property)} />
                    <div className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all ${isSelectedForCompare ? 'bg-black text-white' : 'bg-white/90 text-gray-400 hover:bg-white'}`}>
                        {isSelectedForCompare ? (<svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>) : (<svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>)}
                    </div>
                </label>
            </div>
            
            {/* Image Indicators */}
            {images.length > 1 && (
                <div className="absolute bottom-1.5 sm:bottom-2 md:bottom-3 left-1/2 -translate-x-1/2 flex gap-0.5 sm:gap-1 z-10">
                {images.map((_, idx) => (
                    <div key={idx} className={`h-0.5 sm:h-1 rounded-full transition-all duration-300 shadow-sm ${idx === currentIndex ? 'w-3 sm:w-4 bg-white' : 'w-0.5 sm:w-1 bg-white/60'}`} />
                ))}
                </div>
            )}

            {/* Gradient & Labels */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>
            <div className="absolute top-1.5 sm:top-2 md:top-3 left-1.5 sm:left-2 md:left-3 z-10 flex flex-col gap-0.5 sm:gap-1">
                <span className={`px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] uppercase font-bold tracking-wider rounded sm:rounded-md shadow-sm backdrop-blur-md ${property.status === 'available' ? 'bg-white text-black' : 'bg-black/80 text-white'}`}>{property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}</span>
                {stats.favorite_count >= 1 && (<span className="px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] font-bold rounded sm:rounded-md shadow-sm backdrop-blur-md bg-gradient-to-r from-pink-500 to-red-500 text-white flex items-center gap-0.5 sm:gap-1"><svg className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg><span className="hidden sm:inline">Guest Favorite</span></span>)}
            </div>
            <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-10 text-white">
                <p className="text-sm sm:text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
                <p className="text-[8px] sm:text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
            </div>
        </div>
        
        {/* Card Body */}
        <div className="p-1.5 sm:p-2">
            <div className="mb-0.5 sm:mb-1">
                <div className="flex justify-between items-start">
                    <h3 className="text-xs sm:text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
                    {stats.review_count > 0 && (<div className="flex items-center gap-1 text-xs shrink-0"><svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg><span className="font-bold text-gray-900">{stats.avg_rating.toFixed(1)}</span><span className="text-gray-400">({stats.review_count})</span></div>)}
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
        </div>
    </div>
  )

  // Layout Logic: 2 cards on phone, 4 on tablet, 7 on laptop/desktop
  const carouselItemClass = "pl-2 basis-1/2 md:basis-1/4 lg:basis-[16.66%]"

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col scroll-smooth">
      <div className="max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10 flex-1">
        
        {/* Tenant Current Occupancy Section */}
        {tenantOccupancy && (
          <div className="mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col sm:flex-row gap-4 items-center">
              <div className="w-full sm:w-24 h-24 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden relative">
                 {tenantOccupancy.property?.images && tenantOccupancy.property.images.length > 0 ? (
                   <img src={tenantOccupancy.property.images[0]} alt="Property" className="w-full h-full object-cover" />
                 ) : (
                   <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                   </div>
                 )}
              </div>
              <div className="flex-1 w-full min-w-0">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                   <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-gray-900 truncate">{tenantOccupancy.property?.title}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${tenantOccupancy.status === 'pending_end' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                            {tenantOccupancy.status === 'pending_end' ? 'Moving Out' : 'Active'}
                         </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {tenantOccupancy.property?.address}, {tenantOccupancy.property?.city}
                      </p>
                   </div>
                   <div className="flex-shrink-0">
                     {tenantOccupancy.status === 'pending_end' ? (
                        <span className="text-xs font-medium text-yellow-600 flex items-center bg-yellow-50 px-2 py-1 rounded-lg">
                          <svg className="w-3 h-3 mr-1 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          Request Pending
                        </span>
                     ) : (
                        <button onClick={() => setShowEndRequestModal(true)} className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors w-full sm:w-auto cursor-pointer">End Contract</button>
                     )}
                   </div>
                </div>
              </div>
            </div>
          </div>
        )}

       {/* All Properties Section - Carousel */}
        <div className="mb-0 mt-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2">
                <div className="mb-2 sm:mb-0 w-full sm:w-auto">
                    <h2 className="text-2xl font-black text-black uppercase">All Properties</h2>
                    <p className="text-sm text-gray-500">List of Properties</p>
                </div>
                <span onClick={handleSeeMore} className="text-sm font-semibold text-black hover:text-gray-600 cursor-pointer flex items-center gap-1">
                    See More Properties<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </span>
            </div>
            
            {loading ? (
                <div className="text-center py-20 h-[400px] flex items-center justify-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-black"></div>
                </div>
            ) : properties.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100 h-[400px] flex flex-col items-center justify-center">
                <h3 className="text-xl font-bold text-gray-900 mb-2">No properties found</h3>
                <p className="text-gray-500 mb-8 max-w-sm mx-auto">No properties match your search.</p>
                </div>
            ) : (
                <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)] cursor-pointer">
                    <CarouselContent className="-ml-2">
                        {properties.slice(0, maxDisplayItems).map((item) => {
                             const images = getPropertyImages(item)
                             const currentIndex = currentImageIndex[item.id] || 0
                             const isSelectedForCompare = comparisonList.some(p => p.id === item.id)
                             const isFavorite = favorites.includes(item.id)
                             const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
                             
                             return (
                                <CarouselItem key={item.id} className={carouselItemClass}>
                                    <div className="p-1 h-full">
                                        <PropertyCard 
                                            property={item} 
                                            images={images} 
                                            currentIndex={currentIndex} 
                                            isSelectedForCompare={isSelectedForCompare} 
                                            isFavorite={isFavorite} 
                                            stats={stats} 
                                        />
                                    </div>
                                </CarouselItem>
                             )
                        })}
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                </Carousel>
            )}
        </div>

        {/* Guest Favorites Section - Carousel */}
        {guestFavorites.length > 0 && (
            <div className="mb-2 mt-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Tenants Favorites</h2>
                    <p className="text-sm text-gray-500">Most loved by our community</p>
                </div>
                </div>
                <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)]">
                    <CarouselContent className="-ml-2">
                        {guestFavorites.slice(0, maxDisplayItems).map((item) => {
                             const images = getPropertyImages(item)
                             const currentIndex = currentImageIndex[item.id] || 0
                             const isSelectedForCompare = comparisonList.some(p => p.id === item.id)
                             const isFavorite = favorites.includes(item.id)
                             const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
                             
                             return (
                                <CarouselItem key={item.id} className={carouselItemClass}>
                                    <div className="p-1 h-full">
                                        <PropertyCard 
                                            property={item} 
                                            images={images} 
                                            currentIndex={currentIndex} 
                                            isSelectedForCompare={isSelectedForCompare} 
                                            isFavorite={isFavorite} 
                                            stats={stats} 
                                        />
                                    </div>
                                </CarouselItem>
                             )
                        })}
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                </Carousel>
            </div>
        )}

        {/* Top Rated Section - Carousel */}
        {topRated.length > 0 && (
            <div className="mb-10">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Top Rated</h2>
                    <p className="text-sm text-gray-500">Highest rated by tenants</p>
                </div>
                </div>
                <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)]">
                    <CarouselContent className="-ml-1">
                        {topRated.slice(0, maxDisplayItems).map((item) => {
                             const images = getPropertyImages(item)
                             const currentIndex = currentImageIndex[item.id] || 0
                             const isSelectedForCompare = comparisonList.some(p => p.id === item.id)
                             const isFavorite = favorites.includes(item.id)
                             const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
                             
                             return (
                                <CarouselItem key={item.id} className="pl-2 basis-1/2 md:basis-1/4 lg:basis-[14.28%]">
                                    <div className="p-1 h-full">
                                        <PropertyCard 
                                            property={item} 
                                            images={images} 
                                            currentIndex={currentIndex} 
                                            isSelectedForCompare={isSelectedForCompare} 
                                            isFavorite={isFavorite} 
                                            stats={stats} 
                                        />
                                    </div>
                                </CarouselItem>
                             )
                        })}
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                </Carousel>
            </div>
        )}
      </div>
      
      {/* Floating Compare Button */}
      {comparisonList.length > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40 animate-bounce-in">
          <button onClick={handleCompareClick} className="bg-black text-white px-8 py-4 rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center gap-3 border-2 border-white/20 cursor-pointer">
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

      {/* End Request Modal */}
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

      {/* Review Modal */}
      {showReviewModal && reviewTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in-95 duration-200">
             <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
             </div>
             <h2 className="text-2xl font-bold text-gray-900 mb-2">How was your stay?</h2>
             <p className="text-gray-500 text-sm mb-6">You recently ended your contract at <strong>{reviewTarget.property?.title}</strong>. Please leave a review to continue.</p>
             <div className="flex justify-center gap-2 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} onClick={() => setReviewRating(star)} className="focus:outline-none transition-transform hover:scale-110">
                    <svg className={`w-8 h-8 ${star <= reviewRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                  </button>
                ))}
             </div>
             <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Write your experience here..." className="w-full p-4 border border-gray-200 rounded-xl mb-6 text-sm bg-gray-50 focus:bg-white focus:border-black outline-none resize-none h-32" />
             <button onClick={submitReview} disabled={submittingReview || !reviewComment.trim()} className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all ${submittingReview || !reviewComment.trim() ? 'bg-gray-300 cursor-not-allowed' : 'bg-black hover:bg-gray-800 hover:shadow-xl'}`}>{submittingReview ? 'Submitting...' : 'Submit Review'}</button>
          </div>
        </div>
      )}
      <Footer />
    </div>
  )
}