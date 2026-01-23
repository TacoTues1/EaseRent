import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { createNotification, NotificationTemplates } from '../../lib/notifications'
import AuthModal from '../../components/AuthModal'
import toast from 'react-hot-toast'

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
  const [reviews, setReviews] = useState([]) 

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
    if (id) {
        loadProperty()
        loadReviews() 
    }
  }, [id])

  async function loadProperty() {
    setLoading(true)
    const { data: propertyData, error: propertyError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .maybeSingle()
    
    if (propertyError) {
      console.error('Error loading property:', propertyError)
      setLoading(false)
      return
    }

    if (propertyData) {
      setProperty(propertyData)
      if (propertyData.landlord) {
        const { data: landlordData, error: landlordError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', propertyData.landlord)
          .maybeSingle()
          
        if (!landlordError && landlordData) {
          setLandlordProfile(landlordData)
        }
      }
    }
    setLoading(false)
  }

  async function loadReviews() {
    const { data, error } = await supabase
      .from('reviews')
      .select(`
        *,
        tenant:profiles(first_name, last_name)
      `)
      .eq('property_id', id)
      .order('created_at', { ascending: false })
    
    if (data) setReviews(data)
  }

  // Helper to extract coordinates from Google Maps links
  const extractCoordinates = (link) => {
    if (!link) return null;
    const atMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const qMatch = link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    const placeMatch = link.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    
    const match = atMatch || qMatch || placeMatch;
    if (match) {
      return { lat: match[1], lng: match[2] };
    }
    return null;
  };

  const getMapEmbedUrl = () => {
    const coords = extractCoordinates(property?.location_link)
    if (coords) {
      return `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=17&output=embed`
    }
    const address = `${property?.address || ''}, ${property?.city || ''} ${property?.zip || ''}`
    return `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=17&output=embed`
  }

  // --- NEW: Handle internal navigation to getDirections page ---
  const handleInternalDirections = (e) => {
    e.preventDefault();
    
    // 1. Try to get explicit coordinates from the link
    const coords = extractCoordinates(property?.location_link);
    
    // 2. Build address string
    const fullAddr = `${property.address}, ${property.city}`;  
    // 3. Navigate
    router.push({
      pathname: '/getDirections',
      query: { 
        to: fullAddr,
        // Pass coordinates if found, otherwise undefined (getDirections will Geocode the address)
        lat: coords ? coords.lat : undefined,
        lng: coords ? coords.lng : undefined,
        auto: 'true'
      }
    });
  };

  async function handleApply(e) {
    e.preventDefault()
    if (!session) {
      setShowAuthModal(true)
      return
    }

    setSubmitting(true)
    
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

    const { data: pendingApp } = await supabase
      .from('applications')
      .select('id, status')
      .eq('property_id', id)
      .eq('tenant', session.user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingApp) {
      setMessage('You already have a pending inquiry for this property. Please wait for the landlord to review it.')
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
      setMessage('Error submitting inquiry: ' + error.message)
    } else {
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
      await sendNewApplicationNotification(landlordPhone, {
      applicantName: user.first_name,
      propertyName: property.title
      });
      setMessage('Inquiry submitted successfully!')
      setApplicationMessage('')
    }
    setSubmitting(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-gray-500">Loading...</div>
  if (!property) return <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">Property not found</div>

  const propertyImages = property.images && property.images.length > 0 
    ? property.images 
    : ['https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop']

  const isOwner = profile?.id === property.landlord
  const isLandlord = profile?.role === 'landlord'

  const fullAddress = `${property.address}, ${property.city} ${property.zip || ''}`

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#FAFAFA] p-4 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-start justify-between mb-5 gap-4">
           <div className="flex-1">
             <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{property.title}</h1>
                <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border flex items-center gap-1.5 w-fit ${
                    property.status === 'available' 
                      ? 'bg-green-50 text-green-700 border-green-100' 
                      : property.status === 'occupied'
                      ? 'bg-blue-50 text-blue-700 border-blue-100'
                      : 'bg-red-50 text-red-700 border-red-100'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      property.status === 'available' ? 'bg-green-500' : property.status === 'occupied' ? 'bg-blue-500' : 'bg-red-500'
                    }`}></span>
                    {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
                </span>
             </div>
           </div>

           <div className="flex flex-col items-start md:items-end">
              <div className="flex items-baseline gap-1">
                 <span className="text-3xl font-bold text-black">₱{Number(property.price).toLocaleString()}</span>
                 <span className="text-gray-500 font-medium text-sm">/mo</span>
              </div>
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          
          {/* Left Column - Gallery & Details */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            {/* Gallery */}
            <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 h-[350px] md:h-[420px] relative group">
                <img 
                  src={propertyImages[currentImageIndex]} 
                  alt={property.title}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop' }}
                />
                {propertyImages.length > 1 && (
                  <>
                    <button onClick={() => setCurrentImageIndex((currentImageIndex - 1 + propertyImages.length) % propertyImages.length)} className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 text-black p-2 rounded-full shadow-sm cursor-pointer border border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                    <button onClick={() => setCurrentImageIndex((currentImageIndex + 1) % propertyImages.length)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 text-black p-2 rounded-full shadow-sm cursor-pointer border border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">{propertyImages.map((_, index) => (<button key={index} onClick={() => setCurrentImageIndex(index)} className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${index === currentImageIndex ? 'bg-white w-4' : 'bg-white/60'}`}/>))}</div>
                  </>
                )}
            </div>

             {/* Specs & Description */}
             <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-8 md:gap-12 border-b border-gray-100 pb-6 mb-6 overflow-x-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-700"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg></div>
                        <div><p className="text-xl font-bold text-gray-900 leading-none">{property.bedrooms}</p><p className="text-xs text-gray-500 font-medium">Bedrooms</p></div>
                    </div>
                    <div className="w-px h-8 bg-gray-100"></div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-700"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></div>
                        <div><p className="text-xl font-bold text-gray-900 leading-none">{property.bathrooms}</p><p className="text-xs text-gray-500 font-medium">Bathrooms</p></div>
                    </div>
                    <div className="w-px h-8 bg-gray-100"></div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-700"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></div>
                        <div><p className="text-xl font-bold text-gray-900 leading-none">{property.area_sqft}</p><p className="text-xs text-gray-500 font-medium">Sq. Ft.</p></div>
                    </div>
                </div>
                <div className="mb-8">
                   <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">About this property</h3>
                   <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{property.description || 'No description provided.'}</p>
                </div>
                {property.amenities && property.amenities.length > 0 && (
                  <div className="pt-6 border-t border-gray-100">
                    <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Amenities</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {(showAllAmenities ? property.amenities : property.amenities.slice(0, 9)).map((amenity, index) => (
                         <div key={index} className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100">
                           <div className="w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                                <svg className="w-2.5 h-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                           </div>
                           <span className="text-xs font-semibold text-gray-700">{amenity}</span>
                         </div>
                      ))}
                    </div>
                     {property.amenities.length > 9 && (
                      <button onClick={() => setShowAllAmenities(!showAllAmenities)} className="mt-4 text-xs font-bold text-black border-b border-black w-max cursor-pointer hover:text-gray-700 hover:border-gray-700 transition-colors">
                        {showAllAmenities ? 'Show less' : `Show all ${property.amenities.length} amenities`}
                      </button>
                    )}
                  </div>
                )}
             </div>
          </div>

          {/* Right Column - Sidebar */}
          <div className="flex flex-col gap-4">

            {/* Mini Map / Location Card */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Google Maps Embed - Accurate Location */}
                <div className="w-full h-80 bg-gray-50 rounded-lg mb-4 overflow-hidden relative border border-gray-200">
                   <iframe 
                      width="100%" 
                      height="100%" 
                      frameBorder="0" 
                      style={{ border: 0 }}
                      src={getMapEmbedUrl()}
                      className="absolute inset-0"
                      title="Property Location"
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                   ></iframe>
                </div>
                <div className="flex items-center gap-2 mt-3">
                   <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-600"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg></div>
                   
                   {/* UPDATED: Get Directions Button navigates to internal page */}
                   <button 
                     onClick={handleInternalDirections}
                     className="text-xs text-gray-600 hover:text-black font-bold uppercase tracking-wider transition-colors cursor-pointer border-b border-transparent hover:border-black"
                   >
                     Get Directions
                   </button>
                </div>
            </div>
             
             {/* Main Action Card */}
             <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-5 pb-5 border-b border-gray-50">
                    <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {landlordProfile?.first_name ? landlordProfile.first_name.charAt(0).toUpperCase() : 'L'}
                    </div>
                    <div className="flex-1 overflow-hidden">
                       <p className="font-bold text-gray-900 text-sm truncate">{landlordProfile?.first_name ? `${landlordProfile.first_name} ${landlordProfile.last_name}` : 'Property Owner'}</p>
                       <p className="text-xs text-gray-500">Posted By</p>
                    </div>
                </div>
                {isOwner ? (
                  <div className="flex flex-col gap-3">
                    <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-lg border border-blue-100">You own this property.</div>
                    <button onClick={() => router.push(`/properties/edit/${property.id}`)} className="w-full py-2.5 px-4 bg-black text-white text-sm font-bold rounded-lg cursor-pointer hover:bg-gray-900 transition-colors">Edit Property</button>
                  </div>
                ) : isLandlord ? (
                   <div className="p-3 bg-gray-50 text-gray-600 text-xs rounded-lg border border-gray-200">Landlords cannot submit Inquiries.</div>
                ) : (
                  <>
                     {hasActiveOccupancy ? (
                       <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
                          <p className="font-bold text-yellow-800 text-xs mb-1">Active Occupancy</p>
                          <p className="text-xs text-yellow-700 leading-relaxed mb-2">Assigned to <strong>{occupiedPropertyTitle}</strong>.</p>
                          <button onClick={() => router.push('/dashboard')} className="text-xs font-bold text-yellow-800 underline cursor-pointer">Dashboard</button>
                       </div>
                     ) : property.status !== 'available' ? (
                        <div className="p-3 bg-gray-50 text-gray-500 text-xs font-medium rounded-lg border border-gray-200 text-center">Not accepting Inquiries.</div>
                     ) : (
                        <div className="flex flex-col gap-3">
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1.5">Message to Owner</label>
                              <textarea className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:bg-white focus:border-black outline-none resize-none h-24" value={applicationMessage} onChange={e => setApplicationMessage(e.target.value)} placeholder="I'm interested..." />
                           </div>
                           <div>
                             <label className="flex items-start gap-2 cursor-pointer group">
                                <div className="relative flex items-center pt-0.5">
                                  <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="peer h-3.5 w-3.5 cursor-pointer appearance-none rounded border border-gray-300 checked:bg-black checked:border-black transition-all" />
                                  <svg className="absolute w-2 h-2 pointer-events-none hidden peer-checked:block text-white left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                </div>
                                <span className="text-[10px] text-gray-500 leading-snug">I agree to <Link href={`/terms?propertyId=${property.id}`} target="_blank" className="text-black font-bold underline">Terms & Conditions</Link>.</span>
                             </label>
                           </div>
                           {message && (<div className={`p-2 rounded text-[10px] font-medium ${message.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{message}</div>)}
                           <button onClick={handleApply} disabled={submitting || !termsAccepted} className={`w-full py-2.5 px-4 rounded-lg text-sm font-bold shadow-sm transition-all ${termsAccepted ? 'bg-black text-white cursor-pointer hover:shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>{submitting ? 'Sending...' : 'Submit Inquiry'}</button>
                        </div>
                     )}
                  </>
                )}
             </div>

             {/* Contact Details */}
             {(property.owner_phone || property.owner_email) && (
               <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-xs">
                  <h3 className="font-bold text-gray-900 mb-3">Contact Details of Landlord</h3>
                  <div className="flex flex-col gap-2.5">
                     <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-600"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
                        <span className="text-gray-600 font-medium">{fullAddress}</span>
                     </div>
                     {property.owner_phone && (
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-600"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg></div>
                           <a href={`tel:${property.owner_phone}`} className="text-gray-600 hover:text-black font-medium transition-colors cursor-pointer">{property.owner_phone}</a>
                        </div>
                     )}
                     {property.owner_email && (
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-600"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></div>
                           <a href={`mailto:${property.owner_email}`} className="text-gray-600 hover:text-black font-medium transition-colors cursor-pointer truncate">{property.owner_email}</a>
                        </div>
                     )}
                  </div>
               </div>
             )}

             {/* Reviews Section */}
             <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-xs">
                <div className="flex items-center justify-between mb-4">
                   <h3 className="font-bold text-gray-900">Reviews ({reviews.length})</h3>
                   <div className="flex items-center gap-1 text-yellow-500 font-bold">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                      {reviews.length > 0 
                        ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1) 
                        : '0.0'
                      }
                   </div>
                </div>
                
                {reviews.length === 0 ? (
                  <p className="text-gray-400 italic text-center py-2">No reviews yet.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {reviews.map((review, i) => (
                      <div key={i} className="pb-4 border-b border-gray-50 last:border-0 last:pb-0">
                         <div className="flex justify-between items-start mb-1">
                            <div>
                               <p className="font-bold text-gray-800 flex items-center gap-2">
                                  {review.tenant?.first_name} {review.tenant?.last_name}
                                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] uppercase font-bold tracking-wide">
                                    Previous Renter
                                  </span>
                               </p>
                               <div className="flex text-yellow-400 text-[10px] mt-0.5">
                                  {[...Array(5)].map((_, i) => (
                                    <svg key={i} className={`w-3 h-3 ${i < review.rating ? 'fill-current' : 'text-gray-200 fill-current'}`} viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                                  ))}
                               </div>
                            </div>
                            <span className="text-[10px] text-gray-400">{new Date(review.created_at).toLocaleDateString()}</span>
                         </div>
                         <p className="text-gray-600 leading-relaxed mt-1.5">{review.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
             </div>

          </div>
        </div>
      </div>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  )
}