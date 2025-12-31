import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import AuthModal from '../components/AuthModal'

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

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAmenities, setSelectedAmenities] = useState([])
  const [isExpanded, setIsExpanded] = useState(false) 
  
  // --- Filter Dropdown State ---
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const filterRef = useRef(null)

  // --- Comparison Feature State ---
  const [comparisonList, setComparisonList] = useState([])

  // Common amenities to filter by
  const filterAmenities = [
    'Wifi', 'Pool', 'Gym', 'Parking', 'Air conditioning', 'Pet friendly'
  ]

  useEffect(() => {
    // If URL has ?view=all, automatically expand
    if (router.query.view === 'all') {
      setIsExpanded(true)
      loadFeaturedProperties(true)
    } else {
      setIsExpanded(false)
      loadFeaturedProperties(false)
    }
  }, [router.query])

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

  // Real-time Search Effect with Debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const shouldExpand = searchQuery.length > 0 ? true : isExpanded
      
      if (searchQuery.length > 0 && !isExpanded) {
         setIsExpanded(true)
      }
      
      loadFeaturedProperties(shouldExpand)
    }, 300) 

    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery, selectedAmenities]) 

  useEffect(() => {
    const interval = setInterval(() => {
      properties.forEach(property => {
        const images = getPropertyImages(property)
        if (images.length > 1) {
          nextImage(property.id, images.length)
        }
      })
    }, 1500)

    return () => clearInterval(interval)
  }, [properties])

  // Auto-slide modal images every 1.5 seconds
  useEffect(() => {
    if (showPropertyModal && selectedProperty) {
      const images = getPropertyImages(selectedProperty)
      if (images.length > 1) {
        const interval = setInterval(() => {
          setModalImageIndex((prev) => (prev + 1) % images.length)
        }, 1500)

        return () => clearInterval(interval)
      }
    }
  }, [showPropertyModal, selectedProperty])

  useEffect(() => {
    if (chatMessagesRef.current && chatHistory.length > 0) {
      setTimeout(() => {
        chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
      }, 100)
    }
  }, [chatHistory])

  // Toggle amenity selection
  const toggleAmenity = (amenity) => {
    setSelectedAmenities(prev => {
      const newSelection = prev.includes(amenity)
        ? prev.filter(a => a !== amenity)
        : [...prev, amenity]
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
      .order('created_at', { ascending: false })
    
    // Apply Search
    if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%`)
    }

    // Apply Amenity Filters
    if (selectedAmenities.length > 0) {
      query = query.contains('amenities', selectedAmenities)
    }

    // Apply Limit: Show 5 unless expanded or searching
    if (!expanded && !searchQuery && selectedAmenities.length === 0) {
      query = query.limit(5)
    }
    
    const { data, error } = await query
    setProperties(data || [])
    setLoading(false)
  }

  const handleSearch = () => {
    setIsExpanded(true)
    loadFeaturedProperties(true)
  }

  const handleSeeMore = () => {
    setIsExpanded(true)
    setSearchQuery('')
    router.push('/?view=all', undefined, { shallow: true })
  }

  const handleSeeFewer = () => {
    setIsExpanded(false)
    setSearchQuery('')
    router.push('/', undefined, { shallow: true })
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

  const openPropertyModal = (property) => {
    setSelectedProperty(property)
    setModalImageIndex(0)
    setShowPropertyModal(true)
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

  // --- Comparison Handlers ---
  const toggleComparison = (e, property) => {
    e.stopPropagation() // Prevent opening details
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

  return (
    <div className="min-h-screen bg-white font-sans text-black pb-24">  
      {/* Featured Properties Section */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Search and Filter Bar */}
        <div className="w-full max-w-3xl mx-auto bg-white p-3 rounded-2xl shadow-lg border border-gray-100 mb-8 flex flex-col sm:flex-row gap-3 items-center transform transition-all  relative z-30">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input 
              type="text" 
              placeholder="Search by city, address, or property..." 
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black text-sm font-medium transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>

          {/* Buttons Container */}
          <div className="flex gap-2 w-full sm:w-auto">
            
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

            <button 
              onClick={handleSearch}
              className="flex-1 sm:flex-none w-full sm:w-auto justify-center bg-black text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors shadow-md flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              Search
            </button>
          </div>
        </div>

        {/* Section Header with See More / See Fewer */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 border-b border-gray-100 pb-4">
          <div className="mb-4 sm:mb-0 w-full sm:w-auto">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-black uppercase tracking-tight">
              {isExpanded ? 'All Properties' : 'Featured Properties'}
            </h2>
            <div className="w-16 h-1 bg-black mt-2"></div>
          </div>
          
<div className="flex gap-2 w-full sm:w-auto justify-end">            {!isExpanded ? (
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
          </div>
        </div>
        
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-black"></div>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl">
            <p className="text-gray-500 text-sm font-medium">No properties match your search.</p>
            <button 
                onClick={() => {
                    setSearchQuery('')
                    setSelectedAmenities([])
                    loadFeaturedProperties(isExpanded)
                }}
                className="mt-4 text-black underline font-bold text-sm"
            >
                Clear Filters
            </button>
          </div>
        ) : (
          /* Grid Layout */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 mx-auto">
            {properties.map((property) => {
              const images = getPropertyImages(property)
              const currentIndex = currentImageIndex[property.id] || 0
              const isSelectedForCompare = comparisonList.some(p => p.id === property.id)
              
              return (
                <div 
                  key={property.id} 
                  className={`group bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col transition-all duration-300 ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100'}`}
                  onClick={() => router.push(`/properties/${property.id}`)}
                >
                  {/* Image Slider - Top */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                    <img 
                      src={images[currentIndex]} 
                      alt={property.title}
                      className="w-full h-full object-cover transition-transform duration-700"
                    />
                    
                    {/* Compare Checkbox */}
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

                    {/* Navigation Arrows (Only show on hover) */}
                    {images.length > 1 && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button
                          onClick={(e) => { e.stopPropagation(); prevImage(property.id, images.length); }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-black w-7 h-7 flex items-center justify-center rounded-full shadow-md hover:scale-110 transition-transform"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); nextImage(property.id, images.length); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-black w-7 h-7 flex items-center justify-center rounded-full shadow-md hover:scale-110 transition-transform"
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60 pointer-events-none"></div>

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

                    {/* Price Overlay - Bottom Left */}
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
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/properties/${property.id}`);
                      }}
                      className="w-full mt-auto bg-black text-white py-2.5 px-3 rounded-xl text-xs font-bold shadow-md hover:shadow-lg hover:bg-gray-900 transition-all cursor-pointer"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Floating Compare Button */}
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

      {/* Why Us Section */}
      <div className="bg-gray-50 py-16 border-y-2 border-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black text-black uppercase tracking-tight mb-3">
              Why Choose EaseRent?
            </h2>
            <p className="text-gray-600 font-medium max-w-xl mx-auto">
              Simplifying rental management with transparency and speed.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-xl border-2 border-black">
              <div className="w-14 h-14 mx-auto mb-6 rounded-full bg-black flex items-center justify-center border-2 border-black">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-black mb-3 text-center">Secure & Trusted</h3>
              <p className="text-gray-600 text-sm text-center leading-relaxed">
                Verified landlords and tenants. Secure document handling and payments.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl border-2 border-black">
              <div className="w-14 h-14 mx-auto mb-6 rounded-full bg-white flex items-center justify-center border-2 border-black">
                <svg className="w-7 h-7 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-black mb-3 text-center">Fast & Easy</h3>
              <p className="text-gray-600 text-sm text-center leading-relaxed">
                Streamlined application process. Digital lease signing and automated billing.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl border-2 border-black">
              <div className="w-14 h-14 mx-auto mb-6 rounded-full bg-black flex items-center justify-center border-2 border-black">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-black mb-3 text-center">24/7 Support</h3>
              <p className="text-gray-600 text-sm text-center leading-relaxed">
                Direct messaging with landlords. Dedicated support for technical issues.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer with FAQ */}
      <footer className="bg-black text-white py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* FAQ Section */}
          <div className="mb-8">
            <h3 className="text-2xl font-black text-white mb-8 text-center uppercase tracking-wider">Frequently Asked Questions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {faqData.map((faq) => (
                <div key={faq.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-white mb-3 flex items-start gap-1">
                    <span className="bg-white text-black text-xs px-2 py-0.5 rounded font-bold">Q</span>
                    <span>{faq.question}</span>
                  </h4>
                  <p className="text-xs text-gray-400 leading-relaxed pl-8">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Copyright */}
          <div className="text-center border-t border-gray-800 pt-8 flex flex-col items-center gap-4">
            <h1 className="text-2xl font-black tracking-tighter">EaseRent</h1>
            <p className="text-gray-500 text-xs">
              © 2025 EaseRent. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

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
                                  className={`h-2 rounded-full transition-all cursor-pointer ${
                                    idx === modalImageIndex ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'
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
                    {/* <button
                      onClick={() => {
                        closePropertyModal()
                        setAuthMode('signup')
                        setShowAuthModal(true)
                      }}
                      className="flex-1 bg-black text-white py-3.5 px-6 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-gray-800 transition-all cursor-pointer shadow-lg hover:shadow-xl"
                    >
                      Apply Now
                    </button> */}
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
      
      {/* Permit/Certificate Modal */}
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
    </div>
  )
}