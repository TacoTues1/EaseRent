import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast, { Toaster } from 'react-hot-toast'
import ChatWidget from '../components/ChatWidget'

export default function Dashboard() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState({})
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
    }
  }, [profile])

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
      .single()
    
    if (data) {
      setProfile(data)
    } else {
      // Profile doesn't exist (e.g., Google sign-in user), create one
      const user = session?.user || (await supabase.auth.getUser()).data.user
      const { data: newProfile, error } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          full_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User',
          role: 'tenant' // Default role for new users
        })
        .select()
        .single()
      
      if (newProfile) setProfile(newProfile)
    }
  }

  async function loadProperties() {
    setLoading(true)
    
    let query = supabase
      .from('properties')
      .select('*, landlord_profile:profiles!properties_landlord_fkey(id, full_name, role)')
      .order('created_at', { ascending: false })

    // If landlord, show their own properties (all statuses)
    if (profile?.role === 'landlord') {
      query = query.eq('landlord', session.user.id)
    }
    // Tenants see all properties regardless of status

    const { data, error } = await query
    
    if (error) {
      console.error('Error loading properties:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
    }
    // console.log('Dashboard properties loaded:', data)
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

  async function togglePropertyVisibility(propertyId, newStatus) {
    const { error } = await supabase
      .from('properties')
      .update({ status: newStatus })
      .eq('id', propertyId)

    if (!error) {
      // Reload properties to reflect changes
      loadProperties()
      toast.success(`Property status changed to ${newStatus}`)
    } else {
      toast.error('Failed to update property status')
    }
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="inline-block h-12 w-12 border-b-2 border-black"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="relative bg-black text-white py-16">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3">
            Welcome, {profile.full_name}!
          </h1>
          <p className="text-xl max-w-2xl leading-relaxed">
            {profile.role === 'landlord' 
              ? 'Manage your properties and track tenant applications with ease' 
              : 'Explore available properties and manage your rentals seamlessly'}
          </p>
        </div>
      </div>

      {/* Properties Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-4xl font-bold text-black mb-2">
              {profile.role === 'landlord' ? 'Your Properties' : 'Available Properties'}
            </h2>
            <p className="text-black">
              {profile.role === 'landlord' 
                ? 'Manage and update your property listings' 
                : 'Find your perfect rental home'}
            </p>
          </div>
          {profile.role === 'landlord' && (
            <button
            style={{ 
            borderRadius: '5px',
            }}
              onClick={() => router.push('/properties/new')}
              className="flex items-center gap-0 px-1 py-1 bg-black text-white border-2 border-black cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="font-semibold">Add Property</span>
            </button>
          )}
        </div>
        
        {loading ? (
          <div className="text-center py-16">
            <div 
            className="inline-block h-16 w-16 border-4 border-white border-t-black"></div>
            <p className="mt-6 text-black text-lg font-medium">Loading properties...</p>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-16 bg-white border-2 border-black">
            <div className="w-20 h-20 mx-auto mb-6 bg-black flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-black text-lg mb-6">
              {profile.role === 'landlord' 
                ? "You haven't listed any properties yet." 
                : 'No properties available at the moment.'}
            </p>
            {profile.role === 'landlord' && (
              <button
                onClick={() => router.push('/properties/new')}
                className="px-8 py-3 bg-black text-white border-2 border-black font-semibold"
              >
                Add Your First Property
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {properties.map((property) => {
              const images = getPropertyImages(property)
              const currentIndex = currentImageIndex[property.id] || 0
              
              return (
                <div key={property.id} className="bg-white border-2 border-black overflow-hidden">
                  {/* Image Slider - Top */}
                  <div className="relative">
                    <div className="aspect-video relative overflow-hidden">
                      <img 
                        src={images[currentIndex]} 
                        alt={property.title}
                        className="w-full h-full object-cover"
                      />
                      
                      {/* Navigation Arrows */}
                      {images.length > 1 && (
                        <>
                          <button
                            onClick={() => prevImage(property.id, images.length)}
                            className="absolute left-3 top-1/2 -translate-y-1/2 bg-white text-black w-10 h-10 border-2 border-black flex items-center justify-center cursor-pointer"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => nextImage(property.id, images.length)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 bg-white text-black w-10 h-10 border-2 border-black flex items-center justify-center cursor-pointer"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </>
                      )}
                      
                      {/* Image Indicators */}
                      {images.length > 1 && (
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {images.map((_, idx) => (
                            <div
                              key={idx}
                              className={`h-1.5 rounded-full transition-all duration-300 ${
                                idx === currentIndex ? 'w-6 bg-white shadow-lg' : 'w-1.5 bg-white/60'
                              }`}
                            />
                          ))}
                        </div>
                      )}

                      {/* Status Badge */}
                      <div className="absolute top-4 right-4">
                        <span className={`px-3 py-1.5 text-xs font-bold border-2 border-black ${
                          property.status === 'available'
                            ? 'bg-black text-white' 
                            : property.status === 'occupied'
                            ? 'bg-white text-black'
                            : 'bg-white text-black'
                        }`}>
                          {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Property Info - Bottom */}
                  <div className="p-4">
                    <h3 className="text-lg font-bold mb-2 line-clamp-1 text-black">{property.title}</h3>
                    
                    {/* Landlord Name - Only show for tenants */}
                    {profile?.role === 'tenant' && property.landlord_profile?.full_name && (
                      <p className="text-xs text-gray-500 mb-2">
                        By {property.landlord_profile.full_name}
                      </p>
                    )}
                    
                    <div className="flex items-start gap-2 mb-3">
                      <svg className="w-4 h-4 text-black mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <p className="text-xs text-black line-clamp-1">
                        {property.address}, {property.city}
                        {property.state && `, ${property.state}`}
                      </p>
                    </div>
                    
                    <div className="mb-3">
                      <p className="text-2xl font-bold text-black">
                        ₱{Number(property.price).toLocaleString()}
                      </p>
                      <span className="text-xs text-black font-medium">per month</span>
                    </div>
                    
                    <div className="flex gap-3 mb-3 pb-3 border-b-2 border-black">
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 640 512">
                          <path d="M32 32c17.7 0 32 14.3 32 32V320H288V160c0-17.7 14.3-32 32-32H544c53 0 96 43 96 96V448c0 17.7-14.3 32-32 32s-32-14.3-32-32V416H352 320 64v32c0 17.7-14.3 32-32 32s-32-14.3-32-32V64C0 46.3 14.3 32 32 32zm144 96a80 80 0 1 1 0 160 80 80 0 1 1 0-160z"/>
                        </svg>
                        <span className="text-xs font-medium text-black">{property.bedrooms}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 512 512">
                          <path d="M96 77.3c0-7.3 5.9-13.3 13.3-13.3c3.5 0 6.9 1.4 9.4 3.9l14.9 14.9C130 91.8 128 101.7 128 112c0 19.9 7.2 38 19.2 52c-5.3 9.2-4 21.1 3.8 29c9.4 9.4 24.6 9.4 33.9 0L289 89c9.4-9.4 9.4-24.6 0-33.9c-7.9-7.9-19.8-9.1-29-3.8C246 39.2 227.9 32 208 32c-10.3 0-20.2 2-29.2 5.5L163.9 22.6C149.4 8.1 129.7 0 109.3 0C66.6 0 32 34.6 32 77.3V256c-17.7 0-32 14.3-32 32s14.3 32 32 32H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H96V77.3zM32 352v16c0 28.4 12.4 54 32 71.6V480c0 17.7 14.3 32 32 32s32-14.3 32-32V464H384v16c0 17.7 14.3 32 32 32s32-14.3 32-32V439.6c19.6-17.6 32-43.1 32-71.6V352H32z"/>
                        </svg>
                        <span className="text-xs font-medium text-black">{property.bathrooms}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                        <span className="text-xs font-medium text-black">{property.area_sqft}</span>
                      </div>
                    </div>
                    
                    {property.description && (
                      <p className="text-xs text-black mb-3 line-clamp-2 leading-relaxed">
                        {property.description}
                      </p>
                    )}
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePropertyAction(property.id)}
                        className="flex-1 bg-black text-white py-2 px-3 text-xs font-semibold border-2 border-black cursor-pointer"
                      >
                        {profile.role === 'landlord' ? 'Edit' : 'View Details'}
                      </button>
                      {profile.role === 'landlord' && (
                        <select
                          value={property.status || 'available'}
                          onChange={(e) => togglePropertyVisibility(property.id, e.target.value)}
                          className={`flex-1 py-2 px-3 text-xs font-semibold border-2 border-black cursor-pointer ${
                            property.status === 'available'
                              ? 'bg-black text-white'
                              : property.status === 'occupied'
                              ? 'bg-white text-black'
                              : 'bg-white text-black'
                          }`}
                        >
                          <option value="available" className="bg-white text-black">Available</option>
                          <option value="occupied" className="bg-white text-black">Occupied</option>
                          <option value="not available" className="bg-white text-black">Not Available</option>
                        </select>
                      )}
                      {profile.role === 'tenant' && property.status === 'available' && (
                        <button
                          onClick={() => router.push(`/properties/${property.id}`)}
                          className="flex-1 bg-black text-white py-2 px-3 text-xs font-semibold border-2 border-black"
                        >
                        Apply
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Quick Links Section */}
        <div className="mt-12">
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-black mb-2">Quick Actions</h3>
            <p className="text-sm text-black">Access frequently used features</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {profile.role === 'tenant' && (
              <button
                onClick={() => router.push('/maintenance')}
                className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <div className="font-bold text-base mb-1 text-black">Maintenance</div>
                <div className="text-xs text-black leading-relaxed">
                  Submit request
                </div>
              </button>
            )}

            {profile.role === 'landlord' && (
              <>
                <button
                  onClick={() => router.push('/maintenance')}
                  className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </div>
                  <div className="font-bold text-base mb-1 text-black">Maintenance</div>
                  <div className="text-xs text-black leading-relaxed">
                    View requests
                  </div>
                </button>

                <button
                  onClick={() => router.push('/bookings')}
                  className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="font-bold text-base mb-1 text-black">Bookings</div>
                  <div className="text-xs text-black leading-relaxed">
                    Manage viewings
                  </div>
                </button>
              </>
            )}

            <button
              onClick={() => router.push('/payments')}
              className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="font-bold text-base mb-1 text-black">Payments</div>
              <div className="text-xs text-black leading-relaxed">
                {profile.role === 'landlord' 
                  ? 'Track income' 
                  : 'Payment history'}
              </div>
            </button>

            <button
              onClick={() => router.push('/messages')}
              className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div className="font-bold text-base mb-1 text-black">Messages</div>
              <div className="text-xs text-black leading-relaxed">
                {profile.role === 'landlord' 
                  ? 'Chat with tenants' 
                  : 'Chat with landlords'}
              </div>
            </button>

            <button
              onClick={() => router.push('/settings')}
              className="p-4 bg-white border-2 border-black text-left hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 mb-3 bg-black flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="font-bold text-base mb-1 text-black">Settings</div>
              <div className="text-xs text-black leading-relaxed">
                Account settings
              </div>
            </button>
          </div>
        </div>

        {/* FAQ Section - Tenant Only */}
        {profile.role === 'tenant' && (
          <div className="mt-12 bg-white border-2 border-black p-6">
            <h3 className="text-2xl font-bold text-black mb-6">Frequently Asked Questions</h3>
            <div className="space-y-4">
              <div className="border-b-2 border-gray-200 pb-4">
                <h4 className="font-bold text-black mb-2">How do I apply for a property?</h4>
                <p className="text-sm text-black leading-relaxed">
                  Click on "View Details" to see the full property information, then click "Apply" to submit your application. The landlord will review and contact you.
                </p>
              </div>
              
              <div className="border-b-2 border-gray-200 pb-4">
                <h4 className="font-bold text-black mb-2">How do I schedule a property viewing?</h4>
                <p className="text-sm text-black leading-relaxed">
                  On the property details page, you'll find available time slots for viewing. Select your preferred date and time to book an appointment with the landlord.
                </p>
              </div>
              
              <div className="border-b-2 border-gray-200 pb-4">
                <h4 className="font-bold text-black mb-2">How do I pay my rent?</h4>
                <p className="text-sm text-black leading-relaxed">
                  Go to the Payments section where you'll receive payment requests from your landlord. You can upload proof of payment and track your payment history.
                </p>
              </div>
              
              <div className="border-b-2 border-gray-200 pb-4">
                <h4 className="font-bold text-black mb-2">How do I submit a maintenance request?</h4>
                <p className="text-sm text-black leading-relaxed">
                  Navigate to the Maintenance section from the Quick Actions menu. Fill out the form describing the issue and submit it. Your landlord will be notified immediately.
                </p>
              </div>
              
              <div className="border-b-2 border-gray-200 pb-4">
                <h4 className="font-bold text-black mb-2">How can I contact my landlord?</h4>
                <p className="text-sm text-black leading-relaxed">
                  Use the Messages feature to chat directly with your landlord. You can send text messages, images, and files for any property-related communication.
                </p>
              </div>
              
              <div>
                <h4 className="font-bold text-black mb-2">What if I need to move out?</h4>
                <p className="text-sm text-black leading-relaxed">
                  Contact your landlord through the messaging system to discuss your move-out date and process. Make sure to settle all outstanding payments before moving out.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
