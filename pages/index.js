import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import AuthModal from '../components/AuthModal'

export default function Home() {
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

  useEffect(() => {
    loadFeaturedProperties()
  }, [])

  // Auto-slide images every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      properties.forEach(property => {
        const images = getPropertyImages(property)
        if (images.length > 1) {
          nextImage(property.id, images.length)
        }
      })
    }, 5000) // Change image every 5 seconds

    return () => clearInterval(interval)
  }, [properties])

  // Auto-slide modal images every 4 seconds
  useEffect(() => {
    if (showPropertyModal && selectedProperty) {
      const images = getPropertyImages(selectedProperty)
      if (images.length > 1) {
        const interval = setInterval(() => {
          setModalImageIndex((prev) => (prev + 1) % images.length)
        }, 2000) // Change image every 4 seconds

        return () => clearInterval(interval)
      }
    }
  }, [showPropertyModal, selectedProperty])

  async function loadFeaturedProperties() {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('available', true)
      .order('created_at', { ascending: false })
      .limit(6)
    
    setProperties(data || [])
    setLoading(false)
  }

  // Get property images (from database or use mock images)
  const getPropertyImages = (property) => {
    // If property has images stored in database, use those
    if (property.images && Array.isArray(property.images) && property.images.length > 0) {
      return property.images
    }
    
    // Otherwise, use mock Unsplash images
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-gray-100">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
        {/* Decorative shapes */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-white opacity-10 rounded-full   -3xl"></div>
          <div className="absolute top-32 -left-10 w-48 h-48 bg-gray-400 opacity-10 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 leading-tight">
            Welcome to{' '}
            <span className="bg-gradient-to-r from-gray-300 to-white bg-clip-text text-transparent">
              EaseRent
            </span>
          </h1>
          <p className="text-lg md:text-xl mb-2 text-gray-300 font-light">
            Smart Rental Management Platform
          </p>
          <p className="text-base opacity-90 max-w-xl mx-auto mb-6">
            Connecting landlords and tenants with seamless property management
          </p>
          
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => {
                setAuthMode('signup')
                setShowAuthModal(true)
              }}
              className="px-6 py-3 bg-white text-black rounded-lg font-semibold hover:bg-gray-100 transition shadow-lg text-sm"
            >
              Get Started Free
            </button>
            <button
              onClick={() => {
                setAuthMode('signin')
                setShowAuthModal(true)
              }}
              className="px-6 py-3 bg-white/10 backdrop-blur-sm text-white rounded-lg font-semibold hover:bg-white/20 transition border border-white/30 text-sm"
            >
              Sign up
            </button>
          </div>
        </div>
      </div>

      {/* Featured Properties */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-1 h-6 bg-gradient-to-b from-gray-900 to-gray-600 rounded-full"></div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Featured Properties</h2>
        </div>
        
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading properties...</p>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No properties available at the moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {properties.map((property) => {
              const images = getPropertyImages(property)
              const currentIndex = currentImageIndex[property.id] || 0
              
              return (
                <div key={property.id} className="group bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300 border border-gray-100">
                  {/* Image Slider - Top */}
                  <div className="relative">
                    <div className="aspect-video relative overflow-hidden">
                      <img 
                        src={images[currentIndex]} 
                        alt={property.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      
                      {/* Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* Navigation Arrows */}
                      {images.length > 1 && (
                        <>
                          <button
                            onClick={() => prevImage(property.id, images.length)}
                            className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-gray-800 w-10 h-10 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-white hover:scale-110 flex items-center justify-center shadow-lg"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => nextImage(property.id, images.length)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-gray-800 w-10 h-10 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-white hover:scale-110 flex items-center justify-center shadow-lg"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </>
                      )}
                      
                      {/* Image Indicators */}
                      {images.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                          {images.map((_, idx) => (
                            <div
                              key={idx}
                              className={`h-1.5 rounded-full transition-all duration-300 ${
                                idx === currentIndex ? 'w-8 bg-white shadow-lg' : 'w-1.5 bg-white/60'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Property Info - Bottom */}
                  <div className="p-6">
                    <h3 className="text-xl font-bold mb-2 line-clamp-1 text-gray-900 group-hover:text-black transition-colors">{property.title}</h3>
                    <div className="flex items-start gap-2 mb-4">
                      <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <p className="text-sm text-gray-600 line-clamp-1">
                        {property.address}, {property.city}
                        {property.state && `, ${property.state}`}
                      </p>
                    </div>
                    
                    <div className="mb-4">
                      <p className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                        ₱{Number(property.price).toLocaleString()}
                      </p>
                      <span className="text-sm text-gray-500 font-medium">per month</span>
                    </div>
                    
                    <div className="flex gap-4 mb-4 pb-4 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">{property.bedrooms} bed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">{property.bathrooms} bath</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">{property.area_sqft} sqft</span>
                      </div>
                    </div>
                    
                    {property.description && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">
                        {property.description}
                      </p>
                    )}
                    
                    <button
                      onClick={() => openPropertyModal(property)}
                      className="w-full bg-gradient-to-r from-gray-900 to-gray-700 text-white py-3 px-6 rounded-xl text-sm font-semibold hover:from-black hover:to-gray-800 transition-all duration-300 shadow-md hover:shadow-xl transform hover:scale-[1.02]"
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

      {/* Why Us Section */}
      <div className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2">
              Why Choose EaseRent?
            </h2>
            <p className="text-gray-600 text-sm max-w-xl mx-auto">
              Best rental management experience with cutting-edge technology
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-6 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 hover:shadow-lg transition-all">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Secure & Trusted</h3>
              <p className="text-gray-600 text-sm">
                Industry-standard encryption and secure payments
              </p>
            </div>

            <div className="text-center p-6 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 hover:shadow-lg transition-all">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-700 to-gray-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Fast & Easy</h3>
              <p className="text-gray-600 text-sm">
                Streamlined processes for quick management
              </p>
            </div>

            <div className="text-center p-6 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 hover:shadow-lg transition-all">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-600 to-gray-400 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">24/7 Support</h3>
              <p className="text-gray-600 text-sm">
                Always available to help with your needs
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Business Permits Section */}
      <div className="bg-gradient-to-br from-gray-50 to-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2">
              Business Permits & Certifications
            </h2>
            <p className="text-gray-600 text-sm max-w-xl mx-auto">
              Fully licensed and certified rental management platform
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all">
              <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <svg className="w-20 h-20 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="p-4 text-center">
                <h3 className="text-base font-bold text-gray-900 mb-1">Business Permit</h3>
                <p className="text-gray-600 text-xs">Valid until 2026</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all">
              <div className="aspect-video bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                <svg className="w-20 h-20 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <div className="p-4 text-center">
                <h3 className="text-base font-bold text-gray-900 mb-1">DTI Registration</h3>
                <p className="text-gray-600 text-xs">Certified & Verified</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all">
              <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <svg className="w-20 h-20 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="p-4 text-center">
                <h3 className="text-base font-bold text-gray-900 mb-1">BIR Registration</h3>
                <p className="text-gray-600 text-xs">Tax Compliant</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Company History Section */}
      <div className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2">
              Our Story
            </h2>
            <p className="text-gray-600 text-sm max-w-xl mx-auto">
              Building a better rental experience since 2020
            </p>
          </div>

          <div className="relative">
            <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-0.5 bg-gradient-to-b from-gray-900 to-gray-600 hidden md:block"></div>
            
            <div className="space-y-8">
              <div className="relative flex items-center md:justify-start">
                <div className="md:w-1/2 md:pr-8 text-right">
                  <div className="bg-gradient-to-br from-gray-100 to-gray-200 p-5 rounded-xl shadow-lg">
                    <div className="text-xl font-bold text-gray-900 mb-1">2020</div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Founded</h3>
                    <p className="text-gray-600 text-sm">
                      Established to revolutionize property rental management
                    </p>
                  </div>
                </div>
                <div className="hidden md:block absolute left-1/2 transform -translate-x-1/2 w-6 h-6 bg-gray-900 rounded-full border-4 border-white shadow-lg"></div>
              </div>

              <div className="relative flex items-center md:justify-end">
                <div className="md:w-1/2 md:pl-8">
                  <div className="bg-gradient-to-br from-gray-200 to-gray-300 p-5 rounded-xl shadow-lg">
                    <div className="text-xl font-bold text-gray-800 mb-1">2022</div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Platform Launch</h3>
                    <p className="text-gray-600 text-sm">
                      Launched platform connecting landlords and tenants
                    </p>
                  </div>
                </div>
                <div className="hidden md:block absolute left-1/2 transform -translate-x-1/2 w-6 h-6 bg-gray-700 rounded-full border-4 border-white shadow-lg"></div>
              </div>

              <div className="relative flex items-center md:justify-start">
                <div className="md:w-1/2 md:pr-8 text-right">
                  <div className="bg-gradient-to-br from-gray-100 to-gray-200 p-5 rounded-xl shadow-lg">
                    <div className="text-xl font-bold text-gray-900 mb-1">2025</div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Growing Strong</h3>
                    <p className="text-gray-600 text-sm">
                      Serving 1,000+ users with 500+ properties
                    </p>
                  </div>
                </div>
                <div className="hidden md:block absolute left-1/2 transform -translate-x-1/2 w-6 h-6 bg-gray-600 rounded-full border-4 border-white shadow-lg"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Owner Information Section */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
              Meet Our Leadership
            </h2>
            <p className="text-gray-300 text-sm max-w-xl mx-auto">
              Experienced professionals dedicated to your success
            </p>
          </div>

          {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden hover:scale-105 transition-transform">
              <div className="aspect-video bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                <svg className="w-20 h-20 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
              <div className="p-4 text-center">
                <h3 className="text-lg font-bold text-gray-900 mb-1">John Doe</h3>
                <p className="text-gray-800 font-medium text-sm mb-2">Chief Executive Officer</p>
                <p className="text-gray-600 text-xs">
                  15+ years in real estate management
                </p>
              </div>
            </div>

            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden hover:scale-105 transition-transform">
              <div className="aspect-video bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                <svg className="w-20 h-20 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
              <div className="p-4 text-center">
                <h3 className="text-lg font-bold text-gray-900 mb-1">Jane Smith</h3>
                <p className="text-gray-700 font-medium text-sm mb-2">Chief Operating Officer</p>
                <p className="text-gray-600 text-xs">
                  Operations and customer service expert
                </p>
              </div>
            </div>

            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden hover:scale-105 transition-transform">
              <div className="aspect-video bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                <svg className="w-20 h-20 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
              <div className="p-4 text-center">
                <h3 className="text-lg font-bold text-gray-900 mb-1">Mike Johnson</h3>
                <p className="text-gray-600 font-medium text-sm mb-2">Chief Technology Officer</p>
                <p className="text-gray-600 text-xs">
                  Technology innovation leader
                </p>
              </div>
            </div>
          </div> */}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-gray-400 text-sm">
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
              className="fixed inset-0 bg-black/40"
              onClick={closePropertyModal}
            ></div>

            {/* Modal panel */}
            <div className="relative inline-block w-full max-w-6xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
              {/* Close button */}
              <button
                onClick={closePropertyModal}
                className="absolute top-4 right-4 z-10 p-2 bg-white/80 rounded-full hover:bg-white transition-all"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="flex flex-col md:flex-row max-h-[85vh]">
                {/* Left side - Images */}
                <div className="w-full md:w-1/2">
                  <div className="relative h-[350px] md:h-[600px] overflow-hidden">
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
                            
                            {/* Zoom lens - small box that follows cursor */}
                            {showZoom && (
                              <div 
                                className="absolute w-32 h-32 border-4 border-white rounded-lg shadow-2xl pointer-events-none overflow-hidden"
                                style={{
                                  left: `${zoomPosition.x}%`,
                                  top: `${zoomPosition.y}%`,
                                  transform: 'translate(-50%, -50%)',
                                  backgroundImage: `url(${images[modalImageIndex]})`,
                                  backgroundSize: '300%',
                                  backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
                                }}
                              >
                                <div className="absolute inset-0 ring-2 ring-gray-700/50"></div>
                              </div>
                            )}
                          </div>
                          
                          {/* Image navigation arrows */}
                          {images.length > 1 && (
                            <>
                              <button
                                onClick={prevModalImage}
                                className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 text-gray-800 w-10 h-10 rounded-full hover:bg-white flex items-center justify-center shadow-lg transition-all"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                </svg>
                              </button>
                              <button
                                onClick={nextModalImage}
                                className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 text-gray-800 w-10 h-10 rounded-full hover:bg-white flex items-center justify-center shadow-lg transition-all"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </>
                          )}
                          
                          {/* Image indicators */}
                          {images.length > 1 && (
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                              {images.map((_, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setModalImageIndex(idx)}
                                  className={`h-1.5 rounded-full transition-all ${
                                    idx === modalImageIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/60'
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
                <div className="w-full md:w-1/2 p-6 overflow-y-auto">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedProperty.title}</h2>
                  <div className="flex items-start gap-2 text-gray-600 mb-4">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-sm">
                      {selectedProperty.address}, {selectedProperty.city}
                      {selectedProperty.state && `, ${selectedProperty.state}`}
                    </p>
                  </div>

                  <div className="mb-4 pb-4 border-b border-gray-200">
                    <p className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                      ₱{Number(selectedProperty.price).toLocaleString()}
                    </p>
                    <span className="text-gray-600 text-sm">per month</span>
                  </div>

                  <div className="flex gap-3 mb-4 pb-4 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">{selectedProperty.bedrooms} bed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">{selectedProperty.bathrooms} bath</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">{selectedProperty.area_sqft} sqft</span>
                    </div>
                  </div>

                  {selectedProperty.description && (
                    <div className="mb-4">
                      <h3 className="text-lg font-bold text-gray-900 mb-2">Description</h3>
                      <p className="text-gray-700 text-sm leading-relaxed line-clamp-4">
                        {selectedProperty.description}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        closePropertyModal()
                        setAuthMode('signup')
                        setShowAuthModal(true)
                      }}
                      className="flex-1 bg-gradient-to-r from-gray-900 to-gray-700 text-white py-2.5 px-4 rounded-xl text-sm font-semibold hover:from-black hover:to-gray-800 transition-all"
                    >
                      Apply Now
                    </button>
                    <button
                      onClick={() => {
                        closePropertyModal()
                        setAuthMode('signin')
                        setShowAuthModal(true)
                      }}
                      className="px-4 py-2.5 border-2 border-gray-900 text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all"
                    >
                      Sign up
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
        initialMode={authMode}
      />
    </div>
  )
}
