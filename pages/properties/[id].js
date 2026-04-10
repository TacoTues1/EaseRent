import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import { createNotification } from '../../lib/notifications'
import AuthModal from '../../components/AuthModal'
import { showToast } from 'nextjs-toast-notify'
import Footer from '@/components/Footer'

const ACTIVE_BOOKING_STATUSES = ['pending', 'pending_approval', 'approved', 'accepted']
const SLOT_LOCKING_BOOKING_STATUSES = ['pending', 'pending_approval', 'approved', 'accepted', 'rejected', 'cancelled']

export default function PropertyDetail() {
  const router = useRouter()
  const { id } = router.query
  const [property, setProperty] = useState(null)
  const [propertyStatsInfo, setPropertyStatsInfo] = useState({ isMostFavorite: false, isTopRated: false })
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [landlordProfile, setLandlordProfile] = useState(null)
  const [landlordReviewStats, setLandlordReviewStats] = useState({ avg: 0, count: 0 })
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [hasActiveOccupancy, setHasActiveOccupancy] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [isCheckingOccupancy, setIsCheckingOccupancy] = useState(false)
  const [occupiedPropertyTitle, setOccupiedPropertyTitle] = useState('')
  const [showAllAmenities, setShowAllAmenities] = useState(false)
  const [reviews, setReviews] = useState([])
  const [timeSlots, setTimeSlots] = useState([])
  const [showBookingOptions, setShowBookingOptions] = useState(false)
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [selectedBookingDate, setSelectedBookingDate] = useState(null) // Track selected date separately
  const [bookingStep, setBookingStep] = useState(1) // 1 = pick date, 2 = pick time
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
    supabase.auth.getSession().then(async result => {
      const existingSession = result.data?.session
      if (existingSession) {
        setSession(existingSession)
        await checkActiveOccupancy(existingSession.user.id)
        loadProfile(existingSession.user.id)
      }
      setAuthChecked(true)
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
    }
  }

  async function fillOccupiedPropertyTitle(propertyId) {
    if (!propertyId) return
    try {
      const { data } = await supabase
        .from('properties')
        .select('title')
        .eq('id', propertyId)
        .maybeSingle()

      if (data?.title) {
        setOccupiedPropertyTitle(data.title)
      }
    } catch (err) {
      console.error('Error resolving occupied property title:', err)
    }
  }

  async function checkActiveOccupancy(userId) {
    setIsCheckingOccupancy(true)
    setHasActiveOccupancy(false)
    setOccupiedPropertyTitle('')

    try {
      const { data: directOccupancy } = await supabase
        .from('tenant_occupancies')
        .select('id, property_id')
        .eq('tenant_id', userId)
        .in('status', ['active', 'pending_end'])
        .limit(1)
        .maybeSingle()

      if (directOccupancy) {
        setHasActiveOccupancy(true)
        setOccupiedPropertyTitle('a property')
        fillOccupiedPropertyTitle(directOccupancy.property_id)
        return
      }

      // Family-member accounts inherit an active property from their parent occupancy.
      const fmRes = await fetch(`/api/family-members?member_id=${userId}&check_only=1`, { cache: 'no-store' })

      if (!fmRes.ok) return

      const fmData = await fmRes.json()
      if (fmData?.occupancy) {
        setHasActiveOccupancy(true)
        setOccupiedPropertyTitle(fmData.occupancy?.property?.title || 'a property')
      }
    } catch (err) {
      console.error('Error checking family member occupancy in property details:', err)
    } finally {
      setIsCheckingOccupancy(false)
    }
  }

  useEffect(() => {
    if (id) {
      window.scrollTo(0, 0)
      loadProperty()
      loadReviews()
      loadPropertyStats()
    }
  }, [id])

  async function loadPropertyStats() {
    const { data } = await supabase.from('property_stats').select('*')
    if (data && id) {
      const mostFav = data.filter(d => (d.favorite_count || 0) > 0).sort((a, b) => b.favorite_count - a.favorite_count)[0]?.property_id;
      const topRated = data.filter(d => (d.review_count || 0) > 0).sort((a, b) => b.avg_rating - a.avg_rating || b.review_count - a.review_count)[0]?.property_id;

      const currentPropStats = data.find(d => d.property_id === id) || { favorite_count: 0, review_count: 0 };

      setPropertyStatsInfo({
        isMostFavorite: mostFav === id,
        isTopRated: topRated === id,
        favoriteCount: currentPropStats.favorite_count || 0,
        reviewCount: currentPropStats.review_count || 0
      });
    }
  }

  // Load slots when property (and landlord) is available
  useEffect(() => {
    if (property?.landlord) {
      loadTimeSlots(property.landlord)
    }
  }, [property])

  async function loadTimeSlots(landlordId) {
    if (!id || !landlordId) {
      setTimeSlots([])
      return
    }

    let availableSlots = []
    try {
      const response = await fetch(`/api/available-slots?propertyId=${encodeURIComponent(id)}&landlordId=${encodeURIComponent(landlordId)}`, {
        method: 'GET',
        cache: 'no-store'
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error || `Availability API failed with status ${response.status}`)
      }

      const payload = await response.json()
      availableSlots = Array.isArray(payload?.slots) ? payload.slots : []
    } catch (error) {
      console.error('Error loading slots:', error)
      setTimeSlots([])
      setSelectedSlotId('')
      return
    }

    if (availableSlots) {
      setTimeSlots(availableSlots)
      // Auto-select today's first available slot as default
      if (availableSlots.length > 0 && !selectedSlotId) {
        const today = new Date()
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const todaySlot = availableSlots.find(slot => {
          const d = new Date(slot.start_time)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          return key === todayKey
        })
        if (todaySlot) {
          setSelectedSlotId(todaySlot.id)
        } else {
          // If no slots today, select the first available slot
          setSelectedSlotId(availableSlots[0].id)
        }
      } else if (availableSlots.length === 0) {
        setSelectedSlotId('')
      }
    }
  }

  async function markConflictingSlotsBooked(slot, extraSlotIds = []) {
    const slotIds = [...new Set([slot?.id, ...extraSlotIds].filter(Boolean))]
    if (slotIds.length === 0) return

    const { error } = await supabase
      .from('available_time_slots')
      .update({ is_booked: true })
      .in('id', slotIds)

    if (error) {
      console.error('Failed to mark conflicting slot(s) as booked:', error)
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
      await loadLandlordReviewStats(propertyData.landlord)
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

  async function loadLandlordReviewStats(landlordId) {
    if (!landlordId) {
      setLandlordReviewStats({ avg: 0, count: 0 })
      return
    }

    const { data, error } = await supabase
      .from('landlord_ratings')
      .select('rating')
      .eq('landlord_id', landlordId)

    if (error) {
      console.error('Error loading landlord review stats:', error)
      setLandlordReviewStats({ avg: 0, count: 0 })
      return
    }

    const count = (data || []).length
    const avg = count > 0
      ? (data.reduce((sum, item) => sum + Number(item.rating || 0), 0) / count)
      : 0

    setLandlordReviewStats({ avg, count })
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
    const country = property?.country || 'Philippines'
    const address = `${property?.address || ''}, ${property?.city || ''}, ${property?.state_province || ''} ${property?.zip || ''}, ${country}`
    return `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=17&output=embed`
  }

  // Initialize Maplibre GL map for property location
  useEffect(() => {
    if (typeof window === 'undefined' || !property || locationMapInstance.current) return

    const initMap = () => {
      if (!locationMapRef.current || locationMapInstance.current) return

      import('maplibre-gl').then((mlglModule) => {
        const mlgl = mlglModule.default || mlglModule;

        if (!locationMapRef.current || locationMapInstance.current) return

        const coords = extractCoordinates(property?.location_link)
        const lat = coords ? parseFloat(coords.lat) : 10.3157
        const lng = coords ? parseFloat(coords.lng) : 123.8854

        const map = new mlgl.Map({
          container: locationMapRef.current,
          style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
          center: [lng, lat],
          zoom: 15,
          dragPan: true,
          scrollZoom: true,
          attributionControl: false
        })

        // Crucial Fix: Set map instance IMMEDIATELY to prevent double-inits in StrictMode
        locationMapInstance.current = map

        map.addControl(new mlgl.NavigationControl({ showCompass: false }), 'top-right')

        const el = document.createElement('div')
        el.innerHTML = `
          <div class="relative w-12 h-12">
              <div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 flex items-center justify-center">
                   <div class="w-3 h-1 bg-black/20 blur-[2px] rounded-full absolute bottom-0.5"></div>
                   <svg class="w-8 h-8 text-rose-600 filter drop-shadow-md z-10" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                      <circle cx="12" cy="9" r="2.5" class="text-white" fill="currentColor" />
                   </svg>
              </div>
          </div>
        `

        // Add property marker
        new mlgl.Marker({ element: el.firstElementChild, anchor: 'bottom' })
          .setLngLat([lng, lat])
          .setPopup(new mlgl.Popup({ offset: 25, focusAfterOpen: false }).setHTML(`<b>${property.title || 'Property Location'}</b>`))
          .addTo(map)
          .togglePopup()

        locationMapInstance.current = map
        setMapLoading(false)

        setTimeout(() => map.resize(), 300)
      }).catch(err => console.error('Failed to load Maplibre for location map', err))
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
        const routeCoords = route.geometry.coordinates; // Maplibre takes [lng, lat]
        const distance = (route.distance / 1000).toFixed(1)
        const duration = formatDuration(route.duration)

        setLocationRouteInfo({ distance, duration })

        import('maplibre-gl').then((mlglModule) => {
          const mlgl = mlglModule.default || mlglModule;

          const map = locationMapInstance.current;

          // Clear old route lines
          if (map.getLayer('route-line')) map.removeLayer('route-line');
          if (map.getSource('route-source')) map.removeSource('route-source');

          // Clear old user marker
          if (locationUserMarker.current) { locationUserMarker.current.remove(); locationUserMarker.current = null }

          // Draw route
          map.addSource('route-source', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: route.geometry
            }
          });
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#111827', 'line-width': 5, 'line-opacity': 0.9 }
          });

          // Add user marker (blue dot)
          const el = document.createElement('div')
          el.innerHTML = `<div class="w-4 h-4 bg-blue-600 border-[3px] border-white rounded-full shadow-lg"></div>`

          const userMk = new mlgl.Marker({ element: el })
            .setLngLat([fromLng, fromLat])
            .addTo(map)

          locationUserMarker.current = userMk

          // Fit bounds to show full route
          const bounds = routeCoords.reduce(function (bounds, coord) {
            return bounds.extend(coord);
          }, new mlgl.LngLatBounds(routeCoords[0], routeCoords[0]));

          map.fitBounds(bounds, { padding: 40 })
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
    if (locationMapInstance.current) {
      if (locationMapInstance.current.getLayer('route-line')) locationMapInstance.current.removeLayer('route-line');
      if (locationMapInstance.current.getSource('route-source')) locationMapInstance.current.removeSource('route-source');
    }
    if (locationUserMarker.current) { locationUserMarker.current.remove(); locationUserMarker.current = null }
    setLocationFromAddress('')
    setLocationRouteInfo(null)
    setShowLocationSuggestions(false)

    // Re-center map on property
    if (locationMapInstance.current && property) {
      const coords = extractCoordinates(property?.location_link)
      const lat = coords ? parseFloat(coords.lat) : 10.3157
      const lng = coords ? parseFloat(coords.lng) : 123.8854
      locationMapInstance.current.flyTo({ center: [lng, lat], zoom: 15 })
    }
  }

  const handleInternalDirections = (e) => {
    e.preventDefault();
    const coords = extractCoordinates(property?.location_link);
    const country = property?.country || 'Philippines'
    const fullAddr = `${property.address}, ${property.city}, ${property?.state_province || ''}, ${country}`;

    // Build query with destination info
    const query = {
      to: fullAddr,
      lat: coords ? coords.lat : undefined,
      lng: coords ? coords.lng : undefined
    };

    // If user typed a "from" address and a route was calculated, pass the from info too
    if (locationFromAddress && locationFromAddress !== 'My Location' && locationRouteInfo) {
      // We need the from coordinates — get them from the user marker on the mini-map
      if (locationUserMarker.current) {
        const latlng = locationUserMarker.current.getLatLng();
        query.from = locationFromAddress;
        query.fromLat = latlng.lat;
        query.fromLng = latlng.lng;
      } else {
        query.from = locationFromAddress;
      }
    }

    router.push({
      pathname: '/getDirections',
      query
    });
  };

  // Open the booking form and hide the main button
  const handleOpenBooking = async () => {
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

    if (isCheckingOccupancy) return

    if (hasActiveOccupancy) {
      showToast.error(`Booking disabled: you already have an active property (${occupiedPropertyTitle || 'a property'}).`, {
        duration: 4000,
        transition: "bounceIn"
      })
      return
    }

    if (property?.landlord) {
      await loadTimeSlots(property.landlord)
    }

    setShowBookingOptions(true)
  }

  // Cancel/Close the form (don't reset selectedSlotId so default date persists)
  const handleCancelBooking = () => {
    setShowBookingOptions(false)
    setBookingNote('')
    setTermsAccepted(false)
    setBookingStep(1)
    setSelectedBookingDate(null)
  }

  // Triggered when confirming the booking
  async function handleConfirmBooking(e) {
    e.preventDefault()

    if (!selectedSlotId) {
      showToast.error("Please select a viewing time.", { duration: 4000, transition: "bounceIn" })
      return
    }

    setSubmitting(true)

    if (isCheckingOccupancy) { setSubmitting(false); return }

    if (hasActiveOccupancy) {
      showToast.error(`Booking disabled: you already have an active property (${occupiedPropertyTitle || 'a property'}).`, {
        duration: 4000,
        transition: "bounceIn"
      })
      setSubmitting(false)
      return
    }

    // 1. Check Active Occupancy
    const { data: activeOccupancy } = await supabase
      .from('tenant_occupancies')
      .select('id')
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
      .in('status', ACTIVE_BOOKING_STATUSES)
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

    // 4. Re-check slot conflict right before insert (best-effort UX guard).
    const { data: existingSlotBooking, error: slotCheckError } = await supabase
      .from('bookings')
      .select('id, time_slot_id')
      .eq('time_slot_id', slot.id)
      .in('status', SLOT_LOCKING_BOOKING_STATUSES)
      .limit(1)
      .maybeSingle()

    const { data: existingScheduleBooking, error: scheduleCheckError } = await supabase
      .from('bookings')
      .select('id, time_slot_id')
      .eq('property_id', id)
      .eq('booking_date', slot.start_time)
      .in('status', SLOT_LOCKING_BOOKING_STATUSES)
      .limit(1)
      .maybeSingle()

    if (slotCheckError || scheduleCheckError) {
      console.error('Failed to re-check slot availability:', slotCheckError)
      if (scheduleCheckError) console.error('Failed to re-check schedule availability:', scheduleCheckError)
      showToast.error('Unable to validate the selected schedule. Please try again.', { duration: 4000, transition: "bounceIn" })
      setSubmitting(false)
      return
    }

    if (existingSlotBooking || existingScheduleBooking) {
      const conflictSlotIds = [
        existingSlotBooking?.time_slot_id,
        existingScheduleBooking?.time_slot_id
      ]
      await markConflictingSlotsBooked(slot, conflictSlotIds)
      await loadTimeSlots(property.landlord)
      setSelectedSlotId('')
      setSelectedBookingDate(null)
      showToast.error('This schedule has just been booked by another user. Please choose a different time slot.', {
        duration: 4000,
        transition: "bounceIn"
      })
      setSubmitting(false)
      return
    }

    // 5. Create Booking
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
      const slotAlreadyTaken = error.code === '23505'
        || error.message?.includes('bookings_unique_active_slot_idx')
        || error.message?.includes('bookings_unique_active_property_datetime_idx')
      if (slotAlreadyTaken) {
        await markConflictingSlotsBooked(slot)
        await loadTimeSlots(property.landlord)
        setSelectedSlotId('')
        setSelectedBookingDate(null)
        showToast.error('This schedule has just been booked by another user. Please choose a different time slot.', {
          duration: 4000,
          transition: "bounceIn"
        })
      } else {
        showToast.error('Error submitting booking: ' + error.message, { duration: 4000, transition: "bounceIn" })
      }
    } else {
      // 6. Update Slot to Booked
      await markConflictingSlotsBooked(slot)

      // 7. Notify Landlord
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

      // 8. SMS Notification
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
      <div className="min-h-[calc(100vh-64px)] bg-[#F3F4F5] px-4 pt-4 pb-0 font-sans">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-start justify-between mb-5 gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-8 w-72 rounded bg-slate-200 skeleton-shimmer" />
              <div className="h-4 w-64 rounded bg-slate-200 skeleton-shimmer" />
            </div>
            <div className="space-y-2 md:text-right">
              <div className="h-9 w-36 rounded bg-slate-200 skeleton-shimmer" />
              <div className="h-4 w-20 rounded bg-slate-200 skeleton-shimmer" />
            </div>
          </div>

          <div className="mb-5 rounded-xl overflow-hidden border border-gray-100 shadow-sm">
            <div className="h-[350px] md:h-[420px] bg-slate-200 skeleton-shimmer" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pb-10">
            <div className="lg:col-span-2 flex flex-col gap-5">
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-6">
                <div className="flex flex-wrap gap-3">
                  <div className="h-16 w-36 rounded-xl bg-slate-200 skeleton-shimmer" />
                  <div className="h-16 w-36 rounded-xl bg-slate-200 skeleton-shimmer" />
                  <div className="h-16 w-36 rounded-xl bg-slate-200 skeleton-shimmer" />
                </div>
                <div className="space-y-3">
                  <div className="h-8 w-64 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-4 w-full rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-4 w-11/12 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-4 w-4/5 rounded bg-slate-200 skeleton-shimmer" />
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="h-6 w-48 rounded bg-slate-200 skeleton-shimmer" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="h-10 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-10 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-10 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-10 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-10 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-10 rounded bg-slate-200 skeleton-shimmer" />
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-3">
                <div className="h-6 w-40 rounded bg-slate-200 skeleton-shimmer" />
                <div className="h-10 w-full rounded-xl bg-slate-200 skeleton-shimmer" />
                <div className="h-10 w-full rounded-xl bg-slate-200 skeleton-shimmer" />
                <div className="h-12 w-full rounded-xl bg-slate-200 skeleton-shimmer" />
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-3">
                <div className="h-5 w-36 rounded bg-slate-200 skeleton-shimmer" />
                <div className="h-4 w-full rounded bg-slate-200 skeleton-shimmer" />
                <div className="h-4 w-3/4 rounded bg-slate-200 skeleton-shimmer" />
              </div>
            </div>
          </div>
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

  const addressSegments = [
    String(property.address || '').trim(),
    String(property.city || '').trim(),
    String(property.state_province || '').trim(),
    String(property.country || 'Philippines').trim()
  ].filter(Boolean)
  const fullAddress = `${addressSegments.join(', ')}${property.zip ? ` ${property.zip}` : ''}`
  const termsLink = property.terms_conditions && property.terms_conditions.startsWith('http')
    ? property.terms_conditions
    : '/terms';

  const propertyAmenities = Array.isArray(property.amenities) ? property.amenities : []
  const hasFreeWater = propertyAmenities.some(a => String(a).toLowerCase() === 'free water')
  const hasFreeElectricity = propertyAmenities.some(a => String(a).toLowerCase() === 'free electricity')

  const rawAdvanceAmount = Number(property.advance_amount || 0)
  const rawSecurityDepositAmount = Number(property.security_deposit_amount || 0)
  const isAdvanceIncluded = property.has_advance === true || rawAdvanceAmount > 0
  const isSecurityDepositIncluded = property.has_security_deposit === true || rawSecurityDepositAmount > 0
  const advanceDisplayAmount = isAdvanceIncluded ? (rawAdvanceAmount > 0 ? rawAdvanceAmount : Number(property.price || 0)) : 0
  const securityDepositDisplayAmount = isSecurityDepositIncluded ? (rawSecurityDepositAmount > 0 ? rawSecurityDepositAmount : Number(property.price || 0)) : 0

  return (
    <>
      <Head>
        <link href="https://unpkg.com/maplibre-gl@5.16.0/dist/maplibre-gl.css" rel="stylesheet" />
      </Head>
      <div className="min-h-[calc(100vh-64px)] bg-[#F3F4F5] px-4 pt-4 pb-0 font-sans">
        <div className="max-w-6xl mx-auto">

          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-start justify-between mb-5 gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{property.title}</h1>

                <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border flex items-center gap-1 w-fit ${property.status === 'available'
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
                      className="cursor-pointer overflow-hidden group w-full h-full relative"
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

                <div className="pb-6 mb-6 border-b border-gray-100">
                  <div className="flex flex-wrap items-stretch gap-3 md:gap-4">
                    <div className="inline-flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-2xl border border-gray-200 min-w-[170px]">
                      <div className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-blue-600"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" /></svg></div>
                      <div className="leading-none">
                        <p className="text-[30px] font-black text-gray-900">{property.bedrooms}</p>
                        <p className="text-[12px] font-bold uppercase tracking-wider text-gray-500">Bedrooms</p>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-2xl border border-gray-200 min-w-[170px]">
                      <div className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-blue-600"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" /></svg></div>
                      <div className="leading-none">
                        <p className="text-[30px] font-black text-gray-900">{property.bathrooms}</p>
                        <p className="text-[12px] font-bold uppercase tracking-wider text-gray-500">Bathrooms</p>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-2xl border border-gray-200 min-w-[170px]">
                      <div className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-blue-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></div>
                      <div className="leading-none">
                        <p className="text-[30px] font-black text-gray-900">{property.area_sqft}</p>
                        <p className="text-[12px] font-bold uppercase tracking-wider text-gray-500">Sq. Ft.</p>
                      </div>
                    </div>

                    {propertyStatsInfo.isTopRated && (
                      <div className="inline-flex items-center gap-2 bg-amber-50 px-3.5 py-2.5 rounded-2xl border border-amber-200 min-w-[190px]">
                        <img src="/toprated.png" alt="Top Rated" className="h-14 w-auto object-contain flex-shrink-0" />
                        <div className="leading-none">
                          <p className="text-[16px] font-bold text-amber-600 uppercase tracking-wider">Top Rated</p>
                        </div>
                      </div>
                    )}

                    {propertyStatsInfo.isMostFavorite && (
                      <div className="inline-flex items-center gap-2 bg-rose-50 px-3.5 py-2.5 rounded-2xl border border-rose-200 min-w-[190px]">
                        <img src="/mostfavorite.png" alt="Most Favorite" className="h-14 w-auto object-contain flex-shrink-0" />
                        <div className="leading-none">
                          <p className="text-[16px] font-bold text-rose-600 uppercase tracking-wider">Most Favorite</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mb-8">
                  <h3 className="text-3xl font-bold text-gray-900 mb-3 uppercase tracking-wider">About this property</h3>
                  <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{property.description || 'No description provided.'}</p>
                </div>

                <div className="pt-6 border-t border-gray-100">
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4">Inclusions & Move-in Terms</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Water</p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-900">Water Billing</p>
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${hasFreeWater ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                          {hasFreeWater ? 'Free' : 'Not Free'}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Electricity</p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-900">Electric Billing</p>
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${hasFreeElectricity ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                          {hasFreeElectricity ? 'Free' : 'Not Free'}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Advance Payment</p>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-gray-900">Status</p>
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${isAdvanceIncluded ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'}`}>
                          {isAdvanceIncluded ? 'Included' : 'Excluded'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 font-semibold">Amount: ₱{Number(advanceDisplayAmount).toLocaleString()}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Security Deposit</p>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-gray-900">Status</p>
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${isSecurityDepositIncluded ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'}`}>
                          {isSecurityDepositIncluded ? 'Included' : 'Excluded'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 font-semibold">Amount: ₱{Number(securityDepositDisplayAmount).toLocaleString()}</p>
                    </div>
                  </div>
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
                    <div className="flex items-center gap-1 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                      <span className="text-xs font-bold text-gray-800">{landlordReviewStats.avg.toFixed(1)}</span>
                      <span className="text-xs text-gray-500">({landlordReviewStats.count} reviews)</span>
                    </div>
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
                <h3 className="text-3xl font-bold text-gray-900 mb-3 uppercase tracking-wider">Property Location</h3>
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
                    {!authChecked || (session && isCheckingOccupancy) ? null : hasActiveOccupancy ? (
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
                            {/* {selectedSlotId && timeSlots.length > 0 && (() => {
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
                            })()} */}
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

                            {/* Date/Time Selection - Step-by-Step Wizard */}
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

                                function formatSlotTime(dateValue) {
                                  return new Date(dateValue).toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })
                                }

                                function formatSlotRange(slot) {
                                  if (!slot?.start_time || !slot?.end_time) return 'N/A'
                                  return `${formatSlotTime(slot.start_time)} - ${formatSlotTime(slot.end_time)}`
                                }

                                const today = new Date()
                                today.setHours(0, 0, 0, 0)

                                const selectedSlot = timeSlots.find(s => s.id === selectedSlotId)

                                // Determine which months have slots
                                const slotDates = Object.keys(slotsByDate)
                                const allMonths = [...new Set(slotDates.map(d => d.substring(0, 7)))].sort()

                                return (
                                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

                                    {/* ===== STEP 1: DATE PICKER (Calendar) ===== */}
                                    {bookingStep === 1 && (
                                      <>
                                        <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50/50">                                          <p className="text-xs font-bold text-gray-900">Select a Date</p>
                                        </div>

                                        {/* Calendar Months */}
                                        <div className="p-3 max-h-[280px] overflow-y-auto">
                                          {allMonths.map(monthKey => {
                                            const [yearStr, monStr] = monthKey.split('-')
                                            const year = parseInt(yearStr)
                                            const month = parseInt(monStr) - 1
                                            const firstDay = new Date(year, month, 1)
                                            const daysInMonth = new Date(year, month + 1, 0).getDate()
                                            const startDow = firstDay.getDay()

                                            const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

                                            const cells = []
                                            for (let i = 0; i < startDow; i++) cells.push(null)
                                            for (let d = 1; d <= daysInMonth; d++) cells.push(d)

                                            return (
                                              <div key={monthKey} className="mb-4 last:mb-0">
                                                <div className="flex items-center justify-center mb-2.5">
                                                  <h4 className="text-xs font-black text-gray-900 tracking-tight">{monthLabel}</h4>
                                                </div>

                                                <div className="grid grid-cols-7 gap-0 mb-1">
                                                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                                    <div key={i} className="text-center text-[9px] font-bold text-gray-400 uppercase py-1">{d}</div>
                                                  ))}
                                                </div>

                                                <div className="grid grid-cols-7 gap-0">
                                                  {cells.map((day, i) => {
                                                    if (day === null) return <div key={`empty-${i}`} className="aspect-square"></div>

                                                    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                                                    const hasSlots = !!slotsByDate[dateKey]
                                                    const dateObj = new Date(year, month, day)
                                                    const isPast = dateObj < today
                                                    const isDisabled = !hasSlots || isPast
                                                    const isToday = dateObj.getTime() === today.getTime()
                                                    const isSelected = selectedBookingDate === dateKey

                                                    return (
                                                      <button
                                                        key={dateKey}
                                                        type="button"
                                                        disabled={isDisabled}
                                                        onClick={() => {
                                                          // Select this date and move to step 2
                                                          setSelectedBookingDate(dateKey)
                                                          const daySlots = slotsByDate[dateKey] || []
                                                          if (daySlots.length > 0) setSelectedSlotId(daySlots[0].id)
                                                          setBookingStep(2)
                                                        }}
                                                        className={`aspect-square flex items-center justify-center text-xs rounded-full transition-all relative
                                                        ${isSelected
                                                            ? 'bg-black text-white font-black shadow-lg'
                                                            : isDisabled
                                                              ? 'text-gray-300 cursor-not-allowed'
                                                              : 'text-gray-800 font-bold hover:bg-gray-100 cursor-pointer'
                                                          }
                                                        ${isToday && !isSelected ? 'ring-1 ring-black ring-offset-1' : ''}
                                                      `}
                                                      >
                                                        {day}
                                                        {hasSlots && !isPast && !isSelected && (
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
                                      </>
                                    )}

                                    {/* ===== STEP 2: TIME SLOT PICKER ===== */}
                                    {bookingStep === 2 && selectedBookingDate && (
                                      <>
                                        {/* Back to date selection */}
                                        <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                          <div>
                                            <p className="text-xs font-bold text-gray-900">Select a Time</p>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setBookingStep(1)}
                                            className="text-[10px] font-bold text-gray-500 hover:text-black flex items-center gap-1 cursor-pointer transition-colors"
                                          >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                            Change Date
                                          </button>
                                        </div>

                                        {/* Selected Date Summary */}
                                        <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-3">
                                          <div className="w-10 h-10 bg-black rounded-lg flex flex-col items-center justify-center text-white flex-shrink-0">
                                            <span className="text-sm font-black leading-none">{new Date(selectedBookingDate + 'T00:00:00').getDate()}</span>
                                            <span className="text-[7px] font-bold uppercase">{new Date(selectedBookingDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</span>
                                          </div>
                                          <div>
                                            <p className="text-xs font-bold text-gray-900">
                                              {new Date(selectedBookingDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                            </p>
                                            <p className="text-[10px] text-gray-500">{(slotsByDate[selectedBookingDate] || []).length} time slot{(slotsByDate[selectedBookingDate] || []).length !== 1 ? 's' : ''} available</p>
                                          </div>
                                        </div>

                                        {/* Available Time Slots */}
                                        <div className="border-b border-gray-200 p-3 space-y-2">
                                          {(() => {
                                            const dateSlots = (slotsByDate[selectedBookingDate] || []).slice()
                                              .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

                                            if (dateSlots.length === 0) {
                                              return (
                                                <div className="text-[10px] text-gray-500 text-center py-2">
                                                  No available slots for this date.
                                                </div>
                                              )
                                            }

                                            return dateSlots.map((slot) => {
                                              const isActive = selectedSlot && slot.id === selectedSlot.id

                                              return (
                                                <button
                                                  key={slot.id}
                                                  type="button"
                                                  onClick={() => setSelectedSlotId(slot.id)}
                                                  className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all cursor-pointer ${isActive
                                                      ? 'border-black bg-gray-50'
                                                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                    }`}
                                                >
                                                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${isActive ? 'border-black' : 'border-gray-300'}`}>
                                                    {isActive && <span className="w-2 h-2 rounded-full bg-black" />}
                                                  </span>
                                                  <span className={`text-xs font-bold ${isActive ? 'text-black' : 'text-gray-700'}`}>
                                                    {formatSlotRange(slot)}
                                                  </span>
                                                </button>
                                              )
                                            })
                                          })()}
                                        </div>

                                        {/* Selected Time Info */}
                                        {selectedSlot && (
                                          <div className="px-3 py-2.5 bg-gray-50/50 flex items-center justify-between">
                                            <div>
                                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Selected Time</p>
                                              <p className="text-xs font-bold text-gray-900">
                                                {formatSlotRange(selectedSlot)}
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-1 text-gray-600">
                                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                              <span className="text-[10px] font-bold">Selected</span>
                                            </div>
                                          </div>
                                        )}
                                      </>
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
                    <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">What this apartment offers</h3>
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
