import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import { createNotification } from '../../lib/notifications'
import AuthModal from '../../components/AuthModal'
import { showToast } from 'nextjs-toast-notify'
import Lottie from "lottie-react"
import loadingAnimation from "../../assets/loading.json"
import Footer from '@/components/Footer'

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
  const [showAllReviewsModal, setShowAllReviewsModal] = useState(false)
  const [showAllReviews, setShowAllReviews] = useState(false)
  const [reviewFilter, setReviewFilter] = useState('most_relevant')
  const locationMapRef = useRef(null)
  const locationMapInstance = useRef(null)
  const locationRouteLines = useRef([])
  const locationUserMarker = useRef(null)
  const locationDestMarker = useRef(null)
  const [locationFromAddress, setLocationFromAddress] = useState('')
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false)
  const [locationRouteInfo, setLocationRouteInfo] = useState(null)
  const [locationIsRouting, setLocationIsRouting] = useState(false)
  const [mapLoading, setMapLoading] = useState(true)
  const locationSearchTimeout = useRef(null)
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

    if (data) {
      setTimeSlots(data)
      // Auto-select today's first available slot as default
      if (data.length > 0 && !selectedSlotId) {
        const today = new Date()
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const todaySlot = data.find(slot => {
          const d = new Date(slot.start_time)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          return key === todayKey
        })
        if (todaySlot) {
          setSelectedSlotId(todaySlot.id)
        } else {
          // If no slots today, select the first available slot
          setSelectedSlotId(data[0].id)
        }
      }
    }
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
          .select('*, avatar_url')
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

  // Initialize Leaflet map for property location
  useEffect(() => {
    if (typeof window === 'undefined' || !property || locationMapInstance.current) return

    const initMap = () => {
      if (!locationMapRef.current || locationMapInstance.current) return

      import('leaflet').then((L) => {
        if (!locationMapRef.current || locationMapInstance.current || locationMapRef.current._leaflet_id) return

        delete L.Icon.Default.prototype._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        })

        const coords = extractCoordinates(property?.location_link)
        const lat = coords ? parseFloat(coords.lat) : 10.3157
        const lng = coords ? parseFloat(coords.lng) : 123.8854

        const map = L.map(locationMapRef.current, {
          zoomControl: true,
          scrollWheelZoom: true,
          dragging: true,
          touchZoom: true,
        }).setView([lat, lng], 16)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map)

        const redIcon = new L.Icon({
          iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41]
        })

        L.marker([lat, lng], { icon: redIcon })
          .addTo(map)
          .bindPopup(`<b>${property.title || 'Property Location'}</b>`)
          .openPopup()

        locationMapInstance.current = map
        setMapLoading(false)

        // Fix map rendering in containers that may not be visible initially
        setTimeout(() => map.invalidateSize(), 300)
      }).catch(err => console.error('Failed to load Leaflet for location map', err))
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initMap, 200)
    return () => {
      clearTimeout(timer)
      if (locationMapInstance.current) {
        locationMapInstance.current.remove()
        locationMapInstance.current = null
      }
    }
  }, [property])

  // Location routing functions
  const handleLocationAddressChange = (e) => {
    const value = e.target.value
    setLocationFromAddress(value)
    if (locationSearchTimeout.current) clearTimeout(locationSearchTimeout.current)
    if (value.length > 2) {
      locationSearchTimeout.current = setTimeout(async () => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=5&addressdetails=1`)
          const data = await res.json()
          setLocationSuggestions(data)
          setShowLocationSuggestions(true)
        } catch (error) { console.error('Autocomplete Error:', error) }
      }, 250)
    } else {
      setLocationSuggestions([])
      setShowLocationSuggestions(false)
    }
  }

  const selectLocationSuggestion = (suggestion) => {
    const lat = parseFloat(suggestion.lat)
    const lng = parseFloat(suggestion.lon)
    setLocationFromAddress(suggestion.display_name)
    setShowLocationSuggestions(false)
    calculateLocationRoute(lat, lng)
  }

  const handleLocationMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported.')
      return
    }
    setLocationFromAddress('My Location')
    setShowLocationSuggestions(false)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        calculateLocationRoute(position.coords.latitude, position.coords.longitude)
      },
      () => { alert('Location access denied.') }
    )
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '--'
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hrs > 0) return `${hrs}h ${mins}m`
    return `${mins} min`
  }

  const calculateLocationRoute = async (fromLat, fromLng) => {
    if (!locationMapInstance.current || !property) return
    setLocationIsRouting(true)

    const coords = extractCoordinates(property?.location_link)
    const destLat = coords ? parseFloat(coords.lat) : 10.3157
    const destLng = coords ? parseFloat(coords.lng) : 123.8854

    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${destLng},${destLat}?overview=full&geometries=geojson`
      )
      const data = await response.json()

      if (data.code === 'Ok' && data.routes.length > 0) {
        const route = data.routes[0]
        const routeCoords = route.geometry.coordinates.map(c => [c[1], c[0]])
        const distance = (route.distance / 1000).toFixed(1)
        const duration = formatDuration(route.duration)

        setLocationRouteInfo({ distance, duration })

        import('leaflet').then((L) => {
          // Clear old route lines
          locationRouteLines.current.forEach(line => { if (line && line.remove) line.remove() })
          locationRouteLines.current = []

          // Clear old user marker
          if (locationUserMarker.current) { locationUserMarker.current.remove(); locationUserMarker.current = null }

          // Draw route
          const polyline = L.polyline(routeCoords, {
            color: '#111827',
            weight: 5,
            opacity: 0.9,
            lineJoin: 'round'
          }).addTo(locationMapInstance.current)
          locationRouteLines.current.push(polyline)

          // Add user marker (blue dot)
          const blueIcon = L.divIcon({
            className: '',
            html: `<div class="w-4 h-4 bg-blue-600 border-[3px] border-white rounded-full shadow-lg"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
          const userMk = L.marker([fromLat, fromLng], { icon: blueIcon }).addTo(locationMapInstance.current)
          locationUserMarker.current = userMk

          // Fit bounds to show full route
          locationMapInstance.current.fitBounds(polyline.getBounds(), { padding: [40, 40] })
        })
      } else {
        setLocationRouteInfo(null)
      }
    } catch (err) {
      console.error('Route calculation error:', err)
      setLocationRouteInfo(null)
    }
    setLocationIsRouting(false)
  }

  const clearLocationRoute = () => {
    locationRouteLines.current.forEach(line => { if (line && line.remove) line.remove() })
    locationRouteLines.current = []
    if (locationUserMarker.current) { locationUserMarker.current.remove(); locationUserMarker.current = null }
    setLocationFromAddress('')
    setLocationRouteInfo(null)
    setShowLocationSuggestions(false)

    // Re-center map on property
    if (locationMapInstance.current && property) {
      const coords = extractCoordinates(property?.location_link)
      const lat = coords ? parseFloat(coords.lat) : 10.3157
      const lng = coords ? parseFloat(coords.lng) : 123.8854
      locationMapInstance.current.setView([lat, lng], 16, { animate: true })
    }
  }

  const handleInternalDirections = (e) => {
    e.preventDefault();
    const coords = extractCoordinates(property?.location_link);
    const fullAddr = `${property.address}, ${property.city}`;
    router.push({
      pathname: '/getDirections',
      query: {
        to: fullAddr,
        lat: coords ? coords.lat : undefined,
        lng: coords ? coords.lng : undefined
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

  // Cancel/Close the form (don't reset selectedSlotId so default date persists)
  const handleCancelBooking = () => {
    setShowBookingOptions(false)
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
      showToast.error('You already have an active viewing request. Please cancel it before booking another.', {
        duration: 4000,
        position: "top-center",
        transition: "bounceIn"
      })
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

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        {/* Wrapper for animation + text */}
        <div className="flex flex-col items-center">
          <Lottie
            animationData={loadingAnimation}
            loop={true}
            className="w-64 h-64"
          />
          <p className="text-gray-500 font-medium text-lg mt-4">
            Loading Property Details...
          </p>
        </div>
      </div>
    )
  if (!property)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        Property not found
      </div>
    )

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
    <>
      <Head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      </Head>
      <div className="min-h-[calc(100vh-64px)] bg-[#F3F4F5] px-4 pt-4 pb-0 font-sans">
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
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="text-gray-600 text-sm font-medium">{fullAddress}</span>
              </div>
            </div>

            <div className="flex flex-col items-start md:items-end">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-black">₱{Number(property.price).toLocaleString()}</span>
                <span className="text-gray-500 font-medium text-sm">/mo</span>
              </div>
            </div>
          </div>

          {/* Full-Width Gallery */}
          <div className="mb-5">
            {/* Gallery Collage */}
            <div className="rounded-xl overflow-hidden shadow-sm border border-gray-100 relative">
              {propertyImages.length === 1 ? (
                /* Single image layout */
                <div className="h-[350px] md:h-[420px] cursor-pointer group overflow-hidden" onClick={() => setShowGalleryModal(true)}>
                  <img
                    src={propertyImages[0]}
                    alt={property.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop' }}
                  />
                </div>
              ) : (
                /* Collage layout for multiple images */
                <div className="grid grid-cols-4 grid-rows-2 gap-1 h-[350px] md:h-[420px]">
                  {/* Main large image - takes up left 2/4 columns and both rows */}
                  <div
                    className="col-span-2 row-span-2 cursor-pointer overflow-hidden group"
                    onClick={() => { setCurrentImageIndex(0); setShowGalleryModal(true); }}
                  >
                    <img
                      src={propertyImages[0]}
                      alt={property.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop' }}
                    />
                  </div>

                  {/* Top right images */}
                  {propertyImages.slice(1, 3).map((img, idx) => (
                    <div
                      key={idx}
                      className="cursor-pointer overflow-hidden group"
                      onClick={() => { setCurrentImageIndex(idx + 1); setShowGalleryModal(true); }}
                    >
                      <img
                        src={img}
                        alt={`${property.title} ${idx + 2}`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop' }}
                      />
                    </div>
                  ))}

                  {/* Bottom right images */}
                  {propertyImages.slice(3, 5).map((img, idx) => (
                    <div
                      key={idx}
                      className="relative cursor-pointer overflow-hidden group"
                      onClick={() => { setCurrentImageIndex(idx + 3); setShowGalleryModal(true); }}
                    >
                      <img
                        src={img}
                        alt={`${property.title} ${idx + 4}`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop' }}
                      />

                      {/* Show "View all" overlay on last visible image if there are more */}
                      {idx === 1 && propertyImages.length > 5 && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity duration-300 group-hover:bg-black/40">
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
                  className="absolute bottom-4 right-4 bg-white hover:bg-gray-50 text-black text-xs font-bold px-4 py-2 rounded-lg shadow-md border border-gray-200 cursor-pointer flex items-center gap-2 transition-transform hover:scale-105"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  Show all photos
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Left Column - Details */}
            <div className="lg:col-span-2 flex flex-col gap-5">
              {/* Specs & Description */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden">

                <div className="flex flex-wrap items-center gap-4 md:gap-8 pb-6 mb-6 border-b border-gray-100">
                  <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 shadow-sm transition-transform hover:scale-105 hover:shadow-md">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-blue-600 shadow-sm"><svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
                    </svg></div>
                    <div><p className="text-xl font-black text-gray-900 leading-none">{property.bedrooms}</p><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Bedrooms</p></div>
                  </div>

                  <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 shadow-sm transition-transform hover:scale-105 hover:shadow-md">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-blue-600 shadow-sm"><svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" />
                    </svg></div>
                    <div><p className="text-xl font-black text-gray-900 leading-none">{property.bathrooms}</p><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Bathrooms</p></div>
                  </div>

                  <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 shadow-sm transition-transform hover:scale-105 hover:shadow-md">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-blue-600 shadow-sm"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></div>
                    <div><p className="text-xl font-black text-gray-900 leading-none">{property.area_sqft}</p><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Sq. Ft.</p></div>
                  </div>
                </div>
                <div className="mb-8">
                  <h3 className="text-3xl font-bold text-gray-900 mb-3 uppercase tracking-wider">About this property</h3>
                  <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{property.description || 'No description provided.'}</p>
                </div>
              </div>

              {/* Reviews Section - Enhanced 2x2 Grid */}
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <h3 className="text-3xl font-bold text-gray-900">Reviews</h3>
                    <span className="px-2.5 py-0.5 text-gray-600 text-xs font-bold rounded-full">{reviews.length}</span>
                  </div>
                  {reviews.length > 0 && (
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                      <span className="text-xl font-black text-gray-900">{(reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {reviews.length > 0 && (
                  <>
                    {/* Overall Category Ratings Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                      {[
                        { label: 'Cleanliness', key: 'cleanliness_rating', color: 'bg-blue-500', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg> },
                        { label: 'Communication', key: 'communication_rating', color: 'bg-green-500', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg> },
                        { label: 'Location', key: 'location_rating', color: 'bg-orange-500', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
                        // { label: 'Overall', key: 'rating', color: 'bg-yellow-500', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg> },
                      ].map(cat => {
                        const avg = (reviews.reduce((acc, curr) => acc + (curr[cat.key] || curr.rating), 0) / reviews.length)
                        return (
                          <div key={cat.key} className="p-3 rounded-xl bg-gray-50">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-gray-500">{cat.icon}</span>
                              <span className="text-xs font-medium text-gray-600">{cat.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold text-gray-900">{avg.toFixed(1)}</span>
                              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className={`h-full ${cat.color} rounded-full transition-all duration-500`} style={{ width: `${(avg / 5) * 100}%` }}></div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* 2x2 Reviews Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {reviews.slice(0, 4).map((review, i) => (
                        <div key={i} className="p-4">
                          {/* Review Header */}
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-bold text-sm">
                                {review.tenant?.first_name?.charAt(0)}{review.tenant?.last_name?.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-gray-800 text-sm">
                                  {review.tenant?.first_name} {review.tenant?.last_name}
                                </p>
                                <p className="text-[10px] text-gray-400">{new Date(review.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-full shadow-sm">
                              <svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                              <span className="text-xs font-bold text-gray-800">{review.rating}</span>
                            </div>
                          </div>
                          {/* Category Ratings */}
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            <span className="px-2 py-0.5 bg-gray-50 rounded-full text-[10px] font-medium text-gray-500 border border-gray-100">
                              Cleanliness: <span className="font-bold text-gray-700">{review.cleanliness_rating || review.rating}/5</span>
                            </span>
                            <span className="px-2 py-0.5 bg-gray-50 rounded-full text-[10px] font-medium text-gray-500 border border-gray-100">
                              Communication: <span className="font-bold text-gray-700">{review.communication_rating || review.rating}/5</span>
                            </span>
                            <span className="px-2 py-0.5 bg-gray-50 rounded-full text-[10px] font-medium text-gray-500 border border-gray-100">
                              Location: <span className="font-bold text-gray-700">{review.location_rating || review.rating}/5</span>
                            </span>
                          </div>
                          {/* Review Comment - truncated */}
                          <p className="text-gray-600 leading-relaxed text-sm line-clamp-3">{review.comment}</p>
                        </div>
                      ))}
                    </div>

                    {/* See More Reviews Button */}
                    {reviews.length > 4 && (
                      <button
                        onClick={() => setShowAllReviewsModal(true)}
                        className="w-full mt-4 py-3 rounded-xl text-sm font-bold text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                        See all {reviews.length} reviews
                      </button>
                    )}
                  </>
                )}

                {reviews.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                    </div>
                    <p className="text-gray-500 font-medium">No reviews yet</p>
                    <p className="text-gray-400 text-sm mt-1">Be the first to review this property</p>
                  </div>
                )}
              </div>

              {/* Separator */}
              <div className="h-px bg-gray-200"></div>

              {/* Posted By + Contact Details */}
              <div className="py-0">
                <h3 className="font-bold text-gray-900 mb-3">Contact Details of Landlord</h3>
                {/* Posted By */}
                <div className="flex items-center gap-3 mb-3">
                  {landlordProfile?.avatar_url ? (
                    <img src={landlordProfile.avatar_url} alt="Landlord" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {landlordProfile?.first_name ? landlordProfile.first_name.charAt(0).toUpperCase() : 'L'}
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    <p className="font-bold text-gray-900 text-sm truncate">{landlordProfile?.first_name ? `${landlordProfile.first_name} ${landlordProfile.last_name}` : 'Property Owner'}</p>
                    <p className="text-xs text-gray-500">Posted By</p>
                  </div>
                </div>

                {/* Contact Details */}
                <div className="text-xs">
                  <div className="flex flex-col gap-1">
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
              </div>

              {/* Separator */}
              <div className="h-px bg-gray-200"></div>

              {/* Location / Get Directions - Separate Section */}
              <div className="py-2">
                <h3 className="text-3xl font-bold text-gray-900 mb-3 uppercase tracking-wider">Location</h3>
                <div className="w-full h-[500px] bg-gray-50 rounded-xl overflow-hidden relative" ref={locationMapRef} id="property-location-map">
                  {/* Map Loading Overlay */}
                  {mapLoading && (
                    <div className="absolute inset-0 z-[2000] flex flex-col items-center justify-center bg-gray-50 text-gray-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600 mb-2"></div>
                      <p className="text-sm font-medium">Loading Map...</p>
                    </div>
                  )}

                  {/* Floating Input Panel - Inside Map */}
                  <div className="absolute bottom-3 left-3 right-3 z-[1000] flex flex-col gap-2">
                    {/* Route Info Bar */}
                    {locationIsRouting && (
                      <div className="flex items-center justify-center gap-2 bg-white/95 backdrop-blur-sm rounded-xl px-4 py-3 shadow-lg">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-200 border-t-blue-600"></div>
                        <p className="text-sm font-medium text-gray-600">Calculating route...</p>
                      </div>
                    )}
                    {locationRouteInfo && !locationIsRouting && (
                      <div className="flex items-center gap-4 bg-white/95 backdrop-blur-sm rounded-xl px-4 py-3 shadow-lg">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" /></svg>
                          <span className="text-sm font-bold text-gray-900">{locationRouteInfo.duration}</span>
                        </div>
                        <span className="text-gray-300">•</span>
                        <span className="text-sm text-gray-500">{locationRouteInfo.distance} km</span>
                        <button
                          onClick={handleInternalDirections}
                          className="ml-auto px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 cursor-pointer flex items-center gap-1.5 shadow-sm transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                          Navigate
                        </button>
                      </div>
                    )}

                    {/* From Address Input */}
                    <div className="flex items-center bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2.5 shadow-lg relative">
                      <div className="w-3 h-3 bg-blue-500 rounded-full mr-3 shadow-sm"></div>
                      <input
                        className="flex-1 bg-transparent text-sm font-medium outline-none placeholder-gray-400"
                        placeholder="Enter your location"
                        value={locationFromAddress}
                        onChange={handleLocationAddressChange}
                        onFocus={() => { if (locationSuggestions.length > 0) setShowLocationSuggestions(true) }}
                      />
                      <button onClick={handleLocationMyLocation} className="p-2 bg-blue-500 rounded-lg text-white hover:bg-blue-600 transition-colors cursor-pointer shadow-sm ml-1" title="Locate Me">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </button>
                      {locationFromAddress && (
                        <button onClick={clearLocationRoute} className="p-1.5 hover:bg-gray-200 rounded-full transition-colors cursor-pointer ml-1" title="Clear">
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                      {/* Suggestions Dropdown - opens upward since input is at bottom */}
                      {showLocationSuggestions && locationSuggestions.length > 0 && (
                        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-[1100] overflow-hidden max-h-48 overflow-y-auto">
                          {locationSuggestions.map((item, index) => (
                            <div key={index} onClick={() => selectLocationSuggestion(item)} className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-start gap-3">
                              <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              <span className="text-sm text-gray-700 leading-snug">{item.display_name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Right Column - Sidebar */}
            <div className="flex flex-col gap-4">



              {/* Booking + Amenities White Container */}
              <div className="bg-white border border-white rounded-xl shadow-sm p-5">

                {isOwner ? (
                  <div className="flex flex-col gap-3">
                    <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-lg">You own this property.</div>
                    <button onClick={() => router.push(`/properties/edit/${property.id}`)} className="w-full py-2.5 px-4 bg-black text-white text-sm font-bold rounded-lg cursor-pointer hover:bg-gray-900 transition-colors">Edit Property</button>
                  </div>
                ) : isLandlord ? (
                  <div className="p-3 bg-gray-50 text-gray-600 text-xs rounded-lg">Landlords cannot book viewings.</div>
                ) : (
                  <>
                    {hasActiveOccupancy ? (
                      <div className="p-3 bg-yellow-50 rounded-lg">
                        <p className="font-bold text-yellow-800 text-xs mb-1">Active Occupancy</p>
                        <p className="text-xs text-yellow-700 leading-relaxed mb-2">Assigned to <strong>{occupiedPropertyTitle}</strong>.</p>
                        <button onClick={() => router.push('/dashboard')} className="text-xs font-bold text-yellow-800 underline cursor-pointer">Dashboard</button>
                      </div>
                    ) : property.status !== 'available' ? (
                      <div className="p-3 bg-gray-50 text-gray-500 text-xs font-medium rounded-lg text-center">Not available for booking.</div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {/* Default Date Display + Book Now Button (Shown only when options are hidden) */}
                        {!showBookingOptions && (
                          <>
                            {/* Pre-selected Date Display */}
                            {selectedSlotId && timeSlots.length > 0 && (() => {
                              const slot = timeSlots.find(s => s.id === selectedSlotId)
                              if (!slot) return null
                              return (
                                <div className="bg-white-100  border border-gray-100 rounded-xl p-4">
                                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Selected Date</p>
                                  <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-black rounded-xl flex flex-col items-center justify-center text-white">
                                      <span className="text-lg font-black leading-none">{new Date(slot.start_time).getDate()}</span>
                                      <span className="text-[8px] font-bold uppercase">{new Date(slot.start_time).toLocaleDateString('en-US', { month: 'short' })}</span>
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-gray-900">{new Date(slot.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                                      <p className="text-xs text-gray-500">{new Date(slot.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – {new Date(slot.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                            <button
                              onClick={handleOpenBooking}
                              className="w-full py-3.5 bg-black text-white text-sm font-bold rounded-xl shadow-lg shadow-gray-200 hover:bg-gray-900 hover:shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              Book Now
                            </button>
                          </>
                        )}

                        {/* Dropdown & Form Section (Replaces Button) */}
                        {showBookingOptions && (
                          <div className="flex flex-col gap-4 animate-in slide-in-from-top-4 fade-in duration-500 bg-gray-50 p-4 rounded-xl">

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

                            {/* Date/Time Selection - Airbnb Calendar Style */}
                            <div>
                              {timeSlots.length > 0 ? (() => {
                                // --- Build calendar data ---
                                const slotsByDate = {}
                                timeSlots.forEach(slot => {
                                  const d = new Date(slot.start_time)
                                  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                                  if (!slotsByDate[key]) slotsByDate[key] = []
                                  slotsByDate[key].push(slot)
                                })

                                // Classify a slot into AM1/AM2/PM1/PM2
                                function classifySlot(slot) {
                                  const h = new Date(slot.start_time).getHours()
                                  if (h < 10) return 'AM1'
                                  if (h < 12) return 'AM2'
                                  if (h < 15) return 'PM1'
                                  return 'PM2'
                                }

                                // Current calendar state (use first slot month as default)
                                const firstSlotDate = new Date(timeSlots[0].start_time)
                                const today = new Date()
                                today.setHours(0, 0, 0, 0)

                                // We'll use inline state via a self-invoking pattern with selectedDate tracking
                                // Since we can't add state here, we derive the selected date from selectedSlotId
                                const selectedSlot = timeSlots.find(s => s.id === selectedSlotId)
                                const selectedDateKey = selectedSlot
                                  ? `${new Date(selectedSlot.start_time).getFullYear()}-${String(new Date(selectedSlot.start_time).getMonth() + 1).padStart(2, '0')}-${String(new Date(selectedSlot.start_time).getDate()).padStart(2, '0')}`
                                  : null

                                // Determine which months have slots
                                const slotDates = Object.keys(slotsByDate)
                                const allMonths = [...new Set(slotDates.map(d => d.substring(0, 7)))].sort()

                                return (
                                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    {/* Time Period Selector (top bar like check-in/checkout) */}
                                    <div className="grid grid-cols-4 border-b border-gray-200">
                                      {[
                                        { key: 'AM1', label: 'AM 1', sub: '6–10 AM' },
                                        { key: 'AM2', label: 'AM 2', sub: '10–12 PM' },
                                        { key: 'PM1', label: 'PM 1', sub: '12–3 PM' },
                                        { key: 'PM2', label: 'PM 2', sub: '3–6 PM' },
                                      ].map((period, idx) => {
                                        // Check if the selected date has a slot in this period
                                        const dateSlots = selectedDateKey ? (slotsByDate[selectedDateKey] || []) : []
                                        const periodSlot = dateSlots.find(s => classifySlot(s) === period.key)
                                        const isAvailable = !!periodSlot
                                        const isActive = selectedSlot && periodSlot && periodSlot.id === selectedSlot.id

                                        return (
                                          <button
                                            key={period.key}
                                            type="button"
                                            disabled={!isAvailable}
                                            onClick={() => { if (periodSlot) setSelectedSlotId(periodSlot.id) }}
                                            className={`py-2.5 px-1 text-center transition-all relative cursor-pointer disabled:cursor-not-allowed
                                            ${idx < 3 ? 'border-r border-gray-200' : ''}
                                            ${isActive ? 'bg-gray-50' : ''}
                                            ${!isAvailable ? 'opacity-40' : 'hover:bg-gray-50'}
                                          `}
                                          >
                                            <p className={`text-[9px] font-bold uppercase tracking-widest ${isActive ? 'text-black' : isAvailable ? 'text-gray-400' : 'text-gray-300'}`}>{period.label}</p>
                                            <p className={`text-[10px] font-medium mt-0.5 ${isActive ? 'text-black font-bold' : isAvailable ? 'text-gray-600' : 'text-gray-300 line-through'}`}>
                                              {isAvailable ? period.sub : 'N/A'}
                                            </p>
                                            {isActive && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-black rounded-full"></div>}
                                          </button>
                                        )
                                      })}
                                    </div>

                                    {/* Calendar Months */}
                                    <div className="p-3 max-h-[280px] overflow-y-auto">
                                      {allMonths.map(monthKey => {
                                        const [yearStr, monStr] = monthKey.split('-')
                                        const year = parseInt(yearStr)
                                        const month = parseInt(monStr) - 1
                                        const firstDay = new Date(year, month, 1)
                                        const daysInMonth = new Date(year, month + 1, 0).getDate()
                                        const startDow = firstDay.getDay() // 0=Sun

                                        const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

                                        // Build day cells
                                        const cells = []
                                        // Empty cells before first day
                                        for (let i = 0; i < startDow; i++) cells.push(null)
                                        for (let d = 1; d <= daysInMonth; d++) cells.push(d)

                                        return (
                                          <div key={monthKey} className="mb-4 last:mb-0">
                                            {/* Month Header */}
                                            <div className="flex items-center justify-center mb-2.5">
                                              <h4 className="text-xs font-black text-gray-900 tracking-tight">{monthLabel}</h4>
                                            </div>

                                            {/* Day headers */}
                                            <div className="grid grid-cols-7 gap-0 mb-1">
                                              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                                <div key={i} className="text-center text-[9px] font-bold text-gray-400 uppercase py-1">{d}</div>
                                              ))}
                                            </div>

                                            {/* Day grid */}
                                            <div className="grid grid-cols-7 gap-0">
                                              {cells.map((day, i) => {
                                                if (day === null) return <div key={`empty-${i}`} className="aspect-square"></div>

                                                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                                                const hasSlots = !!slotsByDate[dateKey]
                                                const dateObj = new Date(year, month, day)
                                                const isPast = dateObj < today
                                                const isDisabled = !hasSlots || isPast
                                                const isSelectedDate = selectedDateKey === dateKey

                                                // Check if this is today
                                                const isToday = dateObj.getTime() === today.getTime()

                                                return (
                                                  <button
                                                    key={dateKey}
                                                    type="button"
                                                    disabled={isDisabled}
                                                    onClick={() => {
                                                      // Select first available slot of this date
                                                      const daySlots = slotsByDate[dateKey] || []
                                                      if (daySlots.length > 0) setSelectedSlotId(daySlots[0].id)
                                                    }}
                                                    className={`aspect-square flex items-center justify-center text-xs rounded-full transition-all relative
                                                    ${isSelectedDate
                                                        ? 'bg-black text-white font-black shadow-lg'
                                                        : isDisabled
                                                          ? 'text-gray-300 cursor-not-allowed'
                                                          : 'text-gray-800 font-bold hover:bg-gray-100 cursor-pointer'
                                                      }
                                                    ${isToday && !isSelectedDate ? 'ring-1 ring-black ring-offset-1' : ''}
                                                  `}
                                                  >
                                                    {day}
                                                    {hasSlots && !isPast && !isSelectedDate && (
                                                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-black rounded-full"></span>
                                                    )}
                                                  </button>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>

                                    {/* Selected Info */}
                                    {selectedSlot && (
                                      <div className="border-t border-gray-100 px-3 py-2.5 bg-gray-50/50 flex items-center justify-between">
                                        <div>
                                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Selected</p>
                                          <p className="text-xs font-bold text-gray-900">
                                            {new Date(selectedSlot.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} • {new Date(selectedSlot.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – {new Date(selectedSlot.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                          </p>
                                        </div>
                                        <button type="button" onClick={() => setSelectedSlotId('')} className="text-[10px] font-bold text-gray-400 hover:text-black cursor-pointer">Clear</button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })() : (
                                <div className="text-xs text-red-500 bg-white p-3 rounded-xl border border-red-100 text-center">
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
                {/* booking card inner content ends — white container stays open for amenities */}


                {/* Amenities Section */}
                {property.amenities && property.amenities.length > 0 && (
                  <div className="p-5 rounded-xl">
                    <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Amenities</h3>
                    <div className="flex flex-wrap gap-2">
                      {(showAllAmenities ? property.amenities : property.amenities.slice(0, 6)).map((amenity, index) => (
                        <span
                          key={index}
                          className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full"
                        >
                          {amenity}
                        </span>
                      ))}
                    </div>
                    {property.amenities.length > 6 && (
                      <button
                        onClick={() => setShowAllAmenities(!showAllAmenities)}
                        className="mt-3 text-xs font-bold text-black underline cursor-pointer hover:text-gray-600 transition-colors"
                      >
                        {showAllAmenities ? 'Show less' : `+${property.amenities.length - 6} more`}
                      </button>
                    )}
                  </div>
                )}

                {/* Close white container */}
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
        {/* Reviews Modal */}
        {showAllReviewsModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowAllReviewsModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">All Reviews</h2>
                <button
                  onClick={() => setShowAllReviewsModal(false)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Modal Body - Split Layout */}
              <div className="flex-1 flex overflow-hidden">
                {/* Left Panel - Ratings Summary & Filters */}
                <div className="w-80 border-r border-gray-100 p-6 overflow-y-auto flex-shrink-0 bg-gray-50/50">
                  {/* Overall Rating */}
                  <div className="text-center mb-6 pb-6 border-b border-gray-200">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <svg className="w-7 h-7 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                      <span className="text-4xl font-black text-gray-900">{(reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1)}</span>
                    </div>
                    <p className="text-sm text-gray-500">{reviews.length} reviews</p>
                  </div>

                  {/* Category Breakdowns */}
                  <div className="space-y-4 mb-6 pb-6 border-b border-gray-200">
                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">Rating Breakdown</h4>
                    {[
                      { label: 'Cleanliness', key: 'cleanliness_rating', color: 'bg-blue-500', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg> },
                      { label: 'Communication', key: 'communication_rating', color: 'bg-green-500', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg> },
                      { label: 'Location', key: 'location_rating', color: 'bg-orange-500', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
                      // { label: 'Overall', key: 'rating', color: 'bg-yellow-500', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg> },
                    ].map(cat => {
                      const avg = (reviews.reduce((acc, curr) => acc + (curr[cat.key] || curr.rating), 0) / reviews.length)
                      return (
                        <div key={cat.key}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2 text-gray-600">
                              {cat.icon}
                              <span className="text-xs font-medium">{cat.label}</span>
                            </div>
                            <span className="text-sm font-bold text-gray-900">{avg.toFixed(1)}</span>
                          </div>
                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full ${cat.color} rounded-full transition-all duration-500`} style={{ width: `${(avg / 5) * 100}%` }}></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Filter Options */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">Sort By</h4>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { key: 'most_relevant', label: 'Most Relevant' },
                        { key: 'most_recent', label: 'Most Recent' },
                        { key: 'highest_rated', label: 'Highest Rated' },
                        { key: 'lowest_rated', label: 'Lowest Rated' },
                      ].map(filter => (
                        <button
                          key={filter.key}
                          onClick={() => setReviewFilter(filter.key)}
                          className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${reviewFilter === filter.key
                            ? 'bg-black text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Panel - Reviews List */}
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="space-y-4">
                    {(() => {
                      let sorted = [...reviews]
                      switch (reviewFilter) {
                        case 'most_recent':
                          sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                          break
                        case 'highest_rated':
                          sorted.sort((a, b) => b.rating - a.rating)
                          break
                        case 'lowest_rated':
                          sorted.sort((a, b) => a.rating - b.rating)
                          break
                        case 'most_relevant':
                        default:
                          // Most relevant: combination of rating and recency
                          sorted.sort((a, b) => {
                            const scoreA = a.rating * 0.4 + (new Date(a.created_at).getTime() / Date.now()) * 0.6
                            const scoreB = b.rating * 0.4 + (new Date(b.created_at).getTime() / Date.now()) * 0.6
                            return scoreB - scoreA
                          })
                          break
                      }
                      return sorted.map((review, i) => (
                        <div key={i} className="p-5 bg-gray-50 rounded-xl border border-gray-100">
                          {/* Review Header */}
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-bold text-sm">
                                {review.tenant?.first_name?.charAt(0)}{review.tenant?.last_name?.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-gray-800 text-sm">
                                  {review.tenant?.first_name} {review.tenant?.last_name}
                                </p>
                                <p className="text-[10px] text-gray-400">{new Date(review.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-full shadow-sm border border-gray-100">
                              <svg className="w-4 h-4 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                              <span className="text-sm font-bold text-gray-800">{review.rating}</span>
                            </div>
                          </div>

                          {/* Category Ratings */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            <span className="px-2.5 py-1 bg-white rounded-full text-[11px] font-medium text-gray-600 border border-gray-100">
                              Cleanliness: <span className="font-bold text-gray-800">{review.cleanliness_rating || review.rating}/5</span>
                            </span>
                            <span className="px-2.5 py-1 bg-white rounded-full text-[11px] font-medium text-gray-600 border border-gray-100">
                              Communication: <span className="font-bold text-gray-800">{review.communication_rating || review.rating}/5</span>
                            </span>
                            <span className="px-2.5 py-1 bg-white rounded-full text-[11px] font-medium text-gray-600 border border-gray-100">
                              Location: <span className="font-bold text-gray-800">{review.location_rating || review.rating}/5</span>
                            </span>
                          </div>

                          {/* Review Comment */}
                          <p className="text-gray-600 leading-relaxed text-sm">{review.comment}</p>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* --------------------------- */}

        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />

      </div >
      <Footer />
    </>
  )
}
