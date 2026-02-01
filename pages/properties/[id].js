import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { createNotification } from '../../lib/notifications'
import AuthModal from '../../components/AuthModal'
import { showToast } from 'nextjs-toast-notify' // Changed to match your bookings.js

export default function PropertyDetail() {
  const router = useRouter()
  const { id } = router.query
  const [property, setProperty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [landlordProfile, setLandlordProfile] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [hasActiveOccupancy, setHasActiveOccupancy] = useState(false)
  const [occupiedPropertyTitle, setOccupiedPropertyTitle] = useState('')
  const [showAllAmenities, setShowAllAmenities] = useState(false)
  const [reviews, setReviews] = useState([])
  const [timeSlots, setTimeSlots] = useState([])
  const [showBookingOptions, setShowBookingOptions] = useState(false)
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [bookingNote, setBookingNote] = useState('')
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [showGalleryModal, setShowGalleryModal] = useState(false)
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

  // Load slots when property (and landlord) is available
  useEffect(() => {
    if (property?.landlord) {
      loadTimeSlots(property.landlord)
    }
  }, [property])

  async function loadTimeSlots(landlordId) {
    const { data } = await supabase
      .from('available_time_slots')
      .select('*')
      .eq('landlord_id', landlordId)
      .eq('is_booked', false)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })

    if (data) setTimeSlots(data)
  }

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
        tenant:profiles!tenant_id(first_name, last_name) 
      `)
      .eq('property_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error("Error loading reviews:", error)
    }

    if (data) setReviews(data)
  }

  const getMapEmbedUrl = () => {
    const coords = extractCoordinates(property?.location_link)
    if (coords) {
      return `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=17&output=embed`
    }
    const address = `${property?.address || ''}, ${property?.city || ''} ${property?.zip || ''}`
    return `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=17&output=embed`
  }

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

  const handleInternalDirections = (e) => {
    e.preventDefault();
    const coords = extractCoordinates(property?.location_link);
    const fullAddr = `${property.address}, ${property.city}`;
    router.push({
      pathname: '/getDirections',
      query: {
        to: fullAddr,
        lat: coords ? coords.lat : undefined,
        lng: coords ? coords.lng : undefined,
        auto: 'true'
      }
    });
  };

  // Open the booking form and hide the main button
  const handleOpenBooking = () => {
    if (!session) {
      showToast.info("You Need to Login First", {
        duration: 1000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
      router.push(`/login?redirect=${router.asPath}`)
      return
    }
    setShowBookingOptions(true)
  }

  // Cancel/Close the form
  const handleCancelBooking = () => {
    setShowBookingOptions(false)
    setSelectedSlotId('')
    setBookingNote('')
    setTermsAccepted(false)
  }

  // Triggered when confirming the booking
  async function handleConfirmBooking(e) {
    e.preventDefault()

    if (!selectedSlotId) {
      showToast.error("Please select a viewing time.", { duration: 4000, transition: "bounceIn" })
      return
    }

    setSubmitting(true)

    // 1. Check Active Occupancy
    const { data: activeOccupancy } = await supabase
      .from('tenant_occupancies')
      .select('id')
      .eq('property_id', id)
      .eq('tenant_id', session.user.id)
      .in('status', ['active', 'pending_end'])
      .maybeSingle()

    if (activeOccupancy) {
      showToast.error('You are currently occupying this property. You cannot book a viewing.', { duration: 4000, transition: "bounceIn" })
      setSubmitting(false)
      return
    }

    // 2. Check Existing Booking Limit (Strict 1 Active Booking)
    const { data: globalActive } = await supabase
      .from('bookings')
      .select('id')
      .eq('tenant', session.user.id)
      .in('status', ['pending', 'pending_approval', 'approved', 'accepted'])
      .maybeSingle()

    if (globalActive) {
      showToast.error('You already have an active viewing request. Please cancel it before booking another.', { duration: 4000, transition: "bounceIn" })
      setSubmitting(false)
      return
    }

    // 3. Get Selected Slot Data
    const slot = timeSlots.find(s => s.id === selectedSlotId)
    if (!slot) {
      showToast.error('Selected time slot is invalid.', { duration: 4000, transition: "bounceIn" })
      setSubmitting(false)
      return
    }

    // 4. Create Booking
    const { data: newBooking, error } = await supabase.from('bookings').insert({
      property_id: id,
      tenant: session.user.id,
      landlord: property.landlord,
      start_time: slot.start_time,
      end_time: slot.end_time,
      booking_date: slot.start_time,
      time_slot_id: slot.id,
      status: 'pending',
      notes: bookingNote || 'No message provided'
    }).select().single()

    if (error) {
      showToast.error('Error submitting booking: ' + error.message, { duration: 4000, transition: "bounceIn" })
    } else {
      // 5. Update Slot to Booked
      await supabase.from('available_time_slots').update({ is_booked: true }).eq('id', slot.id)

      // 6. Notify Landlord
      if (property.landlord) {
        await createNotification({
          recipient: property.landlord,
          actor: session.user.id,
          type: 'new_booking',
          message: `${profile?.first_name || 'A tenant'} requested a viewing for ${property.title}.`,
          link: '/bookings'
        })

        // Notify API
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'booking_new',
            recordId: newBooking.id,
            actorId: session.user.id
          })
        })
      }

      // 7. SMS Notification
      if (landlordProfile?.phone) {
        try {
          const smsMessage = `EaseRent Alert: New viewing request from ${profile?.first_name || 'A Tenant'} for "${property.title}". Log in to review.`
          await fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: landlordProfile.phone,
              message: smsMessage
            })
          })
        } catch (smsError) {
          console.error("Failed to send SMS:", smsError)
        }
      }

      showToast.success('Viewing request sent successfully!', { duration: 4000, transition: "bounceIn" })
      handleCancelBooking() // Reset form
      router.push('/bookings')
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
  const termsLink = property.terms_conditions && property.terms_conditions.startsWith('http')
    ? property.terms_conditions
    : '/terms';

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#FAFAFA] p-4 font-sans">
      <div className="max-w-6xl mx-auto">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-start justify-between mb-5 gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{property.title}</h1>
              <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border flex items-center gap-1.5 w-fit ${property.status === 'available'
                ? 'bg-green-50 text-green-700 border-green-100'
                : property.status === 'occupied'
                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                  : 'bg-red-50 text-red-700 border-red-100'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${property.status === 'available' ? 'bg-green-500' : property.status === 'occupied' ? 'bg-blue-500' : 'bg-red-500'
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
            {/* Gallery Collage */}
            <div className="rounded-xl overflow-hidden shadow-sm border border-gray-100 relative">
              {propertyImages.length === 1 ? (
                /* Single image layout */
                <div className="h-[350px] md:h-[420px] cursor-pointer" onClick={() => setShowGalleryModal(true)}>
                  <img
                    src={propertyImages[0]}
                    alt={property.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop' }}
                  />
                </div>
              ) : (
                /* Collage layout for multiple images */
                <div className="grid grid-cols-4 grid-rows-2 gap-1 h-[350px] md:h-[420px]">
                  {/* Main large image - takes up left 2/4 columns and both rows */}
                  <div
                    className="col-span-2 row-span-2 cursor-pointer overflow-hidden"
                    onClick={() => { setCurrentImageIndex(0); setShowGalleryModal(true); }}
                  >
                    <img
                      src={propertyImages[0]}
                      alt={property.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop' }}
                    />
                  </div>

                  {/* Top right images */}
                  {propertyImages.slice(1, 3).map((img, idx) => (
                    <div
                      key={idx}
                      className="cursor-pointer overflow-hidden"
                      onClick={() => { setCurrentImageIndex(idx + 1); setShowGalleryModal(true); }}
                    >
                      <img
                        src={img}
                        alt={`${property.title} ${idx + 2}`}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop' }}
                      />
                    </div>
                  ))}

                  {/* Bottom right images */}
                  {propertyImages.slice(3, 5).map((img, idx) => (
                    <div
                      key={idx}
                      className="relative cursor-pointer overflow-hidden"
                      onClick={() => { setCurrentImageIndex(idx + 3); setShowGalleryModal(true); }}
                    >
                      <img
                        src={img}
                        alt={`${property.title} ${idx + 4}`}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop' }}
                      />

                      {/* Show "View all" overlay on last visible image if there are more */}
                      {idx === 1 && propertyImages.length > 5 && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-white font-bold text-sm">+{propertyImages.length - 5} more</span>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Fill empty spots if less than 5 images */}
                  {propertyImages.length === 2 && (
                    <>
                      <div className="bg-gray-100" />
                      <div className="bg-gray-100" />
                    </>
                  )}
                  {propertyImages.length === 3 && (
                    <div className="bg-gray-100" />
                  )}
                  {propertyImages.length === 4 && (
                    <div className="bg-gray-100" />
                  )}
                </div>
              )}

              {/* Show all photos button */}
              {propertyImages.length > 1 && (
                <button
                  onClick={() => setShowGalleryModal(true)}
                  className="absolute bottom-4 right-4 bg-white hover:bg-gray-50 text-black text-xs font-bold px-4 py-2 rounded-lg shadow-md border border-gray-200 cursor-pointer flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  Show all photos
                </button>
              )}
            </div>

            {/* Specs & Description */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-8 md:gap-12 border-b border-gray-100 pb-6 mb-6 overflow-x-auto">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-700"><svg
                    className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
                  </svg></div>
                  <div><p className="text-xl font-bold text-gray-900 leading-none">{property.bedrooms}</p><p className="text-xs text-gray-500 font-medium">Bedrooms</p></div>
                </div>
                <div className="w-px h-8 bg-gray-100"></div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-700"><svg
                    className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" />
                  </svg></div>
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
                  <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Amenities</h3>
                  <div className="flex flex-wrap gap-2">
                    {(showAllAmenities ? property.amenities : property.amenities.slice(0, 8)).map((amenity, index) => (
                      <span
                        key={index}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>
                  {property.amenities.length > 8 && (
                    <button
                      onClick={() => setShowAllAmenities(!showAllAmenities)}
                      className="mt-3 text-xs font-bold text-black underline cursor-pointer hover:text-gray-600 transition-colors"
                    >
                      {showAllAmenities ? 'Show less' : `+${property.amenities.length - 8} more`}
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

                <button
                  onClick={handleInternalDirections}
                  className="text-xs text-gray-600 hover:text-black font-bold uppercase tracking-wider transition-colors cursor-pointer border-b border-transparent hover:border-black"
                >
                  Get Directions
                </button>
              </div>
            </div>

            {/* Booking Action Card (Updated with Message Field) */}
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
                <div className="p-3 bg-gray-50 text-gray-600 text-xs rounded-lg border border-gray-200">Landlords cannot book viewings.</div>
              ) : (
                <>
                  {hasActiveOccupancy ? (
                    <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
                      <p className="font-bold text-yellow-800 text-xs mb-1">Active Occupancy</p>
                      <p className="text-xs text-yellow-700 leading-relaxed mb-2">Assigned to <strong>{occupiedPropertyTitle}</strong>.</p>
                      <button onClick={() => router.push('/dashboard')} className="text-xs font-bold text-yellow-800 underline cursor-pointer">Dashboard</button>
                    </div>
                  ) : property.status !== 'available' ? (
                    <div className="p-3 bg-gray-50 text-gray-500 text-xs font-medium rounded-lg border border-gray-200 text-center">Not available for booking.</div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {/* Book Now Button (Shown only when options are hidden) */}
                      {!showBookingOptions && (
                        <button
                          onClick={handleOpenBooking}
                          className="w-full py-3.5 bg-black text-white text-sm font-bold rounded-xl shadow-lg shadow-gray-200 hover:bg-gray-900 hover:shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          Book Now
                        </button>
                      )}

                      {/* Dropdown & Form Section (Replaces Button) */}
                      {showBookingOptions && (
                        <div className="flex flex-col gap-4 animate-in slide-in-from-top-4 fade-in duration-500 bg-gray-50 p-4 rounded-xl border border-gray-100">

                          <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Select Schedule</label>
                            <button
                              onClick={handleCancelBooking}
                              className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-200 rounded-full transition-colors cursor-pointer"
                              title="Cancel"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>

                          {/* Date/Time Selection */}
                          <div>
                            {timeSlots.length > 0 ? (
                              <div className="relative">
                                <select
                                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none appearance-none cursor-pointer shadow-sm"
                                  value={selectedSlotId}
                                  onChange={(e) => setSelectedSlotId(e.target.value)}
                                >
                                  <option value="" disabled>-- Choose a date & time --</option>
                                  {timeSlots.map(slot => {
                                    const start = new Date(slot.start_time)
                                    return (
                                      <option key={slot.id} value={slot.id}>
                                        {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} • {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - {new Date(slot.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                      </option>
                                    )
                                  })}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-red-500 bg-white p-2 rounded border border-red-100 text-center">
                                No available viewing slots found.
                              </div>
                            )}
                          </div>

                          {/* Message Field (Restored) */}
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">Message (Optional)</label>
                            <textarea
                              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none resize-none h-20 shadow-sm"
                              value={bookingNote}
                              onChange={(e) => setBookingNote(e.target.value)}
                              placeholder="Any specific questions or requests?"
                            />
                          </div>

                          {/* Agreement Checkbox */}
                          <label className="flex items-start gap-3 cursor-pointer group bg-white p-2.5 rounded-lg border border-gray-200">
                            <div className="relative flex items-center pt-0.5">
                              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 checked:bg-black checked:border-black transition-all bg-white" />
                              <svg className="absolute w-2.5 h-2.5 pointer-events-none hidden peer-checked:block text-white left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <span className="text-[10px] text-gray-500 leading-snug">I agree to the
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault()
                                  // If it's a PDF URL, open modal. Otherwise (default), open new tab.
                                  if (termsLink.startsWith('http')) {
                                    setShowTermsModal(true)
                                  } else {
                                    window.open(termsLink, '_blank')
                                  }
                                }}
                                className="text-black font-bold underline hover:text-gray-700 ml-1 bg-transparent border-0 p-0 cursor-pointer inline"
                              >
                                Terms & Conditions
                              </button>.
                            </span>
                          </label>

                          {/* Confirm Button */}
                          <button
                            onClick={handleConfirmBooking}
                            disabled={submitting || !termsAccepted || !selectedSlotId}
                            className={`w-full py-3 px-4 rounded-xl text-sm font-bold shadow-sm transition-all ${termsAccepted && selectedSlotId ? 'bg-black text-white cursor-pointer hover:bg-gray-900 hover:shadow-md' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                          >
                            {submitting ? 'Confirming...' : 'Confirm Booking'}
                          </button>
                        </div>
                      )}

                      {/* Info Text */}
                      {!showBookingOptions && (
                        <p className="text-[10px] text-gray-400 text-center">
                          Click to view available dates and schedule a viewing.
                        </p>
                      )}
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
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
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
                              <svg key={i} className={`w-3 h-3 ${i < review.rating ? 'fill-current' : 'text-gray-200 fill-current'}`} viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
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
      </div >

      {showTermsModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowTermsModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b bg-white">
              <button
                onClick={() => setShowTermsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* PDF Viewer (Iframe) */}
            <div className="flex-1 bg-gray-50 relative">
              <iframe
                src={termsLink}
                className="w-full h-full"
                title="Terms PDF"
              />
            </div>
          </div>
        </div>
      )
      }
      {/* Gallery Modal */}
      {showGalleryModal && (
        <div className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center" onClick={() => setShowGalleryModal(false)}>
          {/* Close button */}
          <button
            onClick={() => setShowGalleryModal(false)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer z-10"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-4 text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
            {currentImageIndex + 1} / {propertyImages.length}
          </div>

          {/* Main image */}
          <div className="max-w-5xl max-h-[85vh] mx-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={propertyImages[currentImageIndex]}
              alt={`${property.title} ${currentImageIndex + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop' }}
            />
          </div>

          {/* Navigation arrows */}
          {propertyImages.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((currentImageIndex - 1 + propertyImages.length) % propertyImages.length); }}
                className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((currentImageIndex + 1) % propertyImages.length); }}
                className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          {/* Thumbnail strip */}
          {propertyImages.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 max-w-[90vw] overflow-x-auto p-2 bg-black/50 rounded-lg">
              {propertyImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(idx); }}
                  className={`w-16 h-12 flex-shrink-0 rounded overflow-hidden cursor-pointer transition-all ${idx === currentImageIndex ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100'}`}
                >
                  <img
                    src={img}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop' }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* --------------------------- */}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div >
  )
}
