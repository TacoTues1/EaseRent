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
  const [showFaqChat, setShowFaqChat] = useState(false)
  const [selectedFaq, setSelectedFaq] = useState(null)
  const [chatHistory, setChatHistory] = useState([])
  const chatMessagesRef = useRef(null)

  useEffect(() => {
    loadFeaturedProperties()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      properties.forEach(property => {
        const images = getPropertyImages(property)
        if (images.length > 1) {
          nextImage(property.id, images.length)
        }
      })
    }, 100)

    return () => clearInterval(interval)
  }, [properties])

  // Auto-slide modal images every 0.1 seconds
  useEffect(() => {
    if (showPropertyModal && selectedProperty) {
      const images = getPropertyImages(selectedProperty)
      if (images.length > 1) {
        const interval = setInterval(() => {
          setModalImageIndex((prev) => (prev + 1) % images.length)
        }, 100)

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

  async function loadFeaturedProperties() {
    const { data, error } = await supabase
      .from('properties')
      .select(`
        *,
        landlord_profile:profiles!properties_landlord_fkey(id, first_name, middle_name, last_name, role)
      `)
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
      // `https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop`,
      // `https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&h=600&fit=crop`,
      // `https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop`
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
    <div className="min-h-screen bg-white font-sans text-black">  
      {/* Featured Properties */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-black text-black uppercase tracking-tight">Featured Properties</h2>
          <div className="w-24 h-1 bg-black mx-auto mt-4"></div>
        </div>
        
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-black"></div>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl">
            <p className="text-gray-500 text-sm font-medium">No properties available at the moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {properties.map((property) => {
              const images = getPropertyImages(property)
              const currentIndex = currentImageIndex[property.id] || 0
              
              return (
                <div 
                  key={property.id} 
                  className="group bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer flex flex-col hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/properties/${property.id}`)}
                >
                  {/* Image Slider - Top */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                    <img 
                      src={images[currentIndex]} 
                      alt={property.title}
                      className="w-full h-full object-cover transition-transform duration-500"
                    />
                    
                    {/* Navigation Arrows (Only show on hover) */}
                    {images.length > 1 && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button
                          onClick={(e) => { e.stopPropagation(); prevImage(property.id, images.length); }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-black w-9 h-9 flex items-center justify-center rounded-full shadow-md"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); nextImage(property.id, images.length); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-black w-9 h-9 flex items-center justify-center rounded-full shadow-md"
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
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/properties/${property.id}`);
                      }}
                      className="w-full bg-black text-white py-3 px-4 rounded-lg text-sm font-bold uppercase tracking-wider cursor-pointer"
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
      
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
        initialMode={authMode}
      />
    </div>
  )
}