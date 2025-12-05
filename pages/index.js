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

  // Auto-scroll chat to bottom when new messages are added
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
        landlord_profile:profiles!properties_landlord_fkey(id, full_name, role)
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
    {
      id: 5,
      question: "What if something needs repair?",
      answer: "Submit a maintenance request through the Maintenance section in your dashboard. Describe the issue, upload photos if needed, and your landlord will be notified immediately."
    },
    {
      id: 6,
      question: "What documents do I need?",
      answer: "Typically, you'll need a valid ID, proof of income or employment, and references. Specific requirements vary by landlord, so check the property listing for details."
    }
  ]

  const handleFaqClick = (faq) => {
    if (!showFaqChat) {
      // First time opening - just show the chat with this FAQ
      setSelectedFaq(faq)
      setChatHistory([faq])
      setShowFaqChat(true)
    } else {
      // Already open - add to history
      setChatHistory(prev => [...prev, faq])
      setSelectedFaq(faq)
    }
  }

  const closeFaqChat = () => {
    setShowFaqChat(false)
    setSelectedFaq(null)
    setChatHistory([])
  }

  const openPermitModal = (permit) => {
    setSelectedPermit(permit)
    setShowPermitModal(true)
  }

  const closePermitModal = () => {
    setShowPermitModal(false)
    setSelectedPermit(null)
  }

  const permits = [
    {
      id: 1,
      title: 'BIR Registration',
      subtitle: 'Tax Compliant',
      image: '/permits/bir.jpeg'
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-gray-100">  
      {/* Featured Properties */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Featured Properties</h2>
        </div>
        
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 text-sm">No properties available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
            {properties.map((property) => {
              const images = getPropertyImages(property)
              const currentIndex = currentImageIndex[property.id] || 0
              
              return (
                <div 
                  key={property.id} 
                  className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => router.push(`/properties/${property.id}`)}
                >
                  {/* Image */}
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img 
                      src={images[currentIndex]} 
                      alt={property.title}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Status Badge */}
                    <span className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-semibold rounded ${
                      property.status === 'available'
                        ? 'bg-black text-white' 
                        : 'bg-gray-200 text-gray-700'
                    }`}>
                      {property.status === 'available' ? 'Available' : 'Occupied'}
                    </span>

                    {/* Image count indicator */}
                    {images.length > 1 && (
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                        1/{images.length}
                      </div>
                    )}
                  </div>
                  
                  {/* Property Info */}
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="text-sm font-semibold line-clamp-1 text-gray-900">{property.title}</h3>
                      <p className="text-sm font-bold text-gray-900 whitespace-nowrap ml-2">
                        ₱{Number(property.price).toLocaleString()}
                      </p>
                    </div>
                    
                    <p className="text-xs text-gray-500 line-clamp-1 mb-3">
                      {property.address}, {property.city}
                    </p>
                    
                    <div className="flex gap-4 mb-3 text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 640 512">
                          <path d="M32 32c17.7 0 32 14.3 32 32V320H288V160c0-17.7 14.3-32 32-32H544c53 0 96 43 96 96V448c0 17.7-14.3 32-32 32s-32-14.3-32-32V416H352 320 64v32c0 17.7-14.3 32-32 32s-32-14.3-32-32V64C0 46.3 14.3 32 32 32zm144 96a80 80 0 1 1 0 160 80 80 0 1 1 0-160z"/>
                        </svg>
                        <span>{property.bedrooms} bed</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 512 512">
                          <path d="M96 77.3c0-7.3 5.9-13.3 13.3-13.3c3.5 0 6.9 1.4 9.4 3.9l14.9 14.9C130 91.8 128 101.7 128 112c0 19.9 7.2 38 19.2 52c-5.3 9.2-4 21.1 3.8 29c9.4 9.4 24.6 9.4 33.9 0L289 89c9.4-9.4 9.4-24.6 0-33.9c-7.9-7.9-19.8-9.1-29-3.8C246 39.2 227.9 32 208 32c-10.3 0-20.2 2-29.2 5.5L163.9 22.6C149.4 8.1 129.7 0 109.3 0C66.6 0 32 34.6 32 77.3V256c-17.7 0-32 14.3-32 32s14.3 32 32 32H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H96V77.3zM32 352v16c0 28.4 12.4 54 32 71.6V480c0 17.7 14.3 32 32 32s32-14.3 32-32V464H384v16c0 17.7 14.3 32 32 32s32-14.3 32-32V439.6c19.6-17.6 32-43.1 32-71.6V352H32z"/>
                        </svg>
                        <span>{property.bathrooms} bath</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                        <span>{property.area_sqft} sqft</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/properties/${property.id}`);
                      }}
                      className="w-full bg-black text-white py-2 px-4 rounded-md text-xs font-semibold hover:bg-gray-800 transition-colors cursor-pointer"
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

          <div className="flex justify-center">
            <div className="w-full max-w-md">
              {permits.map((permit) => (
                <div 
                  key={permit.id}
                  onClick={() => openPermitModal(permit)}
                  className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all cursor-pointer group"
                >
                  <div className="aspect-video overflow-hidden flex items-center justify-center bg-gray-100">
                    <img 
                      src={permit.image} 
                      alt={permit.title}
                      className="h-full w-auto object-contain transform rotate-90 scale-110 group-hover:scale-125 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-4 text-center">
                    <h3 className="text-base font-bold text-gray-900 mb-1">{permit.title}</h3>
                    <p className="text-gray-600 text-xs">{permit.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer with FAQ */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* FAQ Section */}
          <div className="mb-10">
            <h3 className="text-xl font-bold text-white mb-6 text-center">Frequently Asked Questions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {faqData.map((faq) => (
                <button
                  key={faq.id}
                  onClick={() => handleFaqClick(faq)}
                  className="text-left text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  {faq.question}
                </button>
              ))}
            </div>
          </div>
          
          {/* Copyright */}
          <div className="text-center border-t border-gray-700 pt-6">
            <p className="text-gray-400 text-sm">
              © 2025 EaseRent. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* FAQ Chat Widget - Facebook Style */}
      
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
                                className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 text-gray-800 w-10 h-10 rounded-full hover:bg-white flex items-center justify-center shadow-lg transition-all cursor-pointer"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                </svg>
                              </button>
                              <button
                                onClick={nextModalImage}
                                className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 text-gray-800 w-10 h-10 rounded-full hover:bg-white flex items-center justify-center shadow-lg transition-all cursor-pointer"
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
                                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
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
                      className="flex-1 bg-gradient-to-r from-gray-900 to-gray-700 text-white py-2.5 px-4 rounded-xl text-sm font-semibold hover:from-black hover:to-gray-800 transition-all cursor-pointer"
                    >
                      Apply Now
                    </button>
                    <button
                      onClick={() => {
                        closePropertyModal()
                        setAuthMode('signin')
                        setShowAuthModal(true)
                      }}
                      className="px-4 py-2.5 border-2 border-gray-900 text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all cursor-pointer"
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
      
      {/* Permit/Certificate Modal */}
      {showPermitModal && selectedPermit && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            {/* Background overlay */}
            <div 
              className="fixed inset-0 bg-black/70"
              onClick={closePermitModal}
            ></div>

            {/* Modal panel */}
            <div className="relative inline-block w-full max-w-4xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
              {/* Close button */}
              <button
                onClick={closePermitModal}
                className="absolute top-4 right-4 z-10 p-2 bg-white/90 hover:bg-white rounded-full transition-all shadow-lg"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Header */}
              <div className="bg-gradient-to-r from-gray-900 to-gray-700 px-6 py-4">
                <h3 className="text-xl font-bold text-white">{selectedPermit.title}</h3>
                <p className="text-gray-300 text-sm mt-1">{selectedPermit.subtitle}</p>
              </div>

              {/* Image */}
              <div className="p-6 bg-gray-50">
                <div className="bg-white rounded-lg shadow-lg overflow-hidden flex items-center justify-center min-h-[60vh]">
                  <img 
                    src={selectedPermit.image} 
                    alt={selectedPermit.title}
                    className="max-w-full h-auto object-contain max-h-[80vh] transform rotate-90 scale-110"
                  />
                </div>
              </div>

              {/* Footer with navigation */}
              <div className="bg-white px-6 py-4 border-t border-gray-200 flex justify-between items-center">
                <button
                  onClick={() => {
                    const currentIndex = permits.findIndex(p => p.id === selectedPermit.id)
                    const prevIndex = (currentIndex - 1 + permits.length) % permits.length
                    setSelectedPermit(permits[prevIndex])
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>

                <div className="flex gap-2">
                  {permits.map((permit, index) => (
                    <button
                      key={permit.id}
                      onClick={() => setSelectedPermit(permit)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        permit.id === selectedPermit.id 
                          ? 'w-8 bg-gray-900' 
                          : 'bg-gray-300 hover:bg-gray-400'
                      }`}
                    />
                  ))}
                </div>

                <button
                  onClick={() => {
                    const currentIndex = permits.findIndex(p => p.id === selectedPermit.id)
                    const nextIndex = (currentIndex + 1) % permits.length
                    setSelectedPermit(permits[nextIndex])
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center gap-2 transition-colors"
                >
                  Next
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
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
