import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import AuthModal from '../components/AuthModal'
import { showToast } from 'nextjs-toast-notify'
import Footer from '../components/Footer'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '../components/ui/carousel'
import Lottie from "lottie-react"
import loadingAnimation from "../assets/loading.json"

export default function Home() {
  const router = useRouter()
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [currentImageIndex, setCurrentImageIndex] = useState({})
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [showPropertyModal, setShowPropertyModal] = useState(false)
  const [modalImageIndex, setModalImageIndex] = useState(0)
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 })
  const [showZoom, setShowZoom] = useState(false)
  const [showPermitModal, setShowPermitModal] = useState(false)
  const [selectedPermit, setSelectedPermit] = useState(null)
  const [chatHistory, setChatHistory] = useState([])
  const chatMessagesRef = useRef(null)
  const [mounted, setMounted] = useState(false)
  const [showSplash, setShowSplash] = useState(true)

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAmenities, setSelectedAmenities] = useState([])
  const [priceRange, setPriceRange] = useState({ min: '', max: '' })
  const [sortBy, setSortBy] = useState('newest')
  const [isExpanded, setIsExpanded] = useState(false)

  // Real-time search state
  const [searchResults, setSearchResults] = useState([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const searchRef = useRef(null)

  // --- Filter Dropdown State ---
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [showPriceDropdown, setShowPriceDropdown] = useState(false)
  const filterRef = useRef(null)
  const priceRef = useRef(null)

  // --- Comparison Feature State ---
  const [comparisonList, setComparisonList] = useState([])

  // --- Display limit for property sections ---
  // Increased to 16 to ensure enough items for the 7-item wide carousel scrolling
  const maxDisplayItems = 16

  // --- Featured Sections State ---
  const [guestFavorites, setGuestFavorites] = useState([])
  const [topRated, setTopRated] = useState([])
  const [propertyStats, setPropertyStats] = useState({})

  // --- Session & Favorites State ---
  const [session, setSession] = useState(null)
  const [favorites, setFavorites] = useState([])

  // Common amenities to filter by
  const filterAmenities = [
    'Wifi', 'Pool', 'Gym', 'Parking', 'Air conditioning', 'Pet friendly'
  ]

  // Mount animation trigger + splash screen
  // Mount animation trigger + splash screen
  useEffect(() => {
    // Check if splash has already been shown in this session
    const hasSeenSplash = sessionStorage.getItem('hasSeenSplash')

    if (hasSeenSplash) {
      setShowSplash(false)
      setMounted(true)
    } else {
      // Mark as seen for future visits in this session
      sessionStorage.setItem('hasSeenSplash', 'true')

      // Delay setting mounted until after splash starts fading
      const mountTimer = setTimeout(() => setMounted(true), 1800)
      // Remove splash from DOM after fade-out completes
      const splashTimer = setTimeout(() => setShowSplash(false), 2700)

      return () => {
        clearTimeout(mountTimer)
        clearTimeout(splashTimer)
      }
    }
  }, [])

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
    }, 1450) // Change image every 3 seconds

    return () => clearInterval(interval)
  }, [properties, guestFavorites, topRated])

  useEffect(() => {
    if (router.query.view === 'all') {
      setIsExpanded(true)
      loadFeaturedProperties(true)
    } else {
      setIsExpanded(false)
      loadFeaturedProperties(false)
    }
    loadFeaturedSections()
  }, [router.query])

  useEffect(() => {
    function handleClickOutside(event) {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setShowFilterDropdown(false)
      }
      if (priceRef.current && !priceRef.current.contains(event.target)) {
        setShowPriceDropdown(false)
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [filterRef, priceRef, searchRef]);

  // Real-time search with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }

    const debounceTimer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('id, title, city, price, images, status')
          .eq('is_deleted', false)
          .or(`title.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
          .limit(6)

        if (data && !error) {
          setSearchResults(data)
          setShowSearchDropdown(true)
        }
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setIsSearching(false)
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(debounceTimer)
  }, [searchQuery])

  // Load session and favorites on mount
  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadUserFavorites(result.data.session.user.id)
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        loadUserFavorites(session.user.id)
      } else {
        setFavorites([])
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    loadFeaturedProperties(false)
  }, [])

  useEffect(() => {
    if (chatMessagesRef.current && chatHistory.length > 0) {
      setTimeout(() => {
        chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
      }, 100)
    }
  }, [chatHistory])

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

  // Toggle favorite - requires login
  async function toggleFavorite(e, propertyId) {
    e.stopPropagation()

    // If not logged in, show auth modal
    if (!session) {
      showToast.warning("Please Login First", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
    }
  }

  const toggleAmenity = (amenity) => {
    setSelectedAmenities(prev => {
      const newSelection = prev.includes(amenity)
        ? prev.filter(a => a !== amenity)
        : [...prev, amenity]
      return newSelection
    })
  }

  async function loadFeaturedProperties(expanded = false) {
    setLoading(true)
    let query = supabase
      .from('properties')
      .select(`
        *,
        landlord_profile:profiles!properties_landlord_fkey(id, first_name, middle_name, last_name, role)
      `)

    if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%`)
    }
    if (priceRange.min) {
      query = query.gte('price', parseInt(priceRange.min))
    }
    if (priceRange.max) {
      query = query.lte('price', parseInt(priceRange.max))
    }
    if (sortBy === 'newest') {
      query = query.order('created_at', { ascending: false })
    } else if (sortBy === 'oldest') {
      query = query.order('created_at', { ascending: true })
    } else if (sortBy === 'price_low') {
      query = query.order('price', { ascending: true })
    } else if (sortBy === 'price_high') {
      query = query.order('price', { ascending: false })
    }
    if (selectedAmenities.length > 0) {
      query = query.contains('amenities', selectedAmenities)
    }

    // We fetch a bit more than 8 to allow for the "See More" functionality if needed,
    // but the carousel handles the slicing.

    const { data, error } = await query
    setProperties(data || [])
    setLoading(false)
  }

  async function loadFeaturedSections() {
    // 1. Fetch properties (Available only, or remove .eq for all)
    const { data: allProps } = await supabase
      .from('properties')
      .select('*')
      .eq('is_deleted', false)

    // 2. Fetch stats
    const { data: stats } = await supabase
      .from('property_stats')
      .select('*')

    if (allProps && stats) {
      // Create a map for easy lookup: statsMap[propertyId] = { ... }
      const statsMap = {}
      stats.forEach(s => {
        statsMap[s.property_id] = {
          favorite_count: s.favorite_count || 0,
          avg_rating: s.avg_rating || 0,
          review_count: s.review_count || 0
        }
      })

      // Update State for Stats
      setPropertyStats(statsMap)

      // 3. Guest Favorites (Most Favorited)
      const favorites = allProps
        .filter(p => (statsMap[p.id]?.favorite_count || 0) >= 1)
        .sort((a, b) => (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0))
        .slice(0, maxDisplayItems)

      setGuestFavorites(favorites)

      // 4. Top Rated (Highest Average Rating with at least 1 review)
      const rated = allProps
        .filter(p => (statsMap[p.id]?.review_count || 0) > 0) // Must have reviews
        .sort((a, b) => (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0))
        .slice(0, maxDisplayItems)

      setTopRated(rated)
    }
  }

  // async function loadFeaturedSections() {
  //   try {
  //     const { data: allProps } = await supabase
  //       .from('properties')
  //       .select('*')
  //       .eq('status', 'available')

  //     const { data: stats, error: statsError } = await supabase
  //       .from('property_stats')
  //       .select('*')

  //     if (statsError) {
  //       return
  //     }

  //     if (allProps && stats) {
  //       const statsMap = {}
  //       stats.forEach(s => { 
  //         statsMap[s.property_id] = {
  //           favorite_count: s.favorite_count || 0,
  //           avg_rating: s.avg_rating || 0,
  //           review_count: s.review_count || 0
  //         }
  //       })
  //       setPropertyStats(statsMap)

  //       const favorites = allProps
  //         .filter(p => statsMap[p.id]?.favorite_count >= 1)
  //         .sort((a, b) => (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0))
  //         .slice(0, 8)
  //       setGuestFavorites(favorites)

  //       const rated = allProps
  //         .filter(p => statsMap[p.id]?.review_count > 0)
  //         .sort((a, b) => (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0))
  //         .slice(0, 8)
  //       setTopRated(rated)
  //     }
  //   } catch (err) {
  //     console.log(err)
  //   }
  // }

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

  const canSearch = searchQuery.trim() || priceRange.min || priceRange.max || selectedAmenities.length > 0 || sortBy !== 'newest'

  const handleSeeMore = () => {
    router.push('/properties/allProperties')
  }

  const getPropertyImages = (property) => {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) {
      return property.images
    }
    return []
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

  const closePropertyModal = () => {
    setShowPropertyModal(false)
    setSelectedProperty(null)
    setModalImageIndex(0)
  }

  const nextModalImage = () => {
    if (selectedProperty) {
      const images = getPropertyImages(selectedProperty)
      setModalImageIndex((prev) => (prev + 1) % images.length)
    }
  }

  const prevModalImage = () => {
    if (selectedProperty) {
      const images = getPropertyImages(selectedProperty)
      setModalImageIndex((prev) => (prev - 1 + images.length) % images.length)
    }
  }

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setZoomPosition({ x, y })
  }

  const handleMouseEnter = () => {
    setShowZoom(true)
  }

  const handleMouseLeave = () => {
    setShowZoom(false)
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

  const faqData = [
    {
      id: 1,
      question: "How do I apply for a property?",
      answer: "Click 'View Details' on any property listing, then click the 'Apply' button. Fill out the application form with your details, and the landlord will review and contact you directly."
    },
    {
      id: 2,
      question: "How do I schedule a viewing?",
      answer: "On the property details page, you'll find the landlord's available time slots. Select your preferred date and time to book an appointment. You'll receive a confirmation in your dashboard."
    },
    {
      id: 3,
      question: "How do I pay rent?",
      answer: "Once approved as a tenant, your landlord will send payment requests through the platform. Upload proof of payment in the Payments section of your dashboard and track your payment history."
    },
    {
      id: 4,
      question: "How do I contact the landlord?",
      answer: "Use our built-in messaging system accessible from your dashboard. You can send text messages, share images, and exchange files for any property-related communication."
    },
  ]

  const carouselItemClass = "pl-2 basis-1/2 md:basis-1/4 lg:basis-[16.66%]"

  return (
    <div className="min-h-screen bg-[#F5F5F5] from-gray-50 via-white to-gray-100 font-sans text-black flex flex-col scroll-smooth">

      {/* ===== SPLASH INTRO SCREEN ===== */}
      {showSplash && (
        <div className="splash-screen">
          <img src="/home.png" alt="TessyNTed" className="splash-logo" />
          <div className="splash-brand">𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝</div>
          <div className="splash-tagline">Find your perfect home</div>
          <div className="splash-bar"></div>
        </div>
      )}

      <div className="max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-1">

        {/* Search and Filter Bar */}
        <div className={`md:sticky md:top-3 z-40 py-2 ${mounted ? 'animate-fadeInDown' : 'opacity-0'}`}>
          <div className="flex justify-center mb-1">
            <div className="w-full bg-white/90 backdrop-blur-xl rounded-2xl border border-gray-200/50 relative z-30 shadow-lg shadow-gray-200/50 hover:shadow-xl hover:shadow-gray-300/50 transition-all duration-500 max-w-lg p-2">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
                {/* Search Input with Dropdown */}
                <div className="relative flex-1 group" ref={searchRef}>
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    {isSearching ? (
                      <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin"></div>
                    ) : (
                      <svg className="text-gray-400 w-5 h-5 group-focus-within:text-gray-900 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    )}
                  </div>
                  <input
  type="text"
  placeholder="Search properties, cities..."
  className="w-full bg-white border border-gray-200 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium pl-10 pr-10 py-3 text-sm transition-all duration-300 hover:border-gray-300 hover:shadow-sm focus:bg-white focus:shadow-md placeholder:text-gray-400"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  onFocus={() => searchResults.length > 0 && setShowSearchDropdown(true)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      handleSearch()
    }
    if (e.key === 'Escape') {
      setShowSearchDropdown(false)
    }
  }}
/>
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearchDropdown(false) }}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-900 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}

                  {/* Search Dropdown */}
                  {showSearchDropdown && searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-fadeInUp" style={{ animationDuration: '0.2s' }}>
                      <div className="p-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Search Results</p>
                        {searchResults.map((property, idx) => (
                          <div
                            key={property.id}
                            onClick={() => {
                              router.push(`/properties/${property.id}`)
                              setShowSearchDropdown(false)
                            }}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-all duration-200 group"
                          >
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                              {property.images?.[0] ? (
                                <img src={property.images[0]} alt={property.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate group-hover:text-black">{property.title}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>{property.city}</span>
                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                <span className="font-bold text-gray-900">₱{Number(property.price).toLocaleString()}/mo</span>
                              </div>
                            </div>
                            <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${property.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {property.status}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-gray-100 p-2">
                        <button
                          onClick={() => {
                            router.push(`/properties/allProperties?search=${encodeURIComponent(searchQuery)}`)
                            setShowSearchDropdown(false)
                          }}
                          className="w-full text-center py-2 text-sm font-bold text-gray-900 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                        >
                          View all results for "{searchQuery}"
                        </button>
                      </div>
                    </div>
                  )}

                  {/* No results message */}
                  {showSearchDropdown && searchQuery.trim() && searchResults.length === 0 && !isSearching && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 p-4 text-center animate-fadeInUp" style={{ animationDuration: '0.2s' }}>
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-gray-500">No properties found for "{searchQuery}"</p>
                    </div>
                  )}
                </div>

                {/* Search Button */}
                <button
                  onClick={handleSearch}
                  disabled={!searchQuery.trim()}
                  className={`rounded-xl font-bold flex items-center gap-2 px-4 py-2.5 text-sm text-white justify-center shadow-lg transition-all duration-300 ${searchQuery.trim() ? 'bg-black hover:bg-gray-800 cursor-pointer hover:shadow-xl transform hover:scale-105 active:scale-95' : 'bg-gray-300 cursor-not-allowed'}`}
                >
                  <svg
                    className="w-4 h-4 sm:w-4.5 sm:h-4.5 lg:w-5 lg:h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>

                  {/* Hide text on very small screens */}
                  <span className="hidden sm:inline"></span>
                </button>

                {/* Filter & Sort Controls */}
                <div className="flex gap-2">
                  <div className="relative" ref={priceRef}>
                  </div>
                  <div className="relative" ref={filterRef}>
                    {/* {showFilterDropdown && (
                    <div className="fixed inset-x-0 bottom-0 sm:bottom-auto sm:absolute sm:inset-x-auto sm:top-full sm:right-0 mt-0 sm:mt-2 w-full sm:w-56 bg-white border-t sm:border border-gray-200 rounded-t-2xl sm:rounded-xl shadow-2xl p-4 sm:p-3 z-[100]">
                      <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
                      <div className="mb-3">
                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">Sort By Date</p>
                        <div className="flex flex-col gap-1">
                          <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors"><input type="radio" name="dateSort" checked={sortBy === 'newest'} onChange={() => setSortBy('newest')} className="w-3.5 h-3.5 cursor-pointer" /><span className="text-xs font-medium text-gray-700 group-hover:text-black">Newest First</span></label>
                          <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors"><input type="radio" name="dateSort" checked={sortBy === 'oldest'} onChange={() => setSortBy('oldest')} className="w-3.5 h-3.5 cursor-pointer" /><span className="text-xs font-medium text-gray-700 group-hover:text-black">Oldest First</span></label>
                        </div>
                      </div>
                      <div className="border-t border-gray-100 pt-2">
                        <div className="flex justify-between items-center mb-1.5">
                          <h3 className="text-[10px] font-bold text-gray-500 uppercase">Amenities</h3>
                          {selectedAmenities.length > 0 && (
                            <button onClick={() => setSelectedAmenities([])} className="text-[10px] font-bold text-red-500 hover:text-red-700 cursor-pointer">Clear</button>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                          {filterAmenities.map(amenity => (
                            <label key={amenity} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors">
                              <div className="relative flex items-center"><input type="checkbox" className="peer h-3.5 w-3.5 cursor-pointer appearance-none rounded border border-gray-300 checked:bg-black checked:border-black transition-all" checked={selectedAmenities.includes(amenity)} onChange={() => toggleAmenity(amenity)} /><svg className="absolute w-2.5 h-2.5 pointer-events-none hidden peer-checked:block text-white left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg></div>
                              <span className="text-xs font-medium text-gray-700 group-hover:text-black transition-colors">{amenity}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )} */}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* All Properties Section - Fixed height container to prevent layout shift */}
        <div className="mb-2 pt-5">
          {/* Section Header */}
          <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 ${mounted ? 'animate-fadeInLeft delay-200' : 'opacity-0'}`}>
            <div className="mb-2 sm:mb-5 w-full sm:w-auto">
              <h2 className="text-xl sm:text-3xl font-black text-black tracking-tight">
                Recommended Properties
              </h2>
              <p className="text-sm text-gray-500 mt-1">Discover your perfect space</p>
            </div>

            {properties.length > 0 && (
              <span onClick={handleSeeMore} className="text-sm font-bold text-gray-900 hover:text-gray-600 cursor-pointer flex items-center gap-1 group transition-all duration-300">
                See More Properties
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </span>
            )}
          </div>

          {loading ? (
            <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
              {/* Wrapper for animation + text */}
              <div className="flex flex-col items-center">
                <Lottie
                  animationData={loadingAnimation}
                  loop={true}
                  className="w-64 h-64"
                />
                <p className="text-gray-500 font-medium text-lg mt-4">
                  Loading Properties...
                </p>
              </div>
            </div>
          ) : properties.length === 0 ? (
            <div className={`text-center py-12 border-2 border-dashed border-gray-300 rounded-2xl h-[350px] flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm ${mounted ? 'animate-scaleIn' : 'opacity-0'}`}>
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4 animate-float">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm font-medium mb-2">No properties match your search.</p>
              <button onClick={() => { setSearchQuery(''); setSelectedAmenities([]); loadFeaturedProperties(isExpanded) }} className="mt-2 px-6 py-2 bg-gray-900 text-white rounded-xl font-bold text-sm cursor-pointer hover:bg-gray-800 transition-all duration-300 transform hover:scale-105">Clear Filters</button>
            </div>
          ) : (
            /* Updated to use Carousel instead of Grid for TenantDashboard parity */
            <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)]">
              <CarouselContent className="-ml-2">
                {properties.slice(0, maxDisplayItems).map((property, idx) => {

                  const images = getPropertyImages(property)
                  const currentIndex = currentImageIndex[property.id] || 0
                  const isSelectedForCompare = comparisonList.some(p => p.id === property.id)
                  const isFavorite = favorites.includes(property.id)
                  // For Guest Favorite badge logic in this component, we use the propertyStats derived from DB
                  const stats = propertyStats[property.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }

                  return (
                    <CarouselItem key={property.id} className={carouselItemClass}>
                      <div className="p-1 h-full">
                        <div
                          className={`group bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col cursor-pointer h-full card-hover ${isSelectedForCompare ? 'ring-2 ring-gray-900 border-gray-900' : 'border-gray-100 hover:border-gray-300'} ${mounted ? 'animate-slideInCard' : 'opacity-0'}`}
                          style={{ animationDelay: `${idx * 0.1}s` }}
                          onClick={() => router.push(`/properties/${property.id}`)}
                        >
                          <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                            <img src={images[currentIndex]} alt={property.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />

                            {/* Action Buttons (Restored Design) */}
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
                            <div className="absolute top-1.5 sm:top-2 md:top-3 left-1.5 sm:left-2 md:left-3 z-10 flex flex-col gap-0.5 sm:gap-1 items-start">
                              <span className={`px-1 py-0.5 text-[7px] sm:text-[8px] uppercase font-bold tracking-wider rounded shadow-sm backdrop-blur-md ${property.status === 'available' ? 'bg-white text-black' : 'bg-black/80 text-white'}`}>{property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}</span>
                              {stats.favorite_count >= 1 && (<span className="px-1 py-0.5 text-[7px] sm:text-[8px] uppercase font-bold tracking-wider rounded shadow-sm backdrop-blur-md bg-rose-500 text-white flex items-center gap-0.5"><svg className="w-2 h-2 sm:w-2.5 sm:h-2.5 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>{stats.favorite_count}</span>)}
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
                              <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                                <svg
                                  className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
                                </svg>{property.bedrooms}</span>
                              <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                              <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                                <svg
                                  className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" />
                                </svg>{property.bathrooms}</span>
                              <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                              <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>{property.area_sqft} sqm</span>
                            </div>
                          </div>
                        </div>
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
          <div className={`mb-2 mt-8 ${mounted ? 'animate-fadeInUp delay-300' : 'opacity-0'}`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl sm:text-2xl font-black text-black">Tenants Favorites</h2>
                </div>
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
                        <div
                          className={`group bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col cursor-pointer h-full card-hover ${isSelectedForCompare ? 'ring-2 ring-gray-900 border-gray-900' : 'border-gray-100 hover:border-gray-300'}`}
                          onClick={() => router.push(`/properties/${item.id}`)}
                        >
                          <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                            <img src={images[currentIndex]} alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />

                            {/* Action Buttons */}
                            <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 md:top-3 md:right-3 z-20 flex items-center gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                              <button onClick={(e) => toggleFavorite(e, item.id)} className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all cursor-pointer ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:bg-white hover:text-red-500'}`}>
                                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                              </button>
                              <label className="flex items-center cursor-pointer">
                                <input type="checkbox" className="hidden" checked={isSelectedForCompare} onChange={(e) => toggleComparison(e, item)} />
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
                            <div className="absolute top-1.5 sm:top-2 md:top-3 left-1.5 sm:left-2 md:left-3 z-10 flex flex-col gap-0.5 sm:gap-1 items-start">
                              <span className={`px-1 py-0.5 text-[7px] sm:text-[8px] uppercase font-bold tracking-wider rounded shadow-sm backdrop-blur-md ${item.status === 'available' ? 'bg-white text-black' : 'bg-black/80 text-white'}`}>{item.status === 'available' ? 'Available' : item.status === 'occupied' ? 'Occupied' : 'Not Available'}</span>
                              {stats.favorite_count >= 1 && (
                                <span className="px-1 py-0.5 text-[7px] sm:text-[8px] uppercase font-bold tracking-wider rounded shadow-sm backdrop-blur-md bg-rose-500 text-white flex items-center gap-0.5">
                                  <svg className="w-2 h-2 sm:w-2.5 sm:h-2.5 fill-current" viewBox="0 0 24 24">
                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                  </svg>
                                  {stats.favorite_count}
                                </span>
                              )}
                            </div>
                            <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-10 text-white">
                              <p className="text-sm sm:text-lg font-bold drop-shadow-md">₱{Number(item.price).toLocaleString()}</p>
                              <p className="text-[8px] sm:text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
                            </div>
                          </div>

                          {/* Card Body */}
                          <div className="p-1.5 sm:p-2">
                            <div className="mb-0.5 sm:mb-1">
                              <div className="flex justify-between items-start">
                                <h3 className="text-xs sm:text-base font-bold text-gray-900 line-clamp-1">{item.title}</h3>
                                {stats.review_count > 0 && (<div className="flex items-center gap-1 text-xs shrink-0"><svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg><span className="font-bold text-gray-900">{stats.avg_rating.toFixed(1)}</span><span className="text-gray-400">({stats.review_count})</span></div>)}
                              </div>
                              <div className="flex items-center gap-1 text-gray-500 text-[10px] sm:text-xs">
                                <span className="truncate">{item.city}, Philippines</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-3 text-gray-600 text-[10px] sm:text-xs">
                              <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg
                                className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
                              </svg>{item.bedrooms}</span>
                              <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                              <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg
                                className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" />
                              </svg>{item.bathrooms}</span>
                              <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                              <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>{item.area_sqft} sqm</span>
                            </div>
                          </div>
                        </div>
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
          <div className={`mb-2 mt-8 ${mounted ? 'animate-fadeInUp delay-400' : 'opacity-0'}`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl font-black text-black">Top Rated</h2>
                </div>
                <p className="text-sm text-gray-500">Highest rated by tenants</p>
              </div>
            </div>
            <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)]">
              <CarouselContent className="-ml-2">
                {topRated.slice(0, maxDisplayItems).map((item) => {
                  const images = getPropertyImages(item)
                  const currentIndex = currentImageIndex[item.id] || 0
                  const isSelectedForCompare = comparisonList.some(p => p.id === item.id)
                  const isFavorite = favorites.includes(item.id)
                  const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }

                  return (
                    <CarouselItem key={item.id} className={carouselItemClass}>
                      <div className="p-1 h-full">
                        <div
                          className={`group bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col cursor-pointer h-full card-hover ${isSelectedForCompare ? 'ring-2 ring-gray-900 border-gray-900' : 'border-gray-100 hover:border-gray-300'}`}
                          onClick={() => router.push(`/properties/${item.id}`)}
                        >
                          <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                            <img src={images[currentIndex]} alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />

                            {/* Action Buttons */}
                            <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 md:top-3 md:right-3 z-20 flex items-center gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                              <button onClick={(e) => toggleFavorite(e, item.id)} className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all cursor-pointer ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:bg-white hover:text-red-500'}`}>
                                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                              </button>
                              <label className="flex items-center cursor-pointer">
                                <input type="checkbox" className="hidden" checked={isSelectedForCompare} onChange={(e) => toggleComparison(e, item)} />
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
                            <div className="absolute top-1.5 sm:top-2 md:top-3 left-1.5 sm:left-2 md:left-3 z-10 flex flex-col gap-0.5 sm:gap-1 items-start">
                              <span className={`px-1 py-0.5 text-[7px] sm:text-[8px] uppercase font-bold tracking-wider rounded shadow-sm backdrop-blur-md ${item.status === 'available' ? 'bg-white text-black' : 'bg-black/80 text-white'}`}>{item.status === 'available' ? 'Available' : item.status === 'occupied' ? 'Occupied' : 'Not Available'}</span>
                              {stats.favorite_count >= 1 && (<span className="px-1 py-0.5 text-[7px] sm:text-[8px] uppercase font-bold tracking-wider rounded shadow-sm backdrop-blur-md bg-rose-500 text-white flex items-center gap-0.5"><svg className="w-2 h-2 sm:w-2.5 sm:h-2.5 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>{stats.favorite_count}</span>)}
                            </div>
                            <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-10 text-white">
                              <p className="text-sm sm:text-lg font-bold drop-shadow-md">₱{Number(item.price).toLocaleString()}</p>
                              <p className="text-[8px] sm:text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
                            </div>
                          </div>

                          {/* Card Body */}
                          <div className="p-1.5 sm:p-2">
                            <div className="mb-0.5 sm:mb-1">
                              <div className="flex justify-between items-start">
                                <h3 className="text-xs sm:text-base font-bold text-gray-900 line-clamp-1">{item.title}</h3>
                                {stats.review_count > 0 && (<div className="flex items-center gap-1 text-xs shrink-0"><svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg><span className="font-bold text-gray-900">{stats.avg_rating.toFixed(1)}</span><span className="text-gray-400">({stats.review_count})</span></div>)}
                              </div>
                              <div className="flex items-center gap-1 text-gray-500 text-[10px] sm:text-xs">
                                <span className="truncate">{item.city}, Philippines</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-3 text-gray-600 text-[10px] sm:text-xs">
                              <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg
                                className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
                              </svg>{item.bedrooms}</span>
                              <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                              <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg
                                className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" />
                              </svg>{item.bathrooms}</span>
                              <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
                              <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>{item.area_sqft} sqm</span>
                            </div>
                          </div>
                        </div>
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
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40 animate-bounceIn">
          <button
            onClick={handleCompareClick}
            className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-8 py-4 rounded-full shadow-2xl hover:shadow-3xl hover:from-gray-800 hover:to-gray-700 transition-all duration-300 flex items-center gap-3 border-2 border-white/20 cursor-pointer transform hover:scale-105 active:scale-95"
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

      {/* End Request Modal */}
      {showPermitModal && selectedPermit && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowPermitModal(false)}
            ></div>

            <div className="relative inline-block w-full max-w-4xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white border-2 border-black shadow-2xl rounded-2xl">
              <button
                onClick={() => setShowPermitModal(false)}
                className="absolute top-4 right-4 z-10 p-2 bg-white border-2 border-black rounded-full hover:bg-black hover:text-white transition-all shadow-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="bg-black px-6 py-4 border-b-2 border-black">
                <h3 className="text-xl font-bold text-white">{selectedPermit.title}</h3>
                <p className="text-gray-400 text-sm mt-1">{selectedPermit.subtitle}</p>
              </div>

              <div className="p-8 bg-gray-100 flex items-center justify-center min-h-[60vh]">
                <img
                  src={selectedPermit.image}
                  alt={selectedPermit.title}
                  className="max-w-full h-auto object-contain max-h-[70vh] shadow-xl border-4 border-white transform hover:scale-105 transition-transform duration-300"
                />
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="h-24"></div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={authMode}
      />

      {/* Property Details Modal */}
      {showPropertyModal && selectedProperty && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            {/* Background overlay */}
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
              onClick={closePropertyModal}
            ></div>

            {/* Modal panel */}
            <div className="relative inline-block w-full max-w-6xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-2xl border-2 border-black rounded-2xl">
              {/* Close button */}
              <button
                onClick={closePropertyModal}
                className="absolute top-4 right-4 z-10 p-2 bg-white text-black border-2 border-black rounded-full hover:bg-black hover:text-white transition-colors shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="flex flex-col md:flex-row max-h-[85vh]">
                {/* Left side - Images */}
                <div className="w-full md:w-1/2 bg-gray-100 border-b-2 md:border-b-0 md:border-r-2 border-black">
                  <div className="relative h-[350px] md:h-full min-h-[400px] overflow-hidden group">
                    {(() => {
                      const images = getPropertyImages(selectedProperty)
                      return (
                        <>
                          <div
                            className="relative w-full h-full cursor-crosshair"
                            onMouseMove={handleMouseMove}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                          >
                            <img
                              src={images[modalImageIndex]}
                              alt={selectedProperty.title}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* Image navigation arrows */}
                          {images.length > 1 && (
                            <>
                              <button
                                onClick={prevModalImage}
                                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white text-black border-2 border-black w-10 h-10 rounded-full hover:bg-black hover:text-white flex items-center justify-center shadow-lg transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                </svg>
                              </button>
                              <button
                                onClick={nextModalImage}
                                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white text-black border-2 border-black w-10 h-10 rounded-full hover:bg-black hover:text-white flex items-center justify-center shadow-lg transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </>
                          )}

                          {/* Image indicators */}
                          {images.length > 1 && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-black/50 rounded-full backdrop-blur-sm">
                              {images.map((_, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setModalImageIndex(idx)}
                                  className={`h-2 rounded-full transition-all cursor-pointer ${idx === modalImageIndex ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'
                                    }`}
                                />
                              ))}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>

                {/* Right side - Property Details */}
                <div className="w-full md:w-1/2 p-8 overflow-y-auto bg-white">
                  <h2 className="text-3xl font-black text-black mb-2 leading-tight">{selectedProperty.title}</h2>
                  <div className="flex items-start gap-2 text-gray-500 mb-6 font-medium">
                    <svg className="w-5 h-5 text-black mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-sm">
                      {selectedProperty.address}, {selectedProperty.city}
                      {selectedProperty.state && `, ${selectedProperty.state}`}
                    </p>
                  </div>

                  <div className="mb-6 pb-6 border-b-2 border-gray-100 flex items-baseline gap-2">
                    <p className="text-4xl font-black text-black">
                      ₱{Number(selectedProperty.price).toLocaleString()}
                    </p>
                    <span className="text-gray-500 font-bold text-sm uppercase tracking-wide">/ month</span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b-2 border-gray-100">
                    <div className="text-center p-3 bg-gray-50 rounded-lg border-2 border-gray-100">
                      <div className="text-2xl font-black text-black">{selectedProperty.bedrooms}</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase">Bedrooms</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg border-2 border-gray-100">
                      <div className="text-2xl font-black text-black">{selectedProperty.bathrooms}</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase">Bathrooms</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg border-2 border-gray-100">
                      <div className="text-2xl font-black text-black">{selectedProperty.area_sqft}</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase">Sq Ft</div>
                    </div>
                  </div>

                  {selectedProperty.description && (
                    <div className="mb-8">
                      <h3 className="text-sm font-bold text-black uppercase tracking-wider mb-3">About this property</h3>
                      <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
                        {selectedProperty.description}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-4 sticky bottom-0 bg-white pt-4 border-t-2 border-gray-100">
                    <button
                      onClick={() => {
                        closePropertyModal()
                        setAuthMode('signup')
                        setShowAuthModal(true)
                      }}
                      className="flex-1 bg-black text-white py-3.5 px-6 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-gray-800 transition-all cursor-pointer shadow-lg hover:shadow-xl"
                    >
                      Apply Now
                    </button>
                    <button
                      onClick={() => {
                        closePropertyModal()
                        setAuthMode('signin')
                        setShowAuthModal(true)
                      }}
                      className="px-6 py-3.5 border-2 border-black text-black bg-white rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-black hover:text-white transition-all cursor-pointer"
                    >
                      Log In
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </div>
  )
}