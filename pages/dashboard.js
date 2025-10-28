import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast, { Toaster } from 'react-hot-toast'

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
      .select('*')
      .order('created_at', { ascending: false })

    // If landlord, show their own properties (all statuses)
    if (profile?.role === 'landlord') {
      query = query.eq('landlord', session.user.id)
    } else {
      // If tenant, show only available properties
      query = query.eq('available', true)
    }

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

  async function togglePropertyVisibility(propertyId, currentStatus) {
    const { error } = await supabase
      .from('properties')
      .update({ available: !currentStatus })
      .eq('id', propertyId)

    if (!error) {
      // Reload properties to reflect changes
      loadProperties()
      toast.success('Property visibility updated')
    } else {
      toast.error('Failed to update property visibility')
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
      <Toaster position="top-right" />
      {/* Hero Section */}
      <div className="relative bg-black text-white py-16">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3">
            Welcome back, {profile.full_name}!
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
              onClick={() => router.push('/properties/new')}
              className="flex items-center gap-2 px-6 py-3 bg-black text-white border-2 border-black"
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
            <div className="inline-block h-16 w-16 border-4 border-white border-t-black"></div>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                            className="absolute left-3 top-1/2 -translate-y-1/2 bg-white text-black w-10 h-10 border-2 border-black flex items-center justify-center"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => nextImage(property.id, images.length)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 bg-white text-black w-10 h-10 border-2 border-black flex items-center justify-center"
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
                              className={`h-1.5 ${
                                idx === currentIndex ? 'w-8 bg-white border border-black' : 'w-1.5 bg-white border border-black'
                              }`}
                            />
                          ))}
                        </div>
                      )}

                      {/* Availability Badge */}
                      {profile.role === 'landlord' && (
                        <div className="absolute top-4 right-4">
                          <span className={`px-4 py-2 text-xs font-bold border-2 border-black ${
                            property.available 
                              ? 'bg-black text-white' 
                              : 'bg-white text-black'
                          }`}>
                            {property.available ? 'Available' : 'Occupied'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Property Info - Bottom */}
                  <div className="p-6">
                    <h3 className="text-xl font-bold mb-2 line-clamp-1 text-black">{property.title}</h3>
                    <div className="flex items-start gap-2 mb-4">
                      <svg className="w-4 h-4 text-black mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <p className="text-sm text-black line-clamp-1">
                        {property.address}, {property.city}
                        {property.state && `, ${property.state}`}
                      </p>
                    </div>
                    
                    <div className="mb-4">
                      <p className="text-3xl font-bold text-black">
                        ₱{Number(property.price).toLocaleString()}
                      </p>
                      <span className="text-sm text-black font-medium">per month</span>
                    </div>
                    
                    <div className="flex gap-4 mb-4 pb-4 border-b-2 border-black">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        <span className="text-sm font-medium text-black">{property.bedrooms} bed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                        </svg>
                        <span className="text-sm font-medium text-black">{property.bathrooms} bath</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                        <span className="text-sm font-medium text-black">{property.area_sqft} sqft</span>
                      </div>
                    </div>
                    
                    {property.description && (
                      <p className="text-sm text-black mb-4 line-clamp-2 leading-relaxed">
                        {property.description}
                      </p>
                    )}
                    
                    <div className="flex gap-3">
                      <button
                        onClick={() => handlePropertyAction(property.id)}
                        className="flex-1 bg-black text-white py-3 px-4 text-sm font-semibold border-2 border-black"
                      >
                        {profile.role === 'landlord' ? 'Edit' : 'View'}
                      </button>
                      {profile.role === 'landlord' && (
                        <button
                          onClick={() => togglePropertyVisibility(property.id, property.available)}
                          className={`flex-1 py-3 px-4 text-sm font-semibold border-2 border-black ${
                            property.available
                              ? 'bg-white text-black'
                              : 'bg-black text-white'
                          }`}
                          title={property.available ? 'Hide from tenants' : 'Show to tenants'}
                        >
                          {property.available ? 'Hide' : 'Show'}
                        </button>
                      )}
                      {profile.role === 'tenant' && property.available && (
                        <button
                          onClick={() => router.push(`/properties/${property.id}`)}
                          className="flex-1 bg-black text-white py-3 px-4 text-sm font-semibold border-2 border-black"
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
        <div className="mt-16">
          <div className="mb-8">
            <h3 className="text-3xl font-bold text-black mb-2">Quick Actions</h3>
            <p className="text-black">Access frequently used features</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {profile.role === 'tenant' && (
              <button
                onClick={() => router.push('/maintenance')}
                className="p-8 bg-white border-2 border-black text-left"
              >
                <div className="w-16 h-16 mb-4 bg-black flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="font-bold text-xl mb-2 text-black">Maintenance</div>
                <div className="text-sm text-black leading-relaxed">
                  Submit maintenance request
                </div>
              </button>
            )}

            {profile.role === 'landlord' && (
              <button
                onClick={() => router.push('/maintenance')}
                className="p-8 bg-white border-2 border-black text-left"
              >
                <div className="w-16 h-16 mb-4 bg-black flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="font-bold text-xl mb-2 text-black">Maintenance Requests</div>
                <div className="text-sm text-black leading-relaxed">
                  View tenant maintenance requests
                </div>
              </button>
            )}

            <button
              onClick={() => router.push('/payments')}
              className="p-8 bg-white border-2 border-black text-left"
            >
              <div className="w-16 h-16 mb-4 bg-black flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div className="font-bold text-xl mb-2 text-black">Payments</div>
              <div className="text-sm text-black leading-relaxed">
                {profile.role === 'landlord' 
                  ? 'Track income and payments' 
                  : 'View payment history'}
              </div>
            </button>

            <button
              onClick={() => router.push('/messages')}
              className="p-8 bg-white border-2 border-black text-left"
            >
              <div className="w-16 h-16 mb-4 bg-black flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div className="font-bold text-xl mb-2 text-black">Messages</div>
              <div className="text-sm text-black leading-relaxed">
                {profile.role === 'landlord' 
                  ? 'Chat with your tenants' 
                  : 'Chat with landlords'}
              </div>
            </button>

            <button
              onClick={() => router.push('/settings')}
              className="p-8 bg-white border-2 border-black text-left"
            >
              <div className="w-16 h-16 mb-4 bg-black flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="font-bold text-xl mb-2 text-black">Settings</div>
              <div className="text-sm text-black leading-relaxed">
                Manage your account settings
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
