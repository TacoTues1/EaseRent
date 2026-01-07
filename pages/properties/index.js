import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Footer from '../../components/Footer'
import AuthModal from '../../components/AuthModal'
import PropertyCard from '../../components/PropertyCard'

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
  
  // --- Filter Dropdown State ---
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [showPriceDropdown, setShowPriceDropdown] = useState(false)
  const filterRef = useRef(null)
  const priceRef = useRef(null)

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

  // Common amenities to filter by
  const filterAmenities = [
    'Wifi', 'Pool', 'Gym', 'Parking', 'Air conditioning', 'Pet friendly'
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

  // Parse URL query parameters for search, filters, sort
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
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [filterRef, priceRef])

  // Real-time Search Effect with Debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      loadProperties()
    }, 300)
    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery, selectedAmenities, priceRange])

  // Removed auto-slide - images are static until user interacts

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (data) setProfile(data)
  }

  // Load user's favorite properties
  async function loadUserFavorites(userId) {
    try {
      const { data } = await supabase
        .from('favorites')
        .select('property_id')
        .eq('user_id', userId)
      if (data) {
        setFavorites(data.map(f => f.property_id))
      }
    } catch (err) {
      console.error('Error loading favorites:', err)
    }
  }

  // Load property statistics (favorite counts and ratings)
  async function loadPropertyStats() {
    try {
      const { data } = await supabase
        .from('property_stats')
        .select('*')
      if (data) {
        const statsMap = {}
        data.forEach(stat => {
          statsMap[stat.property_id] = stat
        })
        setPropertyStats(statsMap)
      }
    } catch (err) {
      console.error('Error loading property stats:', err)
    }
  }

  // Load featured properties (Guest Favorites and Top Rated)
  async function loadFeaturedProperties() {
    try {
      // Get all properties with their stats
      const { data: allProps } = await supabase
        .from('properties')
        .select('*')
        .eq('status', 'available')

      const { data: stats } = await supabase
        .from('property_stats')
        .select('*')

      if (allProps && stats) {
        const statsMap = {}
        stats.forEach(s => { statsMap[s.property_id] = s })

        // Guest Favorites - properties with 3+ favorites
        const favorites = allProps
          .filter(p => statsMap[p.id]?.favorite_count >= 1)
          .sort((a, b) => (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0))
          .slice(0, 5)
        setGuestFavorites(favorites)

        // Top Rated - properties with highest ratings (at least 1 review)
        const rated = allProps
          .filter(p => statsMap[p.id]?.review_count > 0)
          .sort((a, b) => (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0))
          .slice(0, 5)
        setTopRated(rated)
      }
    } catch (err) {
      console.error('Error loading featured properties:', err)
    }
  }

  // Toggle favorite for a property
  async function toggleFavorite(e, propertyId) {
    e.stopPropagation()
    
    // If not logged in, show auth modal
    if (!session) {
      setAuthMode('signin')
      setShowAuthModal(true)
      return
    }

    const isFavorite = favorites.includes(propertyId)
    
    if (isFavorite) {
      // Remove from favorites
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', session.user.id)
        .eq('property_id', propertyId)
      
      if (!error) {
        setFavorites(prev => prev.filter(id => id !== propertyId))
        loadPropertyStats()
        loadFeaturedProperties()
      }
    } else {
      // Add to favorites
      const { error } = await supabase
        .from('favorites')
        .insert({ user_id: session.user.id, property_id: propertyId })
      
      if (!error) {
        setFavorites(prev => [...prev, propertyId])
        loadPropertyStats()
        loadFeaturedProperties()
      }
    }
  }

  async function loadProperties() {
    setLoading(true)
    
    let query = supabase
      .from('properties')
      .select('*')
      .eq('status', 'available')

    // Apply search filter
    if (searchQuery.trim()) {
      query = query.or(`title.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
    }

    // Apply price range filter
    if (priceRange.min) {
      query = query.gte('price', parseInt(priceRange.min))
    }
    if (priceRange.max) {
      query = query.lte('price', parseInt(priceRange.max))
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

    const { data, error } = await query

    if (error) {
      console.error('Error loading properties:', error)
      setLoading(false)
      return
    }

    // Filter by amenities client-side
    let filteredData = data || []
    if (selectedAmenities.length > 0) {
      filteredData = filteredData.filter(property => {
        if (!property.amenities || !Array.isArray(property.amenities)) return false
        return selectedAmenities.every(amenity =>
          property.amenities.some(a => a.toLowerCase().includes(amenity.toLowerCase()))
        )
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
  }

  // --- Comparison Handlers ---
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

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans text-black flex flex-col">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-2 py-2 flex-1">

        {/* Search and Filter Bar - Centered & Compact */}
        <div className="sticky top-3 z-40 py-2">
          <div className="flex justify-center mb-8">
            <div className="w-full bg-white rounded-2xl shadow-lg border border-gray-100 relative z-30 max-w-3xl p-3">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                {/* Search Input */}
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="text-gray-400 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search properties..." 
                    className="w-full bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black font-medium pl-10 pr-4 py-2.5 text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

              {/* Filter & Sort Controls */}
              <div className="flex gap-2">
                {/* Price Filter Button */}
                <div className="relative" ref={priceRef}>
                  <button 
                    onClick={() => setShowPriceDropdown(!showPriceDropdown)}
                    className={`flex items-center gap-1.5 rounded-xl font-bold border whitespace-nowrap cursor-pointer px-3 py-2.5 text-xs ${
                      priceRange.min || priceRange.max
                        ? 'bg-gray-900 text-white border-black' 
                        : 'bg-white text-gray-700 border-gray-200 hover:border-black'
                    }`}
                  >
                    <span>₱</span>
                    Price
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
                              name="priceSort"
                              checked={sortBy === 'price_low'}
                              onChange={() => setSortBy('price_low')}
                              className="w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="text-xs font-medium text-gray-700 group-hover:text-black">Price: Low to High</span>
                          </label>
                          <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors">
                            <input 
                              type="radio" 
                              name="priceSort"
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
                    className={`flex items-center gap-1.5 rounded-xl font-bold border whitespace-nowrap cursor-pointer px-3 py-2.5 text-xs ${
                      showFilterDropdown || selectedAmenities.length > 0
                        ? 'bg-gray-900 text-white border-black' 
                        : 'bg-white text-gray-700 border-gray-200 hover:border-black'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    Filters
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
                              name="dateSort"
                              checked={sortBy === 'newest'}
                              onChange={() => setSortBy('newest')}
                              className="w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="text-xs font-medium text-gray-700 group-hover:text-black">Newest First</span>
                          </label>
                          <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors">
                            <input 
                              type="radio" 
                              name="dateSort"
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
                                  onChange={() => toggleAmenityFilter(amenity)}
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

        {/* All Properties Section Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-2">
          <div className="mb-2 sm:mb-0 w-full sm:w-auto">
            <h2 className="text-2xl font-black text-black uppercase">All Properties</h2>
            <p className="text-sm text-gray-500">Browse all available listings</p>
          </div>
        </div>

        {/* All Properties Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-black"></div>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100">
            <div className="w-20 h-20 mx-auto mb-6 bg-gray-50 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No properties found</h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              No properties match your search. Try adjusting your filters.
            </p>
            <button 
              onClick={clearFilters}
              className="px-6 py-2.5 bg-black text-white rounded-full text-sm font-semibold cursor-pointer hover:bg-gray-900 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 mb-12">
            {properties.map((property) => {
              const images = getPropertyImages(property)
              const currentIndex = currentImageIndex[property.id] || 0
              const isSelectedForCompare = comparisonList.some(p => p.id === property.id)
              const isFavorite = favorites.includes(property.id)
              const stats = propertyStats[property.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
              
              return (
                <div 
                  key={property.id} 
                  className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer flex flex-col ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100'}`}
                  onClick={() => router.push(`/properties/${property.id}`)}
                >
                  {/* Image Slider - Top */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                    <img 
                      src={images[currentIndex]} 
                      alt={property.title}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Top Right Icons - Favorite & Compare */}
                    <div className="absolute top-3 right-3 z-20 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                       {/* Favorite Heart Button */}
                       <button 
                         onClick={(e) => toggleFavorite(e, property.id)}
                         className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm cursor-pointer ${
                           isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:bg-white hover:text-red-500'
                         }`}
                         title={session ? (isFavorite ? 'Remove from favorites' : 'Add to favorites') : 'Login to save favorites'}
                       >
                         <svg className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                         </svg>
                       </button>

                       {/* Compare Checkbox */}
                       <label className="flex items-center gap-2 cursor-pointer group/check">
                          <input 
                            type="checkbox" 
                            className="hidden"
                            checked={isSelectedForCompare}
                            onChange={(e) => toggleComparison(e, property)}
                          />
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm ${isSelectedForCompare ? 'bg-black text-white' : 'bg-white/90 text-gray-400 hover:bg-white'}`}>
                            {isSelectedForCompare ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            ) : (
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
                            className={`h-1 rounded-full shadow-sm ${
                              idx === currentIndex ? 'w-4 bg-white' : 'w-1 bg-white/60'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>

                    {/* Status Badge & Guest Favorite Badge */}
                    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
                       <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-md shadow-sm backdrop-blur-md ${
                        property.status === 'available'
                          ? 'bg-white text-black' 
                          : 'bg-black/80 text-white'
                      }`}>
                        {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
                      </span>
                      {stats.favorite_count >= 1 && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md shadow-sm backdrop-blur-md bg-gradient-to-r from-pink-500 to-red-500 text-white flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                          Guest Favorite
                        </span>
                      )}
                    </div>

                    {/* Price Overlay */}
                    <div className="absolute bottom-3 left-3 z-10 text-white">
                      <p className="text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
                      <p className="text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
                    </div>
                  </div>
                  
                  {/* Property Info - Bottom */}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="mb-2">
                        <div className="flex justify-between items-start mb-0.5">
                            <h3 className="text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
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
                        <div className="flex items-center gap-1 text-gray-500 text-xs">
                            <span className="truncate">{property.city}, Philippines</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 text-gray-600 text-xs">
                       <span className="font-medium">{property.bedrooms} beds</span>
                       <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                       <span className="font-medium">{property.bathrooms} baths</span>
                       <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                       <span className="font-medium">{property.area_sqft || 0} sqm</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Guest Favorites Section */}
        {guestFavorites.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-3 mb-2">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Tenants Favorites</h2>
                <p className="text-sm text-gray-500">Most loved by our community</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {guestFavorites.map((property) => {
                  const images = getPropertyImages(property)
                  const currentIndex = currentImageIndex[property.id] || 0
                  const isSelectedForCompare = comparisonList.some(p => p.id === property.id)
                  const isFavorite = favorites.includes(property.id)
                  const stats = propertyStats[property.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
                  
                  return (
                    <div 
                      key={property.id} 
                      className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer flex flex-col transition-all duration-300 ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100'}`}
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
                          {/* Compare Button */}
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
                        <div className="absolute bottom-3 left-3 z-10 text-white">
                          <p className="text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
                          <p className="text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-0.5">
                          <h3 className="text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
                          {stats.review_count > 0 && (
                            <div className="flex items-center gap-1 text-xs shrink-0">
                              <svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24">
                                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                              <span className="font-bold text-gray-900">{stats.avg_rating.toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-gray-500 text-xs">{property.city}, Philippines</p>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Top Rated Section */}
        {topRated.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Top Rated</h2>
                <p className="text-sm text-gray-500">Highest rated by tenants</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {topRated.map((property) => {
                  const images = getPropertyImages(property)
                  const currentIndex = currentImageIndex[property.id] || 0
                  const isSelectedForCompare = comparisonList.some(p => p.id === property.id)
                  const isFavorite = favorites.includes(property.id)
                  const stats = propertyStats[property.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
                  
                  return (
                    <div 
                      key={property.id} 
                      className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer flex flex-col transition-all duration-300 ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100'}`}
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
                          {/* Compare Button */}
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
                        <div className="absolute bottom-3 left-3 z-10 text-white">
                          <p className="text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
                          <p className="text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-0.5">
                          <h3 className="text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
                          <div className="flex items-center gap-1 text-xs shrink-0">
                            <svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24">
                              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            <span className="font-bold text-gray-900">{stats.avg_rating.toFixed(1)}</span>
                            <span className="text-gray-400">({stats.review_count})</span>
                          </div>
                        </div>
                        <p className="text-gray-500 text-xs">{property.city}, Philippines</p>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Floating Compare Button */}
        {comparisonList.length > 0 && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40">
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
