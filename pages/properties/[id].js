import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { createNotification, NotificationTemplates } from '../../lib/notifications'
import AuthModal from '../../components/AuthModal'

export default function PropertyDetail() {
  const router = useRouter()
  const { id } = router.query
  const [property, setProperty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [applicationMessage, setApplicationMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [landlordProfile, setLandlordProfile] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [hasActiveOccupancy, setHasActiveOccupancy] = useState(false)
  const [occupiedPropertyTitle, setOccupiedPropertyTitle] = useState('')
  const [showAllAmenities, setShowAllAmenities] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
      }
    })
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (data) {
      setProfile(data)
      // Check if tenant already has an active occupancy
      if (data.role === 'tenant') {
        checkActiveOccupancy(userId)
      }
    }
  }

  async function checkActiveOccupancy(userId) {
    const { data } = await supabase
      .from('tenant_occupancies')
      .select('*, property:properties(title)')
      .eq('tenant_id', userId)
      .eq('status', 'active')
      .single()
    
    if (data) {
      setHasActiveOccupancy(true)
      setOccupiedPropertyTitle(data.property?.title || 'a property')
    }
  }

  useEffect(() => {
    if (id) loadProperty()
  }, [id])

  async function loadProperty() {
    setLoading(true)
    // 1. Fetch Property (No complex joins)
    const { data: propertyData, error: propertyError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    
    if (propertyError) {
      console.error('Error loading property:', propertyError)
      setLoading(false)
      return
    }
    // const { data, error } = await supabase
    //   .from('properties')
    //   .select(`
    //     *,
    //     landlord_profile:profiles!properties_landlord_fkey(id, full_name, role)
    //   `)
    //   .eq('id', id)
    //   .single()
    if (propertyData) {
      setProperty(propertyData)


      // 2. Explicitly fetch the Landlord Profile using the ID from the property
      if (propertyData.landlord) {
        const { data: landlordData, error: landlordError } = await supabase
          .from('profiles')
          .select('*') // or select('id, full_name, role')
          .eq('id', propertyData.landlord)
          .maybeSingle()
          
        if (!landlordError && landlordData) {
          setLandlordProfile(landlordData)
        } else {
          console.log("Could not load landlord profile:", landlordError)
        }
      }
    }
//     if (!error && data) {
//       setProperty(data)
//       // Set landlord profile if available
// const profileData = Array.isArray(data.landlord_profile) 
//         ? data.landlord_profile[0] 
//         : data.landlord_profile

//       if (profileData) {
//         setLandlordProfile(profileData)
//       }

//       // if (data.landlord_profile) {
//       //   setLandlordProfile(data.landlord_profile)
//       // }
//     }
    setLoading(false)
  }

  async function handleApply(e) {
    e.preventDefault()
    if (!session) {
      setShowAuthModal(true)
      return
    }

    setSubmitting(true)
    
    // Check if tenant already has an application for this property
    const { data: existingApp } = await supabase
      .from('applications')
      .select('id, status')
      .eq('property_id', id)
      .eq('tenant', session.user.id)
      .single()

    if (existingApp) {
      setMessage(`You already have a ${existingApp.status} application for this property. You cannot submit multiple applications.`)
      setSubmitting(false)
      return
    }

    const { error } = await supabase.from('applications').insert({
      property_id: id,
      tenant: session.user.id,
      message: applicationMessage,
      status: 'pending'
    })

    if (error) {
      setMessage('Error submitting application: ' + error.message)
    } else {
      // Send notification to landlord
      if (property.landlord) {
        const template = NotificationTemplates.newApplication(
          property.title,
          profile?.full_name || 'A tenant'
        )
        await createNotification({
          recipient: property.landlord,
          actor: session.user.id,
          type: template.type,
          message: template.message
        })
      }

      setMessage('Application submitted successfully!')
      setApplicationMessage('')
    }
    setSubmitting(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  if (!property) return <div className="min-h-screen flex items-center justify-center">Property not found</div>

  // Get property images or use placeholder
  const propertyImages = property.images && property.images.length > 0 
    ? property.images 
    : ['https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop']

  const isOwner = profile?.id === property.landlord
  const isLandlord = profile?.role === 'landlord'

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Left Panel - Image Slider */}
          <div className="bg-white rounded-lg overflow-hidden shadow-sm">
            <div className="relative h-96 lg:h-[500px]">
              <img 
                src={propertyImages[currentImageIndex]} 
                alt={property.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop'
                }}
              />
              
              {/* Image navigation */}
              {propertyImages.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentImageIndex((currentImageIndex - 1 + propertyImages.length) % propertyImages.length)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-90 text-gray-900 p-3 rounded-full hover:bg-opacity-100 transition-all shadow-lg"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setCurrentImageIndex((currentImageIndex + 1) % propertyImages.length)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-90 text-gray-900 p-3 rounded-full hover:bg-opacity-100 transition-all shadow-lg"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  
                  {/* Image indicators */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {propertyImages.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`w-2 h-2 rounded-full transition-all ${index === currentImageIndex ? 'bg-white w-6' : 'bg-white bg-opacity-50'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Panel - Property Owner & Application Form */}
          <div className="bg-white rounded-lg shadow-sm p-6 flex flex-col">
            {/* Property Owner Info */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Property Owner</h3>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-white font-bold">
                  {landlordProfile?.full_name 
                  ? landlordProfile.full_name.charAt(0).toUpperCase() 
                  : 'L'}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{landlordProfile?.full_name || 'Property Owner'}</p>
                  <p className="text-sm text-gray-500">Property Owner</p>
                </div>
              </div>
            </div>

            {/* Message/Contact (Optional) */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Message to Owner (Optional)
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent"
                rows="4"
                value={applicationMessage}
                onChange={e => setApplicationMessage(e.target.value)}
                placeholder="Introduce yourself or ask questions about the property..."
              />
            </div>

            {/* Application Button */}
            {property.status === 'available' && !isOwner && !isLandlord && (
              <div className="mt-auto">
                {message && (
                  <div className={`mb-4 p-3 rounded-lg ${
                    message.includes('Error') ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'
                  }`}>
                    {message}
                  </div>
                )}
                
                {/* Block if tenant already has active occupancy */}
                {hasActiveOccupancy ? (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="font-semibold text-yellow-800">You already have an assigned property</p>
                        <p className="text-sm text-yellow-700 mt-1">
                          You are currently assigned to <strong>{occupiedPropertyTitle}</strong>. 
                          You cannot apply for another property until you end your current occupancy.
                        </p>
                        <button
                          onClick={() => router.push('/dashboard')}
                          className="mt-3 text-sm text-yellow-800 underline hover:text-yellow-900"
                        >
                          Go to Dashboard to manage your occupancy
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Terms and Conditions Checkbox */}
                    <div className="mb-4">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="mt-1 w-4 h-4 text-black border-gray-300 rounded focus:ring-black cursor-pointer"
                        />
                        <span className="text-sm text-gray-700">
                          I have read and agree to the{' '}
                          <Link 
                            href={`/terms?propertyId=${property.id}`}
                            target="_blank"
                            className="text-blue-600 hover:underline font-medium"
                          >
                            Terms & Conditions
                          </Link>
                          {' '}for this property.
                        </span>
                      </label>
                    </div>

                    <button
                      onClick={handleApply}
                      disabled={submitting || !termsAccepted}
                      className={`w-full py-4 px-6 rounded-lg text-base font-semibold transition-colors cursor-pointer ${
                        termsAccepted 
                          ? 'bg-gray-900 text-white hover:bg-black disabled:opacity-50' 
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {submitting ? 'Submitting Application...' : 'Submit Application'}
                    </button>
                    {!termsAccepted && (
                      <p className="text-xs text-red-500 text-center mt-2">
                        Please accept and read the terms and conditions to proceed
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Message for landlords */}
            {isLandlord && !isOwner && (
              <div className="mt-auto p-4 bg-gray-100 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-700">
                  <strong>Note:</strong> As a landlord, you cannot apply to properties. Only tenants can submit applications.
                </p>
              </div>
            )}

            {/* Message for property owners */}
            {isOwner && (
              <div className="mt-auto">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
                  <p className="text-sm text-blue-800">
                    <strong>This is your property.</strong> You can edit details or view applications from your dashboard.
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/properties/edit/${property.id}`)}
                  className="w-full bg-gray-900 text-white py-4 px-6 rounded-lg text-base font-semibold hover:bg-black transition-colors"
                >
                  Edit Property
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Property Information Section - Full Width Below */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          {/* Property Title & Price */}
          <div className="mb-6">
            <div className="flex items-start justify-between mb-2">
              <h1 className="text-3xl font-bold text-gray-900">{property.title}</h1>
              <span className={`px-4 py-2 text-sm font-semibold rounded-full border-2 border-black ${
                property.status === 'available' 
                  ? 'bg-black text-white' 
                  : property.status === 'occupied'
                  ? 'bg-white text-black'
                  : 'bg-white text-black'
              }`}>
                {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-600 mb-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm">{property.address}, {property.city} {property.zip}</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-900">₱{Number(property.price).toLocaleString()}</span>
              <span className="text-lg text-gray-600"> / month</span>
            </div>
          </div>

          {/* Property Features */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <div className="flex items-center justify-center mb-2">
                <svg className="w-8 h-8 text-gray-700" fill="currentColor" viewBox="0 0 640 512">
                  <path d="M32 32c17.7 0 32 14.3 32 32V320H288V160c0-17.7 14.3-32 32-32H544c53 0 96 43 96 96V448c0 17.7-14.3 32-32 32s-32-14.3-32-32V416H352 320 64v32c0 17.7-14.3 32-32 32s-32-14.3-32-32V64C0 46.3 14.3 32 32 32zm144 96a80 80 0 1 1 0 160 80 80 0 1 1 0-160z"/>
                </svg>
              </div>
              <div className="text-2xl font-bold text-gray-900">{property.bedrooms}</div>
              <div className="text-sm text-gray-600">Bedrooms</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <div className="flex items-center justify-center mb-2">
                <svg className="w-8 h-8 text-gray-700" fill="currentColor" viewBox="0 0 512 512">
                  <path d="M96 77.3c0-7.3 5.9-13.3 13.3-13.3c3.5 0 6.9 1.4 9.4 3.9l14.9 14.9C130 91.8 128 101.7 128 112c0 19.9 7.2 38 19.2 52c-5.3 9.2-4 21.1 3.8 29c9.4 9.4 24.6 9.4 33.9 0L289 89c9.4-9.4 9.4-24.6 0-33.9c-7.9-7.9-19.8-9.1-29-3.8C246 39.2 227.9 32 208 32c-10.3 0-20.2 2-29.2 5.5L163.9 22.6C149.4 8.1 129.7 0 109.3 0C66.6 0 32 34.6 32 77.3V256c-17.7 0-32 14.3-32 32s14.3 32 32 32H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H96V77.3zM32 352v16c0 28.4 12.4 54 32 71.6V480c0 17.7 14.3 32 32 32s32-14.3 32-32V464H384v16c0 17.7 14.3 32 32 32s32-14.3 32-32V439.6c19.6-17.6 32-43.1 32-71.6V352H32z"/>
                </svg>
              </div>
              <div className="text-2xl font-bold text-gray-900">{property.bathrooms}</div>
              <div className="text-sm text-gray-600">Bathrooms</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <div className="flex items-center justify-center mb-2">
                <svg className="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </div>
              <div className="text-2xl font-bold text-gray-900">{property.area_sqft}</div>
              <div className="text-sm text-gray-600">Square Feet</div>
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Description</h2>
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">{property.description || 'No description provided.'}</p>
          </div>

          {/* Amenities Section */}
          {property.amenities && property.amenities.length > 0 && (
            <div className="mb-6 border-t pt-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">What this place offers</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(showAllAmenities ? property.amenities : property.amenities.slice(0, 6)).map((amenity, index) => {
                  // Get icon for each amenity
                  const getAmenityIcon = () => {
                    switch(amenity) {
                      case 'Kitchen':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 0 0 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z"/>
                          </svg>
                        );
                      case 'Wifi':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                          </svg>
                        );
                      case 'Pool':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 576 512">
                            <path d="M309.5 178.4L447.9 297c1.6.9 3.2 2.7 4.6 4.6 1.4 1.9 2.6 4.3 3.7 6.9l2.9 6.8c.8 1.9.9 3.8.3 5.6-.6 1.8-1.7 3.5-3.5 4.6-3.5 2.3-6.9 3.5-10.4 3.5-2.3 0-4.6-.6-6.9-1.7l-19.3-9.6c-9.2-4.6-19.3-6.9-30.4-6.9-11.1 0-21.1 2.3-30.4 6.9l-19.3 9.6c-2.3 1.2-4.6 1.7-6.9 1.7-3.5 0-6.9-1.2-10.4-3.5-1.7-1.2-2.9-2.9-3.5-4.6-.6-1.7-.6-3.7.3-5.6l2.9-6.8c1.2-2.6 2.3-5 3.7-6.9 1.4-1.9 2.9-3.7 4.6-4.6l138.4-118.5c2.3-2.3 2.9-5 2.3-8.1-.6-3.2-2.3-5.6-5.6-7.5L309.5 178.4zM224 96c26.5 0 48-21.5 48-48S250.5 0 224 0s-48 21.5-48 48 21.5 48 48 48zm-12.2 88.3l-59.1 59.1c-3 3-7.1 4.7-11.3 4.7H80c-8.8 0-16-7.2-16-16s7.2-16 16-16h55.4l46.5-46.5c7.9-7.9 18.7-12.4 29.9-12.4s22 4.5 29.9 12.4l33.6 33.6c44.9 44.9 117.4 44.9 162.3 0l82.7-82.7c6.2-6.2 16.4-6.2 22.6 0s6.2 16.4 0 22.6l-82.7 82.7c-57.1 57.1-149.3 57.1-206.3 0l-33.6-33.6c-1.5-1.5-3.5-2.3-5.6-2.3s-4.1.8-5.6 2.3zM27.2 377.1c-11 7.4-25.9 4.4-33.3-6.7s-4.4-25.9 6.7-33.3l19.3-13c11.6-7.7 25.1-11.6 38.6-11.6H192c35.3 0 64 28.7 64 64v8c0 13.3-10.7 24-24 24H27.2zm521.6 0c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3l-19.3-13c-11.6-7.7-25.1-11.6-38.6-11.6H384c-35.3 0-64 28.7-64 64v8c0 13.3 10.7 24 24 24h204.8z"/>
                          </svg>
                        );
                      case 'TV':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        );
                      case 'Elevator':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 512 512">
                            <path d="M142.9 142.9c6.2-6.2 16.4-6.2 22.6 0L256 233.4l90.5-90.5c6.2-6.2 16.4-6.2 22.6 0s6.2 16.4 0 22.6l-101.5 101.5c-6.2 6.2-16.4 6.2-22.6 0L143.5 165.5c-6.2-6.2-6.2-16.4 0-22.6zm0 192c-6.2-6.2-6.2-16.4 0-22.6L244.5 210.7c6.2-6.2 16.4-6.2 22.6 0L368.5 312.3c6.2 6.2 6.2 16.4 0 22.6s-16.4 6.2-22.6 0L256 244.4l-90.5 90.5c-6.2 6.2-16.4 6.2-22.6 0zM64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64H64z"/>
                          </svg>
                        );
                      case 'Air conditioning':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 576 512">
                            <path d="M288 0c17.7 0 32 14.3 32 32V96c0 17.7-14.3 32-32 32s-32-14.3-32-32V32c0-17.7 14.3-32 32-32zM209.6 5.4c14.1-9.3 33.1-5.5 42.4 8.6l32 48c9.3 14.1 5.5 33.1-8.6 42.4s-33.1 5.5-42.4-8.6l-32-48C191.7 33.7 195.5 14.7 209.6 5.4zm156.8 0c14.1 9.3 17.9 28.4 8.6 42.4l-32 48c-9.3 14.1-28.4 17.9-42.4 8.6s-17.9-28.4-8.6-42.4l32-48c9.3-14.1 28.4-17.9 42.4-8.6zM0 224c0-17.7 14.3-32 32-32H96c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zm480 0c0-17.7 14.3-32 32-32h64c17.7 0 32 14.3 32 32s-14.3 32-32 32H512c-17.7 0-32-14.3-32-32zM133.2 397.9c9.3-14.1 28.4-17.9 42.4-8.6l48 32c14.1 9.3 17.9 28.4 8.6 42.4s-28.4 17.9-42.4 8.6l-48-32c-14.1-9.3-17.9-28.4-8.6-42.4zm309.6 0c9.3 14.1 5.5 33.1-8.6 42.4l-48 32c-14.1 9.3-33.1 5.5-42.4-8.6s-5.5-33.1 8.6-42.4l48-32c14.1-9.3 33.1-5.5 42.4 8.6zM288 384c-17.7 0-32 14.3-32 32v64c0 17.7 14.3 32 32 32s32-14.3 32-32V416c0-17.7-14.3-32-32-32z"/>
                          </svg>
                        );
                      case 'Heating':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 448 512">
                            <path d="M159.3 5.4c7.8-7.3 19.9-7.2 27.7 .1c27.6 25.9 53.5 53.8 77.7 84c11-14.4 23.5-30.1 37-42.9c7.9-7.4 20.1-7.4 28 .1c34.6 33 63.9 76.6 84.5 118c20.3 40.8 33.8 82.5 33.8 111.9C448 404.2 348.2 512 224 512C98.4 512 0 404.1 0 276.5c0-38.4 17.8-85.3 45.4-131.7C73.3 97.7 112.7 48.6 159.3 5.4zM225.7 416c25.3 0 47.7-7 68.8-21c42.1-29.4 53.4-88.2 28.1-134.4c-4.5-9-16-9.6-22.5-2l-25.2 29.3c-6.6 7.6-18.5 7.4-24.7-.5c-16.5-21-46-58.5-62.8-79.8c-6.3-8-18.3-8.1-24.7-.1c-33.8 42.5-50.8 69.3-50.8 99.4C112 375.4 162.6 416 225.7 416z"/>
                          </svg>
                        );
                      case 'Washing machine':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 448 512">
                            <path d="M96 0C60.7 0 32 28.7 32 64V448c0 35.3 28.7 64 64 64H352c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64H96zM128 96h96c8.8 0 16 7.2 16 16s-7.2 16-16 16H128c-8.8 0-16-7.2-16-16s7.2-16 16-16zM224 192a96 96 0 1 1 0 192 96 96 0 1 1 0-192zm-32 96c0-17.7 14.3-32 32-32c8.8 0 16 7.2 16 16s-7.2 16-16 16c0 8.8-7.2 16-16 16s-16-7.2-16-16z"/>
                          </svg>
                        );
                      case 'Dryer':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 448 512">
                            <path d="M50.2 375.6c2.3 8.5 11.1 13.6 19.6 11.3l216.4-58c8.5-2.3 13.6-11.1 11.3-19.6l-49.7-185.5c-2.3-8.5-11.1-13.6-19.6-11.3L11.8 171.6c-8.5 2.3-13.6 11.1-11.3 19.6l49.7 185.5zM217.6 0h93.6C408 0 480 72 480 168.2c0 72.2-43.8 137.5-110.7 164.7L222.8 384H272c8.8 0 16 7.2 16 16s-7.2 16-16 16H210.3l-64.6 17.3c-8.5 2.3-17.4-2.8-19.6-11.3L76.4 287.1c-2.3-8.5 2.8-17.4 11.3-19.6l64.6-17.3V192c0-8.8 7.2-16 16-16s16 7.2 16 16v51.6l59.7-16V168.2C243.9 75.4 293.3 26 368.2 26c8.8 0 16 7.2 16 16s-7.2 16-16 16c-57.3 0-101.6 37.1-101.6 110.2v80.7l59.7-16c54.8-14.7 92.1-64.8 92.1-118.7c0-79.4-64.8-136.2-127.2-136.2H217.6z"/>
                          </svg>
                        );
                      case 'Parking':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 448 512">
                            <path d="M64 32C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H64zM192 256h48c17.7 0 32-14.3 32-32s-14.3-32-32-32H192v64zm48 64H192v32c0 17.7-14.3 32-32 32s-32-14.3-32-32V288 168c0-22.1 17.9-40 40-40h72c53 0 96 43 96 96s-43 96-96 96z"/>
                          </svg>
                        );
                      case 'Gym':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 640 512">
                            <path d="M96 64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32V224v64V448c0 17.7-14.3 32-32 32H128c-17.7 0-32-14.3-32-32V384H64c-17.7 0-32-14.3-32-32V288c-17.7 0-32-14.3-32-32s14.3-32 32-32V160c0-17.7 14.3-32 32-32H96V64zm448 0v64h32c17.7 0 32 14.3 32 32v64c17.7 0 32 14.3 32 32s-14.3 32-32 32v64c0 17.7-14.3 32-32 32H544v64c0 17.7-14.3 32-32 32H480c-17.7 0-32-14.3-32-32V288 224 64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32zM416 224v64H224V224H416z"/>
                          </svg>
                        );
                      case 'Security':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        );
                      case 'Balcony':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 640 512">
                            <path d="M0 488V171.3c0-26.2 15.9-49.7 40.2-59.4L308.1 4.8c7.6-3.1 16.1-3.1 23.8 0L599.8 111.9c24.3 9.7 40.2 33.3 40.2 59.4V488c0 13.3-10.7 24-24 24s-24-10.7-24-24V184c0-5-1.5-9.8-4.3-13.9L320 49 52.3 170.1c-2.8 4.1-4.3 8.9-4.3 13.9V488c0 13.3-10.7 24-24 24s-24-10.7-24-24zM96 256c0-8.8 7.2-16 16-16H528c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16zm16 80h80v96c0 8.8 7.2 16 16 16s16-7.2 16-16V336h64v96c0 8.8 7.2 16 16 16s16-7.2 16-16V336h64v96c0 8.8 7.2 16 16 16s16-7.2 16-16V336h80c8.8 0 16-7.2 16-16s-7.2-16-16-16H432 368 304 240 176 112c-8.8 0-16 7.2-16 16s7.2 16 16 16z"/>
                          </svg>
                        );
                      case 'Garden':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 512 512">
                            <path d="M512 32c0 113.6-84.6 207.5-194.2 222c-7.1-53.4-30.6-101.6-65.3-139.3C290.8 46.3 364 0 448 0h32c17.7 0 32 14.3 32 32zM0 96C0 78.3 14.3 64 32 64H64c123.7 0 224 100.3 224 224v32V480c0 17.7-14.3 32-32 32s-32-14.3-32-32V320C100.3 320 0 219.7 0 96z"/>
                          </svg>
                        );
                      case 'Pet friendly':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 512 512">
                            <path d="M226.5 92.9c14.3 42.9-.3 86.2-32.6 96.8s-70.1-15.6-84.4-58.5s.3-86.2 32.6-96.8s70.1 15.6 84.4 58.5zM100.4 198.6c18.9 32.4 14.3 70.1-10.2 84.1s-59.7-.9-78.5-33.3S-2.7 179.3 21.8 165.3s59.7 .9 78.5 33.3zM69.2 401.2C121.6 259.9 214.7 224 256 224s134.4 35.9 186.8 177.2c3.6 9.7 5.2 20.1 5.2 30.5v1.6c0 25.8-20.9 46.7-46.7 46.7c-11.5 0-22.9-1.4-34-4.2l-88-22c-15.3-3.8-31.3-3.8-46.6 0l-88 22c-11.1 2.8-22.5 4.2-34 4.2C84.9 480 64 459.1 64 433.3v-1.6c0-10.4 1.6-20.8 5.2-30.5zM421.8 282.7c-24.5-14-29.1-51.7-10.2-84.1s54-47.3 78.5-33.3s29.1 51.7 10.2 84.1s-54 47.3-78.5 33.3zM310.1 189.7c-32.3-10.6-46.9-53.9-32.6-96.8s52.1-69.1 84.4-58.5s46.9 53.9 32.6 96.8s-52.1 69.1-84.4 58.5z"/>
                          </svg>
                        );
                      case 'Furnished':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 640 512">
                            <path d="M64 160C64 89.3 121.3 32 192 32H448c70.7 0 128 57.3 128 128v33.6c-36.5 7.4-64 39.7-64 78.4v48H128V272c0-38.7-27.5-71-64-78.4V160zM544 272c0-20.9 13.4-38.7 32-45.3c5-1.8 10.4-2.7 16-2.7c26.5 0 48 21.5 48 48V448c0 17.7-14.3 32-32 32H576c-17.7 0-32-14.3-32-32H96c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V272c0-26.5 21.5-48 48-48c5.6 0 11 1 16 2.7c18.6 6.6 32 24.4 32 45.3v48 32h32H512h32V320 272z"/>
                          </svg>
                        );
                      case 'Carbon monoxide alarm':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                        );
                      case 'Smoke alarm':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 640 512">
                            <path d="M288 368a80 80 0 1 1 0 160 80 80 0 1 1 0-160zm0 208A128 128 0 1 0 288 320a128 128 0 1 0 0 256zm24-168c0-13.3-10.7-24-24-24s-24 10.7-24 24v56c0 13.3 10.7 24 24 24s24-10.7 24-24V408zM96.6 227.9c7.9-18.3 20.8-34.5 37.1-46.5c-21.8-28.8-34.7-64.8-34.7-103.8C99 34.6 133.6 0 175.6 0c42 0 76.6 34.6 76.6 76.6c0 38.9-12.9 74.9-34.7 103.8c16.3 12 29.2 28.2 37.1 46.5C287.2 188.8 307.9 160 336 160c35.3 0 64 28.7 64 64s-28.7 64-64 64c-28.1 0-51.8-18.1-60.4-43.3c-11.7 20.7-28.7 37.5-49.3 48.8c0 .2 0 .4 0 .5c0 35.3-28.7 64-64 64s-64-28.7-64-64c0-.2 0-.4 0-.5c-20.6-11.3-37.6-28.1-49.3-48.8C40.3 269.9 16.6 288 0 288c0-35.3 28.7-64 64-64s64 28.7 64 64c0 0-28.1 18.1-31.4-60.1z"/>
                          </svg>
                        );
                      case 'Fire extinguisher':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 512 512">
                            <path d="M500.3 7.3C507.7 13.3 512 22.4 512 32v96c0 9.6-4.3 18.7-11.7 24.7s-17.2 8.5-26.6 6.6l-160-32C301.5 124.9 292 115.7 289 104H224v34.8c37.8 18 64 56.5 64 101.2V384H64V240c0-44.7 26.2-83.2 64-101.2V110c-36.3 11.1-66.8 34.9-84.1 67.2L34.6 167C28.1 155.1 21.9 143 16.2 130.5L5.8 111C2.4 104 1.2 96.1 2.7 88.5S7.6 73.9 13.6 68.2l48-48C67.2 14.6 75.7 10.5 84.9 9.3S103 9.6 111 15.4l44.9 32.7c12.4 9.1 25.4 17.2 38.8 24.3C199.4 47.5 220.4 32 244.7 32H288c17.7 0 32 14.3 32 32v32h64c0-11.7 4.5-22.7 12.7-30.9L408.9 53c7.4-7.4 17.4-11.5 27.9-11.5c2.4 0 4.8 .2 7.1 .7l88 16c10.4 1.9 19.5 8.2 25.4 17.1zm-363.6 321l36-48H179.3l-36 48h-6.6zM568 368H712c13.3 0 24 10.7 24 24s-10.7 24-24 24H568c-13.3 0-24-10.7-24-24s10.7-24 24-24z"/>
                          </svg>
                        );
                      case 'First aid kit':
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 576 512">
                            <path d="M64 32C28.7 32 0 60.7 0 96v320c0 35.3 28.7 64 64 64H512c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H64zm232 152c13.3 0 24 10.7 24 24v48h48c13.3 0 24 10.7 24 24s-10.7 24-24 24H320v48c0 13.3-10.7 24-24 24s-24-10.7-24-24V304H224c-13.3 0-24-10.7-24-24s10.7-24 24-24h48V208c0-13.3 10.7-24 24-24z"/>
                          </svg>
                        );
                      default:
                        return (
                          <svg className="w-6 h-6 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        );
                    }
                  };

                  return (
                    <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      {getAmenityIcon()}
                      <span className="text-sm text-gray-800">{amenity}</span>
                    </div>
                  );
                })}
              </div>
              
              {property.amenities.length > 6 && (
                <button
                  onClick={() => setShowAllAmenities(!showAllAmenities)}
                  className="mt-4 flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-700 transition-colors"
                >
                  {showAllAmenities ? (
                    <>
                      <span>Show less</span>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </>
                  ) : (
                    <>
                      <span>Show all {property.amenities.length} amenities</span>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  )
}
