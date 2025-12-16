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
      .maybeSingle()
    
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
      .maybeSingle()
    
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
    
    // Check if tenant has an active or pending application
    // First check if there's an active occupancy
    const { data: activeOccupancy } = await supabase
      .from('tenant_occupancies')
      .select('id, status')
      .eq('property_id', id)
      .eq('tenant_id', session.user.id)
      .in('status', ['active', 'pending_end'])
      .maybeSingle()

    if (activeOccupancy) {
      setMessage('You are currently occupying this property or have a pending end request. You cannot apply again until your occupancy ends.')
      setSubmitting(false)
      return
    }

    // Check if tenant has a pending application (not accepted ones from previous occupancies)
    const { data: pendingApp } = await supabase
      .from('applications')
      .select('id, status')
      .eq('property_id', id)
      .eq('tenant', session.user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingApp) {
      setMessage('You already have a pending application for this property. Please wait for the landlord to review it.')
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
          profile?.first_name ? `${profile.first_name} ${profile.last_name}` : 'A tenant'
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
                  {landlordProfile?.first_name 
                  ? landlordProfile.first_name.charAt(0).toUpperCase() 
                  : 'L'}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{landlordProfile?.first_name ? `${landlordProfile.first_name} ${landlordProfile.last_name}` : 'Property Owner'}</p>
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
            <div className="flex items-start gap-2 text-gray-600 mb-4">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="text-sm">
                {property.building_no && (
                  <div className="font-medium text-gray-800">{property.building_no}</div>
                )}
                {property.street && (
                  <div>{property.street}, {property.address} {property.city} {property.zip}</div>
                )}
                {property.owner_phone && (
                  <div className="mt-2 flex items-center gap-1">
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <a href={`tel:${property.owner_phone}`} className="text-gray-600 hover:text-gray-800 transition-colors">
                      {property.owner_phone}
                    </a>
                  </div>
                )}
                {property.owner_email && (
                  <div className="mt-1 flex items-center gap-1">
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <a href={`mailto:${property.owner_email}`} className="text-gray-600 hover:text-gray-800 transition-colors">
                      {property.owner_email}
                    </a>
                  </div>
                )}
                {property.location_link && (
                  <a 
                    href={property.location_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    View on Google Maps
                  </a>
                )}
              </div>
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
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Amenities</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-0 gap-y-1">
                {(showAllAmenities ? property.amenities : property.amenities.slice(0, 6)).map((amenity, index) => (
                  <div key={index} className="flex items-center gap-2 text-gray-700">
                    <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm">{amenity}</span>
                  </div>
                ))}
              </div>
              {property.amenities.length > 6 && (
                <button
                  onClick={() => setShowAllAmenities(!showAllAmenities)}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                >
                  {showAllAmenities ? 'Show less' : `Show all ${property.amenities.length} amenities`}
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
