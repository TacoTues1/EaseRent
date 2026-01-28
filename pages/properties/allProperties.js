import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'
import Footer from '../../components/Footer'
import AuthModal from '../../components/AuthModal'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '../../components/ui/carousel'

export default function AllProperties() {
  const router = useRouter()
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [currentImageIndex, setCurrentImageIndex] = useState({})
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAmenities, setSelectedAmenities] = useState([])
  const [priceRange, setPriceRange] = useState({ min: '', max: '' })
  const [sortBy, setSortBy] = useState('newest')
  
  // --- New Filters ---
  const [minRating, setMinRating] = useState(0)
  const [filterMostFavorite, setFilterMostFavorite] = useState(false)

  // --- Responsive Filters State ---
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  
  // --- Comparison Feature State ---
  const [comparisonList, setComparisonList] = useState([])

  // --- Favorites State ---
  const [favorites, setFavorites] = useState([])
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('signin')

  // --- Property Stats (ratings, favorite counts) ---
  const [propertyStats, setPropertyStats] = useState({})

  // --- Featured Properties (Guest Favorites, Top Rated) ---
  const [guestFavorites, setGuestFavorites] = useState([])
  const [topRated, setTopRated] = useState([])

  // Carousel Item Class for responsiveness
  const carouselItemClass = "basis-full sm:basis-1/2 md:basis-1/3 lg:basis-1/4 pl-4"

  const filterAmenities = [
    'Kitchen', 'Wifi', 'Pool', 'TV', 'Elevator', 'Air conditioning', 'Heating Shower',
    'Washing machine', 'Dryer', 'Parking', 'Gym', 'Security', 'Balcony', 'Garden',
    'Pet friendly', 'Furnished', 'Carbon monoxide alarm', 'Smoke alarm', 'Fire extinguisher', 'First aid kit'
  ]

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
        loadUserFavorites(result.data.session.user.id)
      }
    })
    loadPropertyStats()
    loadFeaturedProperties()
  }, [])

  // Parse URL query parameters
  useEffect(() => {
    if (router.isReady) {
      const { search, minPrice, maxPrice, amenities, sort } = router.query
      if (search) setSearchQuery(search)
      if (minPrice || maxPrice) {
        setPriceRange({ min: minPrice || '', max: maxPrice || '' })
      }
      if (amenities) {
        setSelectedAmenities(amenities.split(','))
      }
      if (sort) setSortBy(sort)
    }
  }, [router.isReady, router.query])

  useEffect(() => {
    if (router.isReady) {
      loadProperties()
    }
  }, [sortBy, router.isReady])

  // Real-time Search Effect
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      loadProperties()
    }, 300)
    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery, selectedAmenities, priceRange, minRating, filterMostFavorite, propertyStats])

  // Disable body scroll when mobile filters are open
  useEffect(() => {
    if (showMobileFilters) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showMobileFilters])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (data) setProfile(data)
  }

  async function loadUserFavorites(userId) {
    if (!session) return
    const { data } = await supabase.from('favorites').select('property_id').eq('user_id', session.user.id)
    if (data) setFavorites(data.map(f => f.property_id))
  }

  async function loadPropertyStats() {
    const { data } = await supabase.from('property_stats').select('*')
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
  }

  async function loadFeaturedProperties() {
    const { data: allProps } = await supabase
      .from('properties')
      .select('*, landlord_profile:profiles!properties_landlord_fkey(first_name, last_name)')
      .eq('is_deleted', false)

    const { data: stats } = await supabase
      .from('property_stats')
      .select('*')

    if (allProps && stats) {
      const statsMap = {}
      stats.forEach(s => { 
        statsMap[s.property_id] = { 
          favorite_count: s.favorite_count || 0, 
          avg_rating: s.avg_rating || 0, 
          review_count: s.review_count || 0 
        } 
      })

      setPropertyStats(statsMap)

      // Guest Favorites
      const favorites = allProps
        .filter(p => (statsMap[p.id]?.favorite_count || 0) >= 1)
        .sort((a, b) => (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0))
        .slice(0, 16)
      setGuestFavorites(favorites)

      // Top Rated
      const rated = allProps
        .filter(p => (statsMap[p.id]?.review_count || 0) > 0)
        .sort((a, b) => (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0))
        .slice(0, 16)
      setTopRated(rated)
    }
  }

  async function toggleFavorite(e, propertyId) {
    e.stopPropagation()
    if (!session) {
      setAuthMode('signin')
      setShowAuthModal(true)
      return
    }
    const isFavorite = favorites.includes(propertyId)
    if (isFavorite) {
      const { error } = await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('property_id', propertyId)
      if (!error) {
        setFavorites(prev => prev.filter(id => id !== propertyId))
        loadPropertyStats()
        loadFeaturedProperties()
      }
    } else {
      const { error } = await supabase.from('favorites').insert({ user_id: session.user.id, property_id: propertyId })
      if (!error) {
        setFavorites(prev => [...prev, propertyId])
        loadPropertyStats()
        loadFeaturedProperties()
      }
    }
  }

  async function loadProperties() {
    setLoading(true)
    let query = supabase.from('properties').select('*').eq('is_deleted', false)

    if (searchQuery.trim()) {
      query = query.or(`title.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
    }
    if (priceRange.min) query = query.gte('price', parseInt(priceRange.min))
    if (priceRange.max) query = query.lte('price', parseInt(priceRange.max))

    if (sortBy === 'newest') query = query.order('created_at', { ascending: false })
    else if (sortBy === 'oldest') query = query.order('created_at', { ascending: true })
    else if (sortBy === 'price_low') query = query.order('price', { ascending: true })
    else if (sortBy === 'price_high') query = query.order('price', { ascending: false })

    const { data, error } = await query
    if (error) {
      console.error('Error loading properties:', error)
      setLoading(false)
      return
    }

    let filteredData = data || []
    
    // 1. Amenity Filter
    if (selectedAmenities.length > 0) {
      filteredData = filteredData.filter(property => {
        if (!property.amenities || !Array.isArray(property.amenities)) return false
        return selectedAmenities.every(amenity =>
          property.amenities.some(a => a.toLowerCase().includes(amenity.toLowerCase()))
        )
      })
    }

    // 2. Rating Filter (Client Side using propertyStats)
    if (minRating > 0) {
      filteredData = filteredData.filter(property => {
        const stats = propertyStats[property.id] || { avg_rating: 0 }
        return Math.round(stats.avg_rating) >= minRating
      })
    }

    // 3. Most Favorite Filter (Client Side)
    if (filterMostFavorite) {
       filteredData = filteredData.filter(property => {
        const stats = propertyStats[property.id] || { favorite_count: 0 }
        return stats.favorite_count >= 1 
      })
    }

    setProperties(filteredData)
    setLoading(false)
  }

  const getPropertyImages = (property) => {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) {
      return property.images
    }
    return ['https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop']
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

  const toggleAmenityFilter = (amenity) => {
    setSelectedAmenities(prev =>
      prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]
    )
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedAmenities([])
    setPriceRange({ min: '', max: '' })
    setSortBy('newest')
    setMinRating(0)
    setFilterMostFavorite(false)
  }

  const toggleComparison = (e, property) => {
    e.stopPropagation()
    setComparisonList(prev => {
      const isSelected = prev.some(p => p.id === property.id)
      if (isSelected) {
        return prev.filter(p => p.id !== property.id)
      } else {
        if (prev.length >= 3) {
          alert("You can only compare up to 3 properties at a time.")
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

  // --- REUSABLE FILTER CONTENT COMPONENT ---
  const FilterContent = () => (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Search</p>
        <div className="relative">
            <input 
              type="text" 
              placeholder="City, Address, Title..." 
              className="w-full bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent font-medium pl-9 pr-3 py-2.5 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <svg className="absolute left-3 top-3 text-gray-400 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
        </div>
      </div>

      {/* Price Range */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Price (₱)</p>
        <div className="flex items-center gap-2">
          <input 
              type="number" 
              placeholder="Min" 
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-black"
              value={priceRange.min}
              onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
            />
            <span className="text-gray-400">-</span>
            <input 
              type="number" 
              placeholder="Max" 
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-black"
              value={priceRange.max}
              onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
            />
        </div>
      </div>

      {/* Star Rating Filter */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Top Rated</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button 
              key={star}
              onClick={() => setMinRating(prev => prev === star ? 0 : star)}
              className="focus:outline-none"
            >
              <svg 
                className={`w-6 h-6 transition-colors cursor-pointer ${star <= minRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} 
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={star <= minRating ? 0 : 1.5}
              >
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-1">{minRating > 0 ? `${minRating}+ Stars` : 'All Ratings'}</p>
      </div>

      {/* Most Favorite Filter */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Popularity</p>
        <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={filterMostFavorite}
                  onChange={() => setFilterMostFavorite(prev => !prev)}
              />
              <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
            </div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-black">Most Favorite</span>
        </label>
      </div>

      {/* Amenities */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Amenities</p>
        <div className="flex flex-col gap-2">
            {filterAmenities.map(amenity => (
              <label key={amenity} className="flex items-center gap-2 cursor-pointer group">
                <div className="relative flex items-center">
                  <input 
                    type="checkbox" 
                    className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 checked:bg-black checked:border-black transition-all"
                    checked={selectedAmenities.includes(amenity)}
                    onChange={() => toggleAmenityFilter(amenity)}
                  />
                  <svg className="absolute w-2.5 h-2.5 pointer-events-none hidden peer-checked:block text-white left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <span className="text-sm text-gray-600 group-hover:text-black transition-colors">{amenity}</span>
              </label>
            ))}
        </div>
      </div>

      {/* Sort By */}
      <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">Sort By</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sort" checked={sortBy === 'newest'} onChange={() => setSortBy('newest')} className="accent-black h-4 w-4" />
                <span className="text-sm text-gray-700">Newest First</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sort" checked={sortBy === 'oldest'} onChange={() => setSortBy('oldest')} className="accent-black h-4 w-4" />
                <span className="text-sm text-gray-700">Oldest First</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sort" checked={sortBy === 'price_low'} onChange={() => setSortBy('price_low')} className="accent-black h-4 w-4" />
                <span className="text-sm text-gray-700">Price: Low to High</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sort" checked={sortBy === 'price_high'} onChange={() => setSortBy('price_high')} className="accent-black h-4 w-4" />
                <span className="text-sm text-gray-700">Price: High to Low</span>
            </label>
          </div>
      </div>
    </div>
  )

  const renderPropertyCard = (property) => {
    const images = getPropertyImages(property)
    const currentIndex = currentImageIndex[property.id] || 0
    const isSelectedForCompare = comparisonList.some(p => p.id === property.id)
    const isFavorite = favorites.includes(property.id)
    const stats = propertyStats[property.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
    const isTenantsFavorite = stats.favorite_count >= 3 

    return (
        <div 
          key={property.id} 
          className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer flex flex-col h-full ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100'}`}
          onClick={() => router.push(`/properties/${property.id}`)}
        >
          {/* Image Slider */}
          <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
            <img 
              src={images[currentIndex]} 
              alt={property.title}
              className="w-full h-full object-cover"
            />
            
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {/* Favorite */}
              <button 
                onClick={(e) => toggleFavorite(e, property.id)}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm cursor-pointer ${
                  isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:bg-white hover:text-red-500'
                }`}
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>

              {/* Compare */}
              <label className="flex items-center gap-2 cursor-pointer group/check">
                  <input 
                    type="checkbox" 
                    className="hidden"
                    checked={isSelectedForCompare}
                    onChange={(e) => toggleComparison(e, property)}
                  />
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm ${isSelectedForCompare ? 'bg-black text-white' : 'bg-white/90 text-gray-400 hover:bg-white'}`}>
                    {isSelectedForCompare ? (
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    )}
                  </div>
              </label>
            </div>

            {/* Arrows (Hidden on mobile for cleaner look, shown on hover/desktop) */}
            {images.length > 1 && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden sm:block">
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
            
            {/* Dots */}
            {images.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                {images.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1 rounded-full shadow-sm ${
                      idx === currentIndex ? 'w-3 sm:w-4 bg-white' : 'w-1 bg-white/60'
                    }`}
                  />
                ))}
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>

            {/* Top Left Badges */}
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 items-start">
              <span className={`px-2 py-0.5 text-[9px] sm:text-[10px] uppercase font-bold tracking-wider rounded-md shadow-sm backdrop-blur-md ${
                property.status === 'available' ? 'bg-white text-black' : 'bg-black/80 text-white'
              }`}>
                {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
              </span>
              
              {/* Tenants Favorite Badge */}
              {isTenantsFavorite && (
                 <span className="px-2 py-0.5 text-[9px] sm:text-[10px] uppercase font-bold tracking-wider rounded-md shadow-sm backdrop-blur-md bg-rose-500 text-white flex items-center gap-1">
                   <svg className="w-3 h-3 fill-current hidden sm:block" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                   Favorite
                 </span>
              )}
            </div>

            <div className="absolute bottom-3 left-3 z-10 text-white">
              <p className="text-base sm:text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
              <p className="text-[8px] sm:text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
            </div>
          </div>
          
          {/* Info */}
          <div className="p-3 sm:p-4 flex-1 flex flex-col">
            <div className="mb-2">
                <div className="flex justify-between items-start mb-0.5">
                    <h3 className="text-sm sm:text-base font-bold text-gray-900 line-clamp-1 break-all">{property.title}</h3>
                </div>
                
                <div className="flex items-center gap-1 text-gray-500 text-xs mb-2">
                    <span className="truncate max-w-[150px]">{property.city}, PH</span>
                </div>

                {/* Ratings Section */}
                <div className="flex items-center gap-2 mb-2 sm:mb-3 bg-gray-50 p-1 rounded-lg w-fit">
                    <div className="flex items-center gap-0.5">
                        <svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24">
                          <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                        <span className="font-bold text-gray-900 text-xs sm:text-sm">{stats.avg_rating > 0 ? stats.avg_rating.toFixed(1) : ''}</span>
                    </div>
                    {stats.review_count > 0 ? (
                       <span className="text-[9px] sm:text-[10px] text-gray-500 font-medium">({stats.review_count})</span>
                    ) : (
                       <span className="text-[9px] sm:text-[10px] text-gray-400 font-medium">No Reviews</span>
                    )}
                </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-gray-600 text-[10px] sm:text-xs mt-auto">
              <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap"><svg 
                  className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" 
                  fill="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
                </svg> {property.bedrooms} Beds</span>
              <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
              <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap">
                <svg
                    className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" />
                  </svg> {property.bathrooms} Baths</span>
              <span className="hidden sm:inline w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
              <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>{property.area_sqft || 0} sqm</span>
            </div>
          </div>
        </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans text-black flex flex-col">
      <div className="max-w-[1500px] mx-auto w-full px-4 sm:px-6 py-6 flex-1">
        
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* --- LEFT PANEL: FILTERS (DESKTOP STICKY) --- */}
          <aside className="hidden lg:block w-64 shrink-0 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm h-fit lg:sticky lg:top-24">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-bold text-lg">Filters</h3>
               {(searchQuery || selectedAmenities.length > 0 || priceRange.min || priceRange.max || minRating > 0 || filterMostFavorite) && (
                  <button onClick={clearFilters} className="text-xs font-bold text-red-500 hover:text-red-700">
                    Clear All
                  </button>
               )}
            </div>
            <FilterContent />
          </aside>

          {/* --- MOBILE FILTER TOGGLE & BOTTOM SHEET --- */}
          <div className="lg:hidden w-full mb-4 flex justify-between items-center">
             <div>
                <h2 className="text-xl font-black text-black uppercase">Properties</h2>
                <p className="text-xs text-gray-500">
                  {loading ? 'Searching...' : `${properties.length} results`}
                </p>
             </div>
             
             {/* Filter Trigger Button */}
             <button 
                onClick={() => setShowMobileFilters(true)}
                className="flex items-center gap-2 bg-white border border-gray-200 shadow-sm px-4 py-2 rounded-xl text-sm font-bold"
             >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Filters
             </button>
          </div>

          {/* --- MOBILE FIXED BOTTOM SHEET --- */}
          {showMobileFilters && (
             <div className="fixed inset-0 z-[60] lg:hidden">
                {/* Backdrop - Removed backdrop-blur-sm and reduced opacity */}
                <div 
                  className="absolute inset-0 bg-black/25 transition-opacity"
                  onClick={() => setShowMobileFilters(false)}
                ></div>
                
                {/* Slide-up Panel - Adjusted Height to h-[70vh] */}
                <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl h-[55vh] shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-300">
                   
                   {/* Header */}
                   <div className="flex items-center justify-between p-5 border-b border-gray-100">
                      <h3 className="font-bold text-xl">Filters</h3>
                      <button 
                        onClick={() => setShowMobileFilters(false)}
                        className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"
                      >
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                   </div>
                   
                   {/* Scrollable Content */}
                   <div className="flex-1 overflow-y-auto p-5 pb-24">
                      <FilterContent />
                   </div>

                   {/* Fixed Bottom Action */}
                   <div className="absolute bottom-0 left-0 right-0 p-5 bg-white border-t border-gray-100">
                      <div className="flex gap-4">
                        <button 
                            onClick={clearFilters}
                            className="px-6 py-3 font-bold text-black bg-gray-100 rounded-xl"
                        >
                            Clear
                        </button>
                        <button 
                            onClick={() => setShowMobileFilters(false)}
                            className="flex-1 py-3 bg-black text-white font-bold rounded-xl shadow-lg"
                        >
                            Show {properties.length} Results
                        </button>
                      </div>
                   </div>
                </div>
             </div>
          )}

          {/* --- RIGHT PANEL: ALL PROPERTIES --- */}
          <main className="flex-1 w-full">
            
            <div className="hidden lg:block mb-6">
              <h2 className="text-2xl font-black text-black uppercase">All Properties</h2>
              <p className="text-sm text-gray-500">
                {loading ? 'Searching...' : `Showing ${properties.length} results`}
              </p>
            </div>

            {loading ? (
              <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-black"></div>
              </div>
            ) : properties.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-50 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">No properties found</h3>
                <p className="text-gray-500 mb-6 max-w-sm mx-auto text-sm">
                  We couldn't find any properties matching your filters.
                </p>
                <button onClick={clearFilters} className="px-5 py-2 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors cursor-pointer">
                  Clear Filters
                </button>
              </div>
            ) : (
              // GRID: 2 Columns Mobile, 3 lg, 4 xl
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 mb-12">
                {properties.map((property) => renderPropertyCard(property))}
              </div>
            )}
          </main>
        </div>

        {/* Floating Compare Button */}
        {comparisonList.length > 0 && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40 w-[90%] sm:w-auto">
            <button 
              onClick={handleCompareClick}
              className="bg-black w-full sm:w-auto text-white px-8 py-4 rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center justify-center gap-3 border-2 border-white/20 cursor-pointer"
            >
              <span className="relative">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-black">
                  {comparisonList.length}
                </span>
              </span>
              <span className="font-bold text-sm uppercase tracking-wider">Compare</span>
              {comparisonList.length < 2 && (
                 <span className="hidden sm:inline text-xs text-gray-400 font-normal normal-case">(Select at least 2)</span>
              )}
            </button>
          </div>
        )}
      </div>

      <Footer />
      
      {/* Auth Modal for favorites */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
        initialMode={authMode}
      />
    </div>
  )
}