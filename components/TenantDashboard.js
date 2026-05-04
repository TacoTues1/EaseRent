import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createNotification } from '../lib/notifications'
import {
  attachUpcomingAvailability,
  getPropertyStatusLabel,
  prepareListableProperties
} from '../lib/propertyAvailability'
import { supabase } from '../lib/supabaseClient'
import Footer from './Footer'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from './ui/carousel'

function renderPropertyStatusBadge(property) {
  const hasUpcomingAvailableDate = Boolean(property?.upcoming_available_date)

  return (
    <span
      className={`px-1.5 py-0.5 text-[7px] sm:text-[8px] font-bold rounded shadow-sm backdrop-blur-md leading-tight ${hasUpcomingAvailableDate ? 'normal-case tracking-normal max-w-[9rem] sm:max-w-[11rem]' : 'uppercase tracking-wider'} ${property.status === 'available' ? 'bg-white text-black' : 'bg-black/80 text-white'}`}
    >
      {getPropertyStatusLabel(property)}
    </span>
  )
}

// Helper Component for Bill Rows inside Active Property
function BillRow({ label, icon, value, compact = false }) {
  const icons = {
    lightning: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />,
    water: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />,
    wifi: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />,
    home: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  }

  return (
    <div className={`flex items-center justify-between text-sm ${compact ? 'py-0' : 'py-1'}`}>
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center rounded-lg ${compact ? 'w-6 h-6 bg-gray-50 text-gray-400' : 'w-8 h-8 bg-slate-50 text-slate-500'}`}>
          <svg className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {icons[icon]}
          </svg>
        </div>
        <span className="font-medium text-slate-500">{label}</span>
      </div>
      <span className={`font-bold ${value.includes('Pending') ? 'text-slate-400 italic font-normal' : 'text-slate-700'}`}>
        {value}
      </span>
    </div>
  )
}

const NEARBY_RADIUS_KM = 1

function toRadians(degrees) {
  return degrees * (Math.PI / 180)
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return 6371 * c
}

function extractCoordinates(link) {
  if (!link) return null
  const atMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  const qMatch = link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  const placeMatch = link.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/)
  const genericPairMatch = link.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)
  const match = atMatch || qMatch || placeMatch || genericPairMatch

  if (!match) return null

  const lat = parseFloat(match[1])
  const lng = parseFloat(match[2])

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null

  return { lat, lng }
}

export default function TenantDashboard({ session, profile }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState({})
  const [hoveredPropertyId, setHoveredPropertyId] = useState(null)
  const [activePropertyImageIndex, setActivePropertyImageIndex] = useState(0)
  const [tenantOccupancy, setTenantOccupancy] = useState(null)
  const [pendingPayments, setPendingPayments] = useState([])
  const [paymentHistory, setPaymentHistory] = useState([])
  const [familyPaidBills, setFamilyPaidBills] = useState([])
  const [showEndRequestModal, setShowEndRequestModal] = useState(false)
  const [showEndWarningModal, setShowEndWarningModal] = useState(false)
  const [endRequestDate, setEndRequestDate] = useState('')
  const [endRequestReason, setEndRequestReason] = useState('')
  const [submittingEndRequest, setSubmittingEndRequest] = useState(false)
  const [showCancelEndModal, setShowCancelEndModal] = useState(false)
  const [submittingCancelEnd, setSubmittingCancelEnd] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewTarget, setReviewTarget] = useState(null)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [dontShowReviewAgain, setDontShowReviewAgain] = useState(false)
  const [cleanlinessRating, setCleanlinessRating] = useState(5)
  const [communicationRating, setCommunicationRating] = useState(5)
  const [locationRating, setLocationRating] = useState(5)
  const [landlordRating, setLandlordRating] = useState(5)
  const [comparisonList, setComparisonList] = useState([])
  const [favorites, setFavorites] = useState([])
  const [propertyStats, setPropertyStats] = useState({})
  const [guestFavorites, setGuestFavorites] = useState([])
  const [nearbyProperties, setNearbyProperties] = useState([])
  const [mostFavoriteProperties, setMostFavoriteProperties] = useState([])
  const [topRated, setTopRated] = useState([])
  const [userLocationCity, setUserLocationCity] = useState('')
  const [userLocationCoords, setUserLocationCoords] = useState(null)
  const [locationPermission, setLocationPermission] = useState('prompt')
  const [nextPaymentDate, setNextPaymentDate] = useState(null)
  const [nextPaymentDateLoading, setNextPaymentDateLoading] = useState(true)
  const [lastRentPeriod, setLastRentPeriod] = useState(null)
  const [securityDepositPaid, setSecurityDepositPaid] = useState(false)
  const [familyMembers, setFamilyMembers] = useState([])
  const [showFamilyModal, setShowFamilyModal] = useState(false)
  const [familySearchQuery, setFamilySearchQuery] = useState('')
  const [familySearchResults, setFamilySearchResults] = useState([])
  const [familySearching, setFamilySearching] = useState(false)
  const [addingMember, setAddingMember] = useState(null)
  const [removingMember, setRemovingMember] = useState(null)
  const [leavingFamily, setLeavingFamily] = useState(false)
  const [showLeaveFamilyModal, setShowLeaveFamilyModal] = useState(false)
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null)
  const [loadingFamily, setLoadingFamily] = useState(false)
  const [isFamilyMember, setIsFamilyMember] = useState(false)
  const maxDisplayItems = 7
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [futureOccupancy, setFutureOccupancy] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const searchRef = useRef(null)
  const realtimeSyncTimerRef = useRef(null)
  const realtimeSyncRunningRef = useRef(false)
  const realtimeSyncQueuedRef = useRef(false)
  const nextPaymentCalcTokenRef = useRef(0)
  const setNextPaymentDateSafe = (value) => setNextPaymentDate(value)
  const setLastRentPeriodSafe = (value) => setLastRentPeriod(value)
  const mostFavoriteId = Object.entries(propertyStats).filter(([_, s]) => (s.favorite_count || 0) > 0).sort((a, b) => b[1].favorite_count - a[1].favorite_count)?.[0]?.[0];
  const topRatedId = Object.entries(propertyStats).filter(([_, s]) => (s.review_count || 0) > 0).sort((a, b) => b[1].avg_rating - a[1].avg_rating || b[1].review_count - a[1].review_count)?.[0]?.[0];

  const [mounted, setMounted] = useState(false)

  function getNextBillDate(startDate) {
    if (!startDate) return 'Pending First Payment'
    const start = new Date(startDate)
    const today = new Date()
    let nextDate = new Date(start)
    while (nextDate <= today) {
      nextDate.setDate(nextDate.getDate() + 31)
    }
    return nextDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  function getUpcomingDueDateByDay(dayValue) {
    const parsedDay = Number(dayValue)
    if (!Number.isFinite(parsedDay) || parsedDay < 1 || parsedDay > 31) return 'Not set'

    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    const currentMonthLastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    let dueDate = new Date(today.getFullYear(), today.getMonth(), Math.min(parsedDay, currentMonthLastDay))

    if (dueDate < todayStart) {
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      const nextMonthLastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()
      dueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(parsedDay, nextMonthLastDay))
    }

    return dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }
    const debounceTimer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('id, title, city, price, images, status')
          .eq('is_deleted', false)
          .in('status', ['available', 'occupied'])
          .or(`title.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
          .limit(6)
        if (data && !error) {
          setSearchResults(prepareListableProperties(await attachUpcomingAvailability(data)))
          setShowSearchDropdown(true)
        }
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(debounceTimer)
  }, [searchQuery])

  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [searchRef])

  const handleSearch = () => {
    if (!searchQuery.trim()) return
    router.push(`/properties/allProperties?search=${encodeURIComponent(searchQuery.trim())}`)
  }

  const suggestedSearchProperties = properties.slice(0, 6)

  useEffect(() => {
    if (!hoveredPropertyId) return

    const allProperties = [...properties, ...guestFavorites, ...nearbyProperties, ...mostFavoriteProperties, ...topRated]
    const hoveredProperty = allProperties.find(p => p.id === hoveredPropertyId)
    if (!hoveredProperty || !hoveredProperty.images || !Array.isArray(hoveredProperty.images) || hoveredProperty.images.length <= 1) return

    const interval = setInterval(() => {
      setCurrentImageIndex(prev => {
        const currentIdx = prev[hoveredPropertyId] || 0
        return { ...prev, [hoveredPropertyId]: (currentIdx + 1) % hoveredProperty.images.length }
      })
    }, 1450)

    return () => clearInterval(interval)
  }, [hoveredPropertyId, properties, guestFavorites, nearbyProperties, mostFavoriteProperties, topRated])


  useEffect(() => {
    if (!tenantOccupancy?.property?.images || tenantOccupancy.property.images.length <= 1) return

    const interval = setInterval(() => {
      setActivePropertyImageIndex(prev =>
        (prev + 1) % tenantOccupancy.property.images.length
      )
    }, 1250) 

    return () => clearInterval(interval)
  }, [tenantOccupancy])

  useEffect(() => {
    if (profile) {
      loadInitialData()
    }
  }, [profile])

  async function loadInitialData() {
    await loadProperties()
    await loadPropertyStats()
    const occupancy = await loadTenantOccupancy() 
    let detectedLocationCity = ''
    let detectedLocationCoords = null
    let detectedLocationPermission = locationPermission

    const isOwnOccupancy = occupancy && occupancy.tenant_id === session.user.id
    if (isOwnOccupancy) {
      await loadPendingPayments(occupancy)
      await loadPaymentHistory(occupancy)
    } else {
      const locationResult = await detectUserLocation()
      detectedLocationCity = locationResult.city
      detectedLocationCoords = locationResult.coords
      detectedLocationPermission = locationResult.permission
    }

    await checkPendingReviews(session.user.id)
    await loadUserFavorites()
    await loadFeaturedSections(detectedLocationCity, detectedLocationPermission, detectedLocationCoords)

    if (occupancy) {
      if (isOwnOccupancy) {
        await checkLastMonthDepositLogic(occupancy)
      }
      calculateNextPayment(occupancy.id, occupancy)
    }
    setLoading(false)
  }

  async function syncTenantDashboardRealtime() {
    if (!session?.user?.id) return

    const refreshedOccupancy = await loadTenantOccupancy()
    const isOwnOccupancy = refreshedOccupancy && refreshedOccupancy.tenant_id === session.user.id

    if (isOwnOccupancy) {
      await Promise.all([
        loadPendingPayments(refreshedOccupancy),
        loadPaymentHistory(refreshedOccupancy)
      ])
    } else if (!refreshedOccupancy) {
      setPendingPayments([])
      setPaymentHistory([])
      setFamilyPaidBills([])
    }

    if (refreshedOccupancy) {
      await loadFamilyMembers(refreshedOccupancy)
      calculateNextPayment(refreshedOccupancy.id, refreshedOccupancy)
    } else {
      nextPaymentCalcTokenRef.current += 1
      setNextPaymentDateSafe(null)
      setLastRentPeriodSafe(null)
      setNextPaymentDateLoading(false)
    }

    await Promise.all([
      loadProperties(),
      loadPropertyStats(),
      loadUserFavorites(),
      loadFeaturedSections()
    ])
  }

  useEffect(() => {
    if (!session?.user?.id) return

    const userId = session.user.id

    const runRealtimeSync = async () => {
      if (realtimeSyncRunningRef.current) {
        realtimeSyncQueuedRef.current = true
        return
      }

      realtimeSyncRunningRef.current = true
      try {
        await syncTenantDashboardRealtime()
      } catch (err) {
        console.error('Realtime tenant sync failed:', err)
      } finally {
        realtimeSyncRunningRef.current = false
        if (realtimeSyncQueuedRef.current) {
          realtimeSyncQueuedRef.current = false
          runRealtimeSync()
        }
      }
    }

    const scheduleRealtimeSync = () => {
      if (realtimeSyncTimerRef.current) return
      realtimeSyncTimerRef.current = setTimeout(() => {
        realtimeSyncTimerRef.current = null
        runRealtimeSync()
      }, 300)
    }

    const channels = []
    const subscribeToChanges = (name, config) => {
      const channel = supabase
        .channel(name)
        .on('postgres_changes', config, () => {
          scheduleRealtimeSync()
        })
        .subscribe()
      channels.push(channel)
    }

    subscribeToChanges(`tenant-occ-by-tenant-${userId}`, {
      event: '*',
      schema: 'public',
      table: 'tenant_occupancies',
      filter: `tenant_id=eq.${userId}`
    })

    subscribeToChanges(`tenant-payments-${userId}`, {
      event: '*',
      schema: 'public',
      table: 'payment_requests',
      filter: `tenant=eq.${userId}`
    })

    subscribeToChanges(`tenant-family-self-${userId}`, {
      event: '*',
      schema: 'public',
      table: 'family_members',
      filter: `member_id=eq.${userId}`
    })

    subscribeToChanges(`tenant-favorites-${userId}`, {
      event: '*',
      schema: 'public',
      table: 'favorites',
      filter: `user_id=eq.${userId}`
    })

    if (tenantOccupancy?.id) {
      subscribeToChanges(`tenant-occ-current-${tenantOccupancy.id}`, {
        event: '*',
        schema: 'public',
        table: 'tenant_occupancies',
        filter: `id=eq.${tenantOccupancy.id}`
      })

      subscribeToChanges(`tenant-family-parent-${tenantOccupancy.id}`, {
        event: '*',
        schema: 'public',
        table: 'family_members',
        filter: `parent_occupancy_id=eq.${tenantOccupancy.id}`
      })

      subscribeToChanges(`tenant-payments-occ-${tenantOccupancy.id}`, {
        event: '*',
        schema: 'public',
        table: 'payment_requests',
        filter: `occupancy_id=eq.${tenantOccupancy.id}`
      })
    }

    subscribeToChanges('tenant-properties-live', {
      event: '*',
      schema: 'public',
      table: 'properties'
    })

    subscribeToChanges('tenant-property-stats-live', {
      event: '*',
      schema: 'public',
      table: 'property_stats'
    })

    return () => {
      if (realtimeSyncTimerRef.current) {
        clearTimeout(realtimeSyncTimerRef.current)
        realtimeSyncTimerRef.current = null
      }
      channels.forEach((channel) => {
        supabase.removeChannel(channel)
      })
    }
  }, [session?.user?.id, tenantOccupancy?.id])

  async function checkLastMonthDepositLogic(occupancy) {
    if (!occupancy.contract_end_date) return;

    const endDate = new Date(occupancy.contract_end_date);
    const today = new Date();
    endDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = endDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const renewalPendingOrApproved = occupancy.renewal_requested ||
      occupancy.renewal_status === 'pending' ||
      occupancy.renewal_status === 'approved';

    if (diffDays <= 28 && diffDays > 0 && !renewalPendingOrApproved) {

      const windowStart = new Date(endDate);
      windowStart.setDate(windowStart.getDate() - 40);

      const { data: existingBills } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('occupancy_id', occupancy.id)
        .gte('due_date', windowStart.toISOString().split('T')[0])
        .gt('rent_amount', 0);

      if (existingBills && existingBills.length > 0) {
        return;
      }

      const rentAmount = Number(occupancy.property?.price || 0);
      const depositTotal = Number(occupancy.security_deposit || 0);
      const depositUsed = Number(occupancy.security_deposit_used || 0);
      const availableDeposit = depositTotal - depositUsed;

      if (availableDeposit >= rentAmount) {
        await supabase.from('payment_requests').insert({
          tenant: session.user.id,
          property_id: occupancy.property_id,
          occupancy_id: occupancy.id,
          rent_amount: rentAmount,
          status: 'paid',
          due_date: new Date().toISOString(),
          bills_description: 'Last Month Rent (Paid via Security Deposit)',
          is_move_in_payment: false
        });

        await supabase.from('tenant_occupancies')
          .update({ security_deposit_used: depositUsed + rentAmount })
          .eq('id', occupancy.id);

        showToast.success("Last month rent paid using Security Deposit");
        await createNotification({
          recipient: session.user.id,
          actor: session.user.id,
          type: 'payment_paid',
          link: '/payments'
        });

      } else {
        if (availableDeposit > 0) {
          await supabase.from('tenant_occupancies')
            .update({ security_deposit_used: depositUsed + availableDeposit })
            .eq('id', occupancy.id);
        }

        const lackAmount = rentAmount - availableDeposit;

        await supabase.from('payment_requests').insert({
          tenant: session.user.id,
          property_id: occupancy.property_id,
          occupancy_id: occupancy.id,
          rent_amount: lackAmount,
          status: 'pending',
          due_date: new Date().toISOString(),
          bills_description: `Emergency Bill: Last Month Balance (Deposit Insufficient)`,
          is_move_in_payment: false
        });

        showToast.error(`Emergency Bill generated: ₱${lackAmount.toLocaleString()}`);
        await createNotification({
          recipient: session.user.id,
          actor: session.user.id,
          type: 'payment_pending',
          message: `An emergency bill for ₱${lackAmount.toLocaleString()} has been generated for your last month (Security Deposit was insufficient).`,
          link: '/payments'
        });
      }

      // Refresh data
      loadPendingPayments(occupancy);
      loadTenantOccupancy();
    }
  }

  async function loadPendingPayments(occupancy) {
    const tenantId = occupancy?.tenant_id || session.user.id
    const occupancyId = occupancy?.id
    // Load pending payments for this tenant
    let query = supabase
      .from('payment_requests')
      .select('*')
      .eq('tenant', tenantId)
      .neq('status', 'paid')
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true })

    if (occupancyId) {
      // Allow specific occupancy match OR null (legacy/general)
      query = query.or(`occupancy_id.eq.${occupancyId},occupancy_id.is.null`)
    }

    const { data, error } = await query

    if (error) console.error("Error fetching pending payments:", error)
    if (data) setPendingPayments(data)
  }

  async function loadPaymentHistory(occupancy) {
    const tenantId = occupancy?.tenant_id || session.user.id
    const occupancyId = occupancy?.id
    // Fetch PAID bills for Rent History
    let query = supabase
      .from('payment_requests')
      .select('*')
      .eq('tenant', tenantId)
      .eq('status', 'paid')
      .order('due_date', { ascending: true })

    if (occupancyId) {
      query = query.eq('occupancy_id', occupancyId)
    }

    const { data } = await query
    if (data) setPaymentHistory(data)
  }

  async function calculateNextPayment(occupancyId, occupancy = null) {
    nextPaymentCalcTokenRef.current += 1
    const calculationToken = nextPaymentCalcTokenRef.current
    setNextPaymentDateLoading(true)

    const isStaleCalculation = () => calculationToken !== nextPaymentCalcTokenRef.current
    const setNextPaymentDateSafe = (value) => {
      if (isStaleCalculation()) return
      setNextPaymentDate(value)
    }
    const setLastRentPeriodSafe = (value) => {
      if (isStaleCalculation()) return
      setLastRentPeriod(value)
    }

    try {
      // Use passed occupancy or fall back to state
      const currentOccupancy = occupancy || tenantOccupancy;
      if (!currentOccupancy) {
        setNextPaymentDateSafe(null)
        setLastRentPeriodSafe(null)
        return
      }
      const isOwn = currentOccupancy?.tenant_id === session.user.id;

    const getFirstDueDateFromStart = (startDateValue) => {
      const base = new Date(startDateValue)
      if (Number.isNaN(base.getTime())) return null

      const baseDateOnly = new Date(base)
      baseDateOnly.setHours(0, 0, 0, 0)
      const todayDateOnly = new Date()
      todayDateOnly.setHours(0, 0, 0, 0)

      if (baseDateOnly <= todayDateOnly) {
        const shifted = new Date(base)
        shifted.setMonth(shifted.getMonth() + 1)
        return shifted
      }

      return base
    }

    // 1. Check for pending bills first (including move-in payments)
    let allPendingBills = null;
    let allPaidBills = null;

    if (isOwn) {
      // Primary tenant: query via client
      const { data: pendingData } = await supabase
        .from('payment_requests')
        .select('due_date, is_move_in_payment, occupancy_id, property_id, status')
        .eq('tenant', currentOccupancy.tenant_id)
        .eq('status', 'pending')
        .gt('rent_amount', 0)
        .order('due_date', { ascending: true })
      allPendingBills = pendingData;

      const { data: paidData } = await supabase
        .from('payment_requests')
        .select('due_date, rent_amount, advance_amount, is_advance_payment, is_move_in_payment, property_id, occupancy_id, status')
        .eq('tenant', currentOccupancy.tenant_id)
        .in('status', ['paid', 'pending_confirmation'])
        .gt('rent_amount', 0)
        .order('due_date', { ascending: false })

      const historyPaidBills = (paymentHistory || []).filter(bill => parseFloat(bill?.rent_amount || 0) > 0)
      allPaidBills = historyPaidBills.length > 0 ? historyPaidBills : (paidData || []);
    } else {
      // Family member: use already-loaded state (from API)
      allPendingBills = pendingPayments.filter(p => p.status === 'pending' && parseFloat(p.rent_amount) > 0);
      // Keep next due aligned with the tracker by using paymentHistory first.
      allPaidBills = paymentHistory && paymentHistory.length > 0
        ? [...paymentHistory].sort((a, b) => new Date(b.due_date) - new Date(a.due_date))
        : (familyPaidBills && familyPaidBills.length > 0
          ? familyPaidBills
          : []);
    }

    // Filter to only bills for this occupancy/property, but be lenient
    let pendingBill = null;
    if (allPendingBills && allPendingBills.length > 0) {
      pendingBill = allPendingBills.find(bill => {
        if (occupancyId && bill.occupancy_id === occupancyId) return true;
        if (currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id) return true;
        if (!bill.occupancy_id && currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id) return true;
        return false;
      });
      if (!pendingBill && allPendingBills.length > 0) {
        pendingBill = allPendingBills[0];
      }
    }

    console.log('All paid bills for tenant:', allPaidBills);
    console.log('Occupancy ID:', occupancyId, 'Property ID:', currentOccupancy?.property_id);

    // Filter to only bills for this property/occupancy
    let filteredBills = [];
    if (allPaidBills && allPaidBills.length > 0) {
      filteredBills = allPaidBills.filter(bill => {
        // STRICT FILTER: If bill has an occupancy_id and it doesn't match the current one, EXCLUDE IT
        // This prevents picking up bills from previous leases for the same tenant/property
        if (occupancyId && bill.occupancy_id && bill.occupancy_id !== occupancyId) return false;

        // Match by occupancy_id (most specific)
        if (occupancyId && bill.occupancy_id === occupancyId) return true;
        // Match by property_id (only if bill has no occupancy_id)
        if (currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id && !bill.occupancy_id) return true;

        return false;
      });
    }

    console.log('Filtered paid bills for this occupancy/property:', filteredBills);

    // Choose the bill with the farthest paid-through coverage so older renewal rows
    // do not override newer paid months when calculating next due date.
    const hasRentAmount = (bill) => parseFloat(bill?.rent_amount || 0) > 0

    const getBillCoverageMonths = (bill) => {
      const rentAmount = parseFloat(bill?.rent_amount || 0)
      const advanceAmount = parseFloat(bill?.advance_amount || 0)
      if (rentAmount > 0 && advanceAmount > 0) {
        return 1 + Math.floor(advanceAmount / rentAmount)
      }
      return 1
    }

    const getCoverageEndTime = (bill) => {
      if (!bill?.due_date) return Number.NEGATIVE_INFINITY
      const dueDate = new Date(bill.due_date)
      if (Number.isNaN(dueDate.getTime())) return Number.NEGATIVE_INFINITY

      const monthsCovered = getBillCoverageMonths(bill)
      const endDate = new Date(dueDate)
      endDate.setMonth(endDate.getMonth() + monthsCovered)
      return endDate.getTime()
    }

    const rankableBills = (filteredBills || []).filter(bill => hasRentAmount(bill) && bill?.due_date)
    const lastBill = rankableBills.length > 0
      ? [...rankableBills].sort((a, b) => {
        const coverageDiff = getCoverageEndTime(b) - getCoverageEndTime(a)
        if (coverageDiff !== 0) return coverageDiff
        return new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
      })[0]
      : filteredBills?.[0];

    const coverageEndMs = rankableBills.reduce((max, bill) => {
      const endMs = getCoverageEndTime(bill)
      return endMs > max ? endMs : max
    }, Number.NEGATIVE_INFINITY)
    const coverageEndDate = Number.isFinite(coverageEndMs) ? new Date(coverageEndMs) : null

    // CRITICAL: For newly assigned tenants with NO paid bills, ALWAYS use pending bill if available
    // This MUST happen before any other calculations to prevent "All Paid" from showing
    if (!lastBill) {
      // If we have a pending bill, use it immediately
      if (pendingBill && pendingBill.due_date) {
        const formattedDate = new Date(pendingBill.due_date).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
        });
        setNextPaymentDateSafe(formattedDate);
        setLastRentPeriodSafe("N/A"); // No last payment yet if there's a pending bill
        return; // CRITICAL: Return immediately to prevent any "All Paid" logic
      }

      let aggressivePendingCheck = null;
      if (isOwn) {
        const { data } = await supabase
          .from('payment_requests')
          .select('due_date, occupancy_id, property_id, is_move_in_payment, status')
          .eq('tenant', currentOccupancy.tenant_id)
          .eq('status', 'pending')
          .gt('rent_amount', 0)
          .order('due_date', { ascending: true })
          .limit(5); // Get multiple to see what's available
        aggressivePendingCheck = data;
      } else {
        aggressivePendingCheck = allPendingBills.slice(0, 5);
      }

      if (aggressivePendingCheck && aggressivePendingCheck.length > 0) {
        const validPending = aggressivePendingCheck.find(bill =>
          bill.due_date &&
          (
            (occupancyId && bill.occupancy_id === occupancyId) ||
            (currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id) ||
            (!bill.occupancy_id && currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id) ||
            (!bill.occupancy_id && !bill.property_id) // Accept bills with no IDs for new tenants
          )
        ) || aggressivePendingCheck.find(bill => bill.due_date);

        if (validPending && validPending.due_date) {
          setNextPaymentDateSafe(new Date(validPending.due_date).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
          }));
          setLastRentPeriodSafe("N/A");
          return; // CRITICAL: Return immediately
        }
      }

      // If still no pending bill, derive first due from start_date.
      // For occupancies that already started, first due should be next month.
      console.log('⚠️ No pending bills found at all for newly assigned tenant, using start_date');
      if (currentOccupancy?.start_date) {
        const firstDueDate = getFirstDueDateFromStart(currentOccupancy.start_date) || new Date(currentOccupancy.start_date);
        const formattedDate = firstDueDate.toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
        });
        console.log('✅ Setting nextPaymentDate from start_date fallback:', formattedDate);
        setNextPaymentDateSafe(formattedDate);
        setLastRentPeriodSafe("N/A");
        return; // CRITICAL: Return immediately to prevent "All Paid"
      }
    }

    const baseDateString = currentOccupancy?.start_date;

    if (baseDateString) {
      const startDate = new Date(baseDateString);
      const startDay = startDate.getUTCDate();
      let nextDue;

      if (lastBill && lastBill.due_date) {
        const rentAmount = parseFloat(lastBill.rent_amount || 0);
        const advanceAmount = parseFloat(lastBill.advance_amount || 0);

        let monthsCovered = 1;
        if (rentAmount > 0 && advanceAmount > 0) {
          monthsCovered = 1 + Math.floor(advanceAmount / rentAmount);
        }

        console.log('Next due calculation:', {
          rentAmount,
          advanceAmount,
          monthsCovered,
          billDueDate: lastBill.due_date,
          isMoveIn: lastBill.is_move_in_payment,
          originalDueDate: lastBill.due_date,
          billStatus: lastBill.status
        });

        // Use the farthest paid-through date to avoid older bills anchoring the next due date.
        nextDue = coverageEndDate ? new Date(coverageEndDate) : new Date(lastBill.due_date);

        // Ensure we're working with a valid date
        if (isNaN(nextDue.getTime())) {
          console.error('Invalid date from lastBill.due_date:', lastBill.due_date);
          nextDue = new Date(startDate);
          nextDue.setUTCDate(startDay);
        } else if (!coverageEndDate) {
          // Add months to the due date - CRITICAL: Preserve the day of month
          const originalDate = new Date(nextDue); // Save original for logging
          const currentMonth = nextDue.getMonth();
          const currentYear = nextDue.getFullYear();
          const currentDay = nextDue.getDate(); // Preserve the day (e.g., 6th of the month)

          // Calculate target month and year
          const targetMonth = currentMonth + monthsCovered;
          const targetYear = currentYear + Math.floor(targetMonth / 12);
          let finalMonth = targetMonth % 12;
          if (finalMonth < 0) finalMonth += 12;

          // Set the new date
          nextDue.setFullYear(targetYear);
          nextDue.setMonth(finalMonth);
          nextDue.setDate(currentDay); // Preserve the day of month

          console.log('Calculated next due date:', {
            original: originalDate.toISOString(),
            originalFormatted: originalDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
            calculated: nextDue.toISOString(),
            calculatedFormatted: nextDue.toLocaleDateString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
            }),
            monthsAdded: monthsCovered,
            originalMonth: originalDate.getMonth() + 1,
            calculatedMonth: nextDue.getMonth() + 1,
            monthDifference: (nextDue.getMonth() + 1) - (originalDate.getMonth() + 1),
            preservedDay: currentDay
          });
        } else {
          console.log('Using max coverage end date for next due:', {
            coverageEndDate: coverageEndDate.toISOString(),
            coverageEndFormatted: coverageEndDate.toLocaleDateString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
            })
          });
        }

        // CRITICAL: Set the calculated date and return immediately
        // This prevents any other logic from overriding the calculated next due date
        if (nextDue && !isNaN(nextDue.getTime())) {
          const formattedNextDue = nextDue.toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
          });
          console.log('✅ Setting nextPaymentDate from paid bill calculation:', formattedNextDue);

          // Check contract end date: Only show "All Paid" if the PAID period already covers past contract end
          // CRITICAL: For move-in payments, they only cover 1 month, so we should NEVER show "All Paid" immediately after move-in
          // CRITICAL: For newly assigned tenants (within 3 months), NEVER show "All Paid" - always show the calculated next due date
          if (currentOccupancy.contract_end_date && lastBill) {
            const endDate = new Date(currentOccupancy.contract_end_date);
            const lastPaidDate = new Date(lastBill.due_date);
            const rentAmount = parseFloat(lastBill.rent_amount || 0);
            const advanceAmount = parseFloat(lastBill.advance_amount || 0);

            // Check if this is a move-in payment - move-in payments only cover 1 month
            const isMoveInPayment = lastBill.is_move_in_payment === true;

            let monthsCoveredByPayment = 1;
            if (rentAmount > 0 && advanceAmount > 0) {
              monthsCoveredByPayment = 1 + Math.floor(advanceAmount / rentAmount);
            }

            // Calculate when the paid period ends
            const paidPeriodEnd = coverageEndDate ? new Date(coverageEndDate) : new Date(lastPaidDate);
            if (!coverageEndDate) {
              paidPeriodEnd.setMonth(paidPeriodEnd.getMonth() + monthsCoveredByPayment);
            }

            // CRITICAL: For move-in payments, they only cover the first month
            // The next due date should be start_date + 1 month, not "All Paid"
            if (isMoveInPayment) {
              console.log('Move-in payment detected - showing calculated next due date, not "All Paid"');
              // The nextDue is already calculated correctly above, just use it
              setNextPaymentDateSafe(formattedNextDue);
              if (lastBill) {
                const lastDate = new Date(lastBill.due_date);
                setLastRentPeriodSafe(lastDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
              } else {
                setLastRentPeriodSafe("N/A");
              }
              return; // Return immediately for move-in payments
            }

            // Only show "All Paid" if the paid period already extends past contract end
            // BUT first check if there are any pending bills - if so, don't show "All Paid"
            if (paidPeriodEnd >= endDate) {
              // Before showing "All Paid", check for pending bills one more time
              let finalPendingCheck = null;
              if (isOwn) {
                const { data } = await supabase
                  .from('payment_requests')
                  .select('due_date, occupancy_id, property_id')
                  .eq('tenant', currentOccupancy.tenant_id)
                  .eq('status', 'pending')
                  .gt('rent_amount', 0)
                  .order('due_date', { ascending: true })
                  .limit(1)
                  .maybeSingle();
                finalPendingCheck = data;
              } else {
                finalPendingCheck = allPendingBills && allPendingBills.find(p => p?.due_date);
              }

              if (finalPendingCheck && finalPendingCheck.due_date) {
                // There's a pending bill, use it instead of "All Paid"
                console.log('⚠️ Found pending bill even though paid period extends past contract end, using pending bill:', finalPendingCheck.due_date);
                setNextPaymentDateSafe(new Date(finalPendingCheck.due_date).toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
                }));
                setLastRentPeriodSafe(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
                return;
              }

              // No pending bills found, show "All Paid"
              console.log('Paid period already covers past contract end, showing "All Paid"');
              setNextPaymentDateSafe("All Paid - Contract Ending");
              setLastRentPeriodSafe(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
              return;
            }
          }

          // Set the calculated next due date
          console.log('✅ FINAL: Setting nextPaymentDate to:', formattedNextDue);
          setNextPaymentDateSafe(formattedNextDue);

          if (lastBill) {
            const lastDate = new Date(lastBill.due_date);
            setLastRentPeriodSafe(lastDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
          } else {
            setLastRentPeriodSafe("N/A");
          }
          return; // IMPORTANT: Return immediately to prevent any other code from overriding
        }
      } else {
        console.log('No lastBill found, using start_date:', baseDateString);

        // CRITICAL: For newly assigned tenants with no paid bills, ALWAYS check for pending bills FIRST
        // This must happen BEFORE any contract end date checks to prevent "All Paid" from showing incorrectly
        if (!pendingBill) {
          // Check for ANY pending bill (move-in or regular rent bill)
          let anyPendingBillData = null;
          if (isOwn) {
            const { data } = await supabase
              .from('payment_requests')
              .select('due_date, occupancy_id, property_id, is_move_in_payment')
              .eq('tenant', currentOccupancy.tenant_id)
              .eq('status', 'pending')
              .gt('rent_amount', 0)
              .order('due_date', { ascending: true })
              .limit(1)
              .maybeSingle();
            anyPendingBillData = data;
          } else {
            anyPendingBillData = allPendingBills && allPendingBills.length > 0 ? allPendingBills[0] : null;
          }

          const anyPendingBill = anyPendingBillData;

          if (anyPendingBill && anyPendingBill.due_date) {
            // Check if it matches this occupancy/property (be lenient for newly assigned tenants)
            const matches = (occupancyId && anyPendingBill.occupancy_id === occupancyId) ||
              (currentOccupancy?.property_id && anyPendingBill.property_id === currentOccupancy.property_id) ||
              (!anyPendingBill.occupancy_id && currentOccupancy?.property_id && anyPendingBill.property_id === currentOccupancy.property_id) ||
              (!anyPendingBill.occupancy_id && !anyPendingBill.property_id); // If bill has no IDs, use it anyway for new tenants

            if (matches) {
              console.log('✅ Found pending bill for newly assigned tenant, using its due date:', anyPendingBill.due_date);
              setNextPaymentDateSafe(new Date(anyPendingBill.due_date).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
              }));
              setLastRentPeriodSafe("N/A");
              return; // CRITICAL: Return immediately to prevent "All Paid" logic
            }
          }
        } else if (pendingBill && pendingBill.due_date) {
          // We already have a pending bill from earlier, use it
          console.log('✅ Using existing pending bill for newly assigned tenant:', pendingBill.due_date);
          setNextPaymentDateSafe(new Date(pendingBill.due_date).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
          }));
          setLastRentPeriodSafe("N/A");
          return; // CRITICAL: Return immediately to prevent "All Paid" logic
        }

        const projected = getFirstDueDateFromStart(startDate) || new Date(startDate)
        nextDue = projected
        nextDue.setUTCDate(startDay);
      }

      // Only reach here if we didn't have a paid bill to calculate from
      // Check contract end date
      if (currentOccupancy.contract_end_date) {
        const endDate = new Date(currentOccupancy.contract_end_date);

        // Only show "All Paid" if the PAID period already covers past contract end
        // Don't show "All Paid" just because next due date exceeds contract end - tenant hasn't paid for that month yet!
        if (nextDue >= endDate && lastBill) {
          const lastPaidDate = new Date(lastBill.due_date);
          const rentAmount = parseFloat(lastBill.rent_amount || 0);
          const advanceAmount = parseFloat(lastBill.advance_amount || 0);
          let monthsCoveredByPayment = 1;
          if (rentAmount > 0 && advanceAmount > 0) {
            monthsCoveredByPayment = 1 + Math.floor(advanceAmount / rentAmount);
          }

          // Calculate when the paid period ends
          const paidPeriodEnd = new Date(lastPaidDate);
          paidPeriodEnd.setMonth(paidPeriodEnd.getMonth() + monthsCoveredByPayment);

          // Only show "All Paid" if the paid period already extends past contract end
          if (paidPeriodEnd >= endDate) {
            // Check if this is likely an error (contract end is far in future but we only covered limited months)
            // If contract ends more than 35 days from now, do NOT show "All Paid"
            const today = new Date();
            const timeDiff = endDate - today;
            const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

            if (daysDiff > 45) {
              console.log('⚠️ Paid period >= endDate but endDate is far away (' + daysDiff + ' days). Assuming calculation sync issue. Showing calculated date.');
              setNextPaymentDateSafe(formattedNextDue);
              setLastRentPeriodSafe(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
              return;
            }

            setNextPaymentDateSafe("All Paid - Contract Ending");
            setLastRentPeriodSafe(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
            return;
          }
          // If paid period doesn't extend past contract end, show the calculated next due date
          console.log('Paid period does not extend past contract end, showing calculated next due date');
        }

        // CRITICAL: For newly assigned tenants with no paid bills, NEVER show "All Paid"
        // Even if nextDue >= endDate, if there's no paid bill, we should show the start_date or pending bill
        // Only show "All Paid" if there's actually a paid bill that covers past the contract end
        if (nextDue >= endDate && !lastBill) {
          // This should never happen for newly assigned tenants because we already checked for pending bills above
          // But as a safety net, use start_date instead of "All Paid"
          console.log('⚠️ No paid bills and nextDue >= endDate, but no pending bills found. Using start_date instead of "All Paid"');
          setNextPaymentDateSafe(nextDue.toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
          }));
          setLastRentPeriodSafe("N/A");
          return;
        }
      }

      // Fallback: Use calculated nextDue (from start_date if no paid bill)
      setNextPaymentDateSafe(nextDue.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
      }))

      if (lastBill) {
        const lastDate = new Date(lastBill.due_date);
        setLastRentPeriodSafe(lastDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
      } else {
        setLastRentPeriodSafe("N/A");
      }

    } else {
      if (lastBill && lastBill.due_date) {
        const rentAmount = parseFloat(lastBill.rent_amount || 0);
        const advanceAmount = parseFloat(lastBill.advance_amount || 0);

        let monthsCovered = 1;
        if (rentAmount > 0 && advanceAmount > 0) {
          monthsCovered = 1 + Math.floor(advanceAmount / rentAmount);
        }

        console.log('Next due calculation (no baseDate):', {
          rentAmount,
          advanceAmount,
          monthsCovered,
          billDueDate: lastBill.due_date,
          isMoveIn: lastBill.is_move_in_payment
        });

        const d = coverageEndDate ? new Date(coverageEndDate) : new Date(lastBill.due_date);
        const originalDate = new Date(d); // Save original for logging

        if (!coverageEndDate) {
          const currentMonth = d.getMonth();
          const currentYear = d.getFullYear();
          const currentDay = d.getDate(); // Preserve the day of month

          // Calculate target month and year
          const targetMonth = currentMonth + monthsCovered;
          const targetYear = currentYear + Math.floor(targetMonth / 12);
          let finalMonth = targetMonth % 12;
          if (finalMonth < 0) finalMonth += 12;

          // Set the new date
          d.setFullYear(targetYear);
          d.setMonth(finalMonth);
          d.setDate(currentDay); // Preserve the day of month
        }

        console.log('Calculated next due date (no baseDate):', {
          original: originalDate.toISOString(),
          originalFormatted: originalDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
          calculated: d.toISOString(),
          calculatedFormatted: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
          monthsAdded: monthsCovered,
          monthDifference: (d.getMonth() + 1) - (originalDate.getMonth() + 1)
        });

        if (currentOccupancy?.contract_end_date) {
          const endDate = new Date(currentOccupancy.contract_end_date);
          // Only show "All Paid" if the PAID period already covers past contract end
          const lastPaidDate = new Date(lastBill.due_date);
          const paidPeriodEnd = coverageEndDate ? new Date(coverageEndDate) : new Date(lastPaidDate);
          if (!coverageEndDate) {
            paidPeriodEnd.setMonth(paidPeriodEnd.getMonth() + monthsCovered);
          }

          // Only show "All Paid" if the paid period already extends past contract end
          if (paidPeriodEnd >= endDate) {
            setNextPaymentDateSafe("All Paid - Contract Ending");
            return;
          }
          // Otherwise, show the calculated next due date
        }

        setNextPaymentDateSafe(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }));
      } else {
        setNextPaymentDateSafe("N/A");
      }
    }
    } catch (error) {
      console.error('Failed to calculate next payment date:', error)
      setNextPaymentDateSafe('N/A')
      setLastRentPeriodSafe('N/A')
    } finally {
      if (!isStaleCalculation()) {
        setNextPaymentDateLoading(false)
      }
    }
  }

  useEffect(() => {
    if (tenantOccupancy) calculateNextPayment(tenantOccupancy.id, tenantOccupancy)
  }, [pendingPayments, tenantOccupancy, familyPaidBills, paymentHistory])

  async function checkPendingReviews(userId) {
    // Fetch ended occupancies that haven't been dismissed for review
    const { data: endedOccupancies } = await supabase
      .from('tenant_occupancies')
      .select('*, property:properties(id, title)')
      .eq('tenant_id', userId)
      .eq('status', 'ended')
      .neq('review_dismissed', true)
      .order('created_at', { ascending: false })

    if (!endedOccupancies || endedOccupancies.length === 0) return

    const { data: existingReviews } = await supabase.from('reviews').select('occupancy_id').eq('user_id', userId)
    const reviewedOccupancyIds = existingReviews?.map(r => r.occupancy_id) || []

    // Find first occupancy that is ENDED and NOT REVIEWED
    const unreviewed = endedOccupancies.find(o =>
      !reviewedOccupancyIds.includes(o.id)
    )

    if (unreviewed) {
      setReviewTarget(unreviewed)
      setShowReviewModal(true)
    }
  }

  // Close the modal — if "don't show again" is checked, permanently dismiss in DB
  async function handleCancelReview() {
    if (dontShowReviewAgain && reviewTarget) {
      await supabase
        .from('tenant_occupancies')
        .update({ review_dismissed: true })
        .eq('id', reviewTarget.id)
    }
    setShowReviewModal(false)
    setDontShowReviewAgain(false)
  }

  // Skip Review — ALWAYS permanently dismisses the review in DB
  async function handleSkipReview() {
    if (reviewTarget) {
      await supabase
        .from('tenant_occupancies')
        .update({ review_dismissed: true })
        .eq('id', reviewTarget.id)
    }
    setShowReviewModal(false)
    setDontShowReviewAgain(false)
  }

  async function submitReview() {
    if (!reviewTarget) return
    setSubmittingReview(true)
    const overallRating = Math.round((cleanlinessRating + communicationRating + locationRating) / 3)
    const { error } = await supabase.from('reviews').insert({
      property_id: reviewTarget.property_id,
      user_id: session.user.id,
      tenant_id: session.user.id,
      occupancy_id: reviewTarget.id,
      rating: overallRating,
      cleanliness_rating: cleanlinessRating,
      communication_rating: communicationRating,
      location_rating: locationRating,
      comment: reviewComment,
      created_at: new Date().toISOString()
    })
    if (error) {
      showToast.error("Failed to submit review")
      console.error(error)
    } else {
      const { error: landlordRatingError } = await supabase
        .from('landlord_ratings')
        .upsert({
          landlord_id: reviewTarget.landlord_id,
          tenant_id: session.user.id,
          occupancy_id: reviewTarget.id,
          rating: landlordRating,
          created_at: new Date().toISOString()
        }, { onConflict: 'tenant_id,occupancy_id' })

      if (landlordRatingError) {
        console.error('Failed to submit landlord rating:', landlordRatingError)
        showToast.error('Property review saved, but landlord rating failed.')
      }

      showToast.success("Review submitted successfully!")
      setShowReviewModal(false)
      setCleanlinessRating(5)
      setCommunicationRating(5)
      setLocationRating(5)
      setLandlordRating(5)
      setReviewComment('')
      setDontShowReviewAgain(false)
      checkPendingReviews(session.user.id)
    }
    setSubmittingReview(false)
  }

  const toggleComparison = (e, property) => {
    e.stopPropagation()
    setComparisonList(prev => {
      const isSelected = prev.some(p => p.id === property.id)
      if (isSelected) return prev.filter(p => p.id !== property.id)
      if (prev.length >= 3) {
        showToast.error("You can only compare up to 3 properties.")
        return prev
      }
      return [...prev, property]
    })
  }

  const handleCompareClick = () => { const ids = comparisonList.map(p => p.id).join(','); router.push(`/compare?ids=${ids}`) }

  async function loadProperties() {
    let query = supabase
      .from('properties')
      .select('*, landlord_profile:profiles!properties_landlord_fkey(id, first_name, middle_name, last_name, role)')
      .eq('is_deleted', false)
      .in('status', ['available', 'occupied'])
    const { data, error } = await query
    if (error) console.error('Error loading properties:', error)
    const propsWithAvailability = await attachUpcomingAvailability(data || [])
    const randomized = prepareListableProperties(propsWithAvailability).sort(() => Math.random() - 0.5)
    setProperties(randomized)
  }

  const handleSeeMore = () => { router.push('/properties/allProperties') }

  async function loadTenantOccupancy() {
    const { data: occupancy, error } = await supabase
      .from('tenant_occupancies')
      .select(`*, property:properties(id, title, address, city, images, price, terms_conditions, amenities), landlord:profiles!tenant_occupancies_landlord_id_fkey(id, first_name, middle_name, last_name)`)
      .eq('tenant_id', session.user.id)
      .in('status', ['active', 'pending_end'])
      .lte('start_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    let finalOccupancy = occupancy

    if (error) {
      console.error("Error fetching occupancy:", error)
      return null
    }

    if (!finalOccupancy) {
      // Check for FUTURE occupancy (start_date > now)
      const { data: futureOcc } = await supabase
        .from('tenant_occupancies')
        .select(`*, property:properties(id, title, address, city, images, price), landlord:profiles!tenant_occupancies_landlord_id_fkey(id, first_name, middle_name, last_name)`)
        .eq('tenant_id', session.user.id)
        .eq('status', 'active')
        .gt('start_date', new Date().toISOString())
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle()
      
      setFutureOccupancy(futureOcc || null)

      // Check if user is a family member via API (bypasses RLS)
      try {
        const fmRes = await fetch(`/api/family-members?member_id=${session.user.id}`, { cache: 'no-store' })
        const fmData = await fmRes.json()
        if (fmData?.occupancy) {
          finalOccupancy = fmData.occupancy
          // Set payment data directly from API (bypasses RLS)
          if (fmData.pendingPayments) setPendingPayments(fmData.pendingPayments)
          if (fmData.paymentHistory) setPaymentHistory(fmData.paymentHistory)
          if (fmData.allPaidBills) setFamilyPaidBills(fmData.allPaidBills)
          if (fmData.securityDepositPaid !== undefined) setSecurityDepositPaid(fmData.securityDepositPaid)
        }
      } catch (err) {
        console.error('Family member check error:', err)
      }
      if (!finalOccupancy) {
        setTenantOccupancy(null)
        setIsFamilyMember(false)
        setFamilyMembers([])
        setPendingPayments([])
        setPaymentHistory([])
        setFamilyPaidBills([])
        setSecurityDepositPaid(false)
        return null
      }
    }

  setTenantOccupancy(finalOccupancy)

    if (finalOccupancy) {
      setFutureOccupancy(null)
      const isOwn = finalOccupancy.tenant_id === session.user.id

      if (isOwn) {
        // Check if security deposit was actually paid (look for any paid payment with security_deposit_amount > 0)
        const { data: paidSecurityDeposit } = await supabase
          .from('payment_requests')
          .select('security_deposit_amount')
          .eq('occupancy_id', finalOccupancy.id)
          .eq('status', 'paid')
          .gt('security_deposit_amount', 0)
          .limit(1)
          .maybeSingle()

        setSecurityDepositPaid(!!paidSecurityDeposit)
      }
      // Family members: data was already set from the API response above

      // Determine if they are a family member
      setIsFamilyMember(!isOwn)
    }

    return finalOccupancy
  }

  async function leaveFamilyGroup() {
    if (!isFamilyMember) return

    setLeavingFamily(true)
    try {
      const res = await fetch('/api/family-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'leave',
          member_id: session.user.id
        })
      })

      let data = {}
      try {
        data = await res.json()
      } catch (_parseErr) {
        data = {}
      }

      if (!res.ok || !data.success) {
        showToast.error(data.error || `Failed to leave family group (Error ${res.status})`)
        setLeavingFamily(false)
        return
      }

      showToast.success('You have left the family group')
      setShowLeaveFamilyModal(false)
      await loadTenantOccupancy()
      await loadProperties()
    } catch (err) {
      showToast.error('Failed to leave family group')
    }
    setLeavingFamily(false)
  }

  function openLeaveFamilyModal() {
    if (!isFamilyMember || leavingFamily) return
    setShowLeaveFamilyModal(true)
  }

  function closeLeaveFamilyModal() {
    if (leavingFamily) return
    setShowLeaveFamilyModal(false)
  }

  async function detectUserLocation() {
    if (typeof window === 'undefined' || !navigator?.geolocation) {
      setLocationPermission('unavailable')
      setUserLocationCity('')
      setUserLocationCoords(null)
      return { permission: 'unavailable', city: '', coords: null }
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords
            const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
            const data = await response.json()
            const city = (data?.city || data?.locality || data?.principalSubdivision || '').trim()
            const coords = { lat: latitude, lng: longitude }

            setLocationPermission('granted')
            setUserLocationCity(city)
            setUserLocationCoords(coords)
            resolve({ permission: 'granted', city, coords })
          } catch (err) {
            console.error('Location reverse-geocode failed:', err)
            const coords = { lat: position.coords.latitude, lng: position.coords.longitude }
            setLocationPermission('granted')
            setUserLocationCity('')
            setUserLocationCoords(coords)
            resolve({ permission: 'granted', city: '', coords })
          }
        },
        (error) => {
          const permission = error?.code === 1 ? 'denied' : 'unavailable'
          setLocationPermission(permission)
          setUserLocationCity('')
          setUserLocationCoords(null)
          resolve({ permission, city: '', coords: null })
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      )
    })
  }

  async function loadUserFavorites() {
    if (!session) return
    const { data } = await supabase.from('favorites').select('property_id').eq('user_id', session.user.id)
    if (data) setFavorites(data.map(f => f.property_id))
  }

  async function loadPropertyStats() {
    const { data } = await supabase.from('property_stats').select('*')
    if (data) {
      const statsMap = {}
      data.forEach(stat => { statsMap[stat.property_id] = { favorite_count: stat.favorite_count || 0, avg_rating: stat.avg_rating || 0, review_count: stat.review_count || 0 } })
      setPropertyStats(statsMap)
    }
  }

  async function loadFeaturedSections(locationCityOverride = '', locationPermissionOverride = locationPermission, locationCoordsOverride = null) {
    const { data: allProps } = await supabase.from('properties').select('*, landlord_profile:profiles!properties_landlord_fkey(first_name, last_name)').eq('is_deleted', false).in('status', ['available', 'occupied'])
    const { data: stats } = await supabase.from('property_stats').select('*')

    if (allProps && stats) {
      const listableProps = prepareListableProperties(await attachUpcomingAvailability(allProps))
      const statsMap = {}
      stats.forEach(s => {
        statsMap[s.property_id] = { favorite_count: s.favorite_count || 0, avg_rating: s.avg_rating || 0, review_count: s.review_count || 0 }
      })
      setPropertyStats(statsMap)

      const effectiveLocationCity = (locationCityOverride || userLocationCity || '').toLowerCase()
      if (locationPermissionOverride === 'granted' && effectiveLocationCity) {
        const favs = listableProps
          .filter(p => {
            const propertyCity = (p.city || '').toLowerCase()
            return propertyCity.includes(effectiveLocationCity) || effectiveLocationCity.includes(propertyCity)
          })
        setGuestFavorites(favs)
      } else {
        setGuestFavorites([])
      }

      const effectiveLocationCoords = locationCoordsOverride || userLocationCoords
      if (
        locationPermissionOverride === 'granted' &&
        Number.isFinite(effectiveLocationCoords?.lat) &&
        Number.isFinite(effectiveLocationCoords?.lng)
      ) {
        const nearby = listableProps
          .map((property) => {
            const coords = extractCoordinates(property.location_link)
            if (!coords) return null

            const distanceKm = getDistanceFromLatLonInKm(
              effectiveLocationCoords.lat,
              effectiveLocationCoords.lng,
              coords.lat,
              coords.lng
            )

            if (distanceKm > NEARBY_RADIUS_KM) return null
            return { property, distanceKm }
          })
          .filter(Boolean)
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .map(({ property }) => property)

        setNearbyProperties(nearby)
      } else {
        setNearbyProperties([])
      }

      const mostFavorited = listableProps
        .filter((property) => (statsMap[property.id]?.favorite_count || 0) > 0)
        .sort((a, b) => {
          const favoriteDiff = (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0)
          if (favoriteDiff !== 0) return favoriteDiff

          const ratingDiff = (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0)
          if (ratingDiff !== 0) return ratingDiff

          const reviewDiff = (statsMap[b.id]?.review_count || 0) - (statsMap[a.id]?.review_count || 0)
          if (reviewDiff !== 0) return reviewDiff

          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        })
      setMostFavoriteProperties(mostFavorited)

      const rated = listableProps
        .filter((property) => (statsMap[property.id]?.review_count || 0) > 0)
        .sort((a, b) => {
          const favoriteDiff = (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0)
          if (favoriteDiff !== 0) return favoriteDiff

          const ratingDiff = (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0)
          if (ratingDiff !== 0) return ratingDiff

          const reviewDiff = (statsMap[b.id]?.review_count || 0) - (statsMap[a.id]?.review_count || 0)
          if (reviewDiff !== 0) return reviewDiff

          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        })
      setTopRated(rated)
    }
  }

  async function toggleFavorite(e, propertyId) {
    e.stopPropagation()
    if (!session) {
      showToast.error('Please login to save favorites')
      return
    }
    const isFavorite = favorites.includes(propertyId)
    if (isFavorite) {
      await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('property_id', propertyId)
      setFavorites(favorites.filter(id => id !== propertyId))
      showToast.success('Removed from favorites')
    } else {
      await supabase.from('favorites').insert({ user_id: session.user.id, property_id: propertyId })
      setFavorites([...favorites, propertyId])
      showToast.success("Added to favorites")
    }
    loadPropertyStats(); loadFeaturedSections()
  }

  async function requestEndOccupancy() {
    if (!tenantOccupancy || !endRequestDate || !endRequestReason) {
      showToast.error("Please fill in both Date and Reason");
      return;
    }
    setShowEndWarningModal(true)
  }

  async function confirmRequestEndOccupancy() {
    setShowEndWarningModal(false)
    setSubmittingEndRequest(true)

    // Check for pending payments before allowing end request
    const { data: pendingBills, error: pendingError } = await supabase
      .from('payment_requests')
      .select('id')
      .eq('occupancy_id', tenantOccupancy.id)
      .in('status', ['pending', 'pending_confirmation'])
      .limit(1)

    if (pendingError) {
      console.error('Error checking pending payments:', pendingError)
    }

    if (pendingBills && pendingBills.length > 0) {
      showToast.error("You cannot end your contract while you have pending payments. Please settle all outstanding bills first.", { duration: 6000, progress: true, position: 'top-center', transition: 'bounceIn' })
      setSubmittingEndRequest(false)
      return
    }

    const { error } = await supabase.from('tenant_occupancies').update({ status: 'pending_end', end_requested_at: new Date().toISOString(), end_request_reason: endRequestReason.trim(), end_request_date: endRequestDate, end_request_status: 'pending' }).eq('id', tenantOccupancy.id)

    if (error) {
      showToast.error(`Failed to submit: ${error.message}`)
      setSubmittingEndRequest(false); return
    }

    await createNotification({ recipient: tenantOccupancy.landlord_id, actor: session.user.id, type: 'end_occupancy_request', message: `${profile.first_name} ${profile.last_name} requested to end occupancy on ${endRequestDate}.`, link: '/dashboard' })
    showToast.success("Request submitted")
    setShowEndRequestModal(false); setEndRequestReason(''); setEndRequestDate(''); setSubmittingEndRequest(false); loadTenantOccupancy()
  }

  async function cancelEndOccupancyRequest() {
    if (!tenantOccupancy) return
    setSubmittingCancelEnd(true)

    // Set status to cancel_pending for landlord approval
    const { error } = await supabase
      .from('tenant_occupancies')
      .update({ 
        end_request_status: 'cancel_pending' 
      })
      .eq('id', tenantOccupancy.id)

    if (error) {
      showToast.error(`Failed to submit cancellation: ${error.message}`)
      setSubmittingCancelEnd(false)
      return
    }

    await createNotification({ 
      recipient: tenantOccupancy.landlord_id, 
      actor: session.user.id, 
      type: 'payment_pending', // Using a generic type or creating a new one if available
      message: `${profile.first_name} ${profile.last_name} requested to CANCEL their move-out for ${tenantOccupancy.property?.title}.`, 
      link: '/dashboard' 
    })

    showToast.success("Cancellation request submitted to landlord.")
    setShowCancelEndModal(false)
    setSubmittingCancelEnd(false)
    loadTenantOccupancy()
  }

  // ─── FAMILY MEMBERS FUNCTIONS ───
  async function loadFamilyMembers(occupancyOverride = null) {
    const occupancySource = occupancyOverride || tenantOccupancy
    if (!occupancySource) return
    // Only load family for the primary tenant (not family members themselves)
    // But if they are a family member, we use their parent_occupancy_id
    const occId = occupancySource.is_family_member ? occupancySource.parent_occupancy_id : occupancySource.id
    if (!occId) return
    setLoadingFamily(true)
    try {
      const res = await fetch(`/api/family-members?occupancy_id=${occId}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.members) setFamilyMembers(data.members)
    } catch (err) {
      console.error('Failed to load family members:', err)
    }
    setLoadingFamily(false)
  }

  useEffect(() => {
    if (tenantOccupancy) loadFamilyMembers()
  }, [tenantOccupancy])

  async function searchFamilyMember(query) {
    if (!query || query.trim().length < 2) {
      setFamilySearchResults([])
      return
    }
    setFamilySearching(true)
    try {
      const excludeIds = [session.user.id, ...familyMembers.map(m => m.member_id)]
      const res = await fetch('/api/family-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', query: query.trim(), exclude_ids: excludeIds })
      })
      const data = await res.json()
      if (data.results) setFamilySearchResults(data.results)
    } catch (err) {
      console.error('Family search error:', err)
    }
    setFamilySearching(false)
  }

  useEffect(() => {
    if (!familySearchQuery.trim()) { setFamilySearchResults([]); return }
    const timer = setTimeout(() => searchFamilyMember(familySearchQuery), 400)
    return () => clearTimeout(timer)
  }, [familySearchQuery])

  useEffect(() => {
    if (!showFamilyModal) return

    const originalOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    function handleFamilyModalKeydown(event) {
      if (event.key === 'Escape') {
        closeFamilyModal()
      }
    }

    document.addEventListener('keydown', handleFamilyModalKeydown)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleFamilyModalKeydown)
    }
  }, [showFamilyModal])

  function openFamilyModal() {
    setFamilySearchQuery('')
    setFamilySearchResults([])
    setShowFamilyModal(true)
  }

  function closeFamilyModal() {
    setShowFamilyModal(false)
    setFamilySearchQuery('')
    setFamilySearchResults([])
    setFamilySearching(false)
  }

  function closeEndRequestModal() {
    setShowEndRequestModal(false)
    setEndRequestDate('')
    setEndRequestReason('')
  }

  async function addFamilyMember(memberId) {
    if (!tenantOccupancy || isFamilyMember) return
    setAddingMember(memberId)
    try {
      const res = await fetch('/api/family-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          parent_occupancy_id: tenantOccupancy.id,
          member_id: memberId,
          mother_id: session.user.id
        })
      })
      const data = await res.json()
      if (data.success) {
        showToast.success('Family member added successfully!')
        setFamilySearchQuery('')
        setFamilySearchResults([])
        loadFamilyMembers()
      } else {
        showToast.error(data.error || 'Failed to add family member')
      }
    } catch (err) {
      showToast.error('Failed to add family member')
    }
    setAddingMember(null)
  }

  async function removeFamilyMember(familyMemberId) {
    if (!tenantOccupancy || isFamilyMember) return
    setRemovingMember(familyMemberId)
    try {
      const res = await fetch('/api/family-members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family_member_id: familyMemberId,
          mother_id: session.user.id
        })
      })
      const data = await res.json()
      if (data.success) {
        showToast.success('Family member removed')
        loadFamilyMembers()
      } else {
        showToast.error(data.error || 'Failed to remove family member')
      }
    } catch (err) {
      showToast.error('Failed to remove family member')
    }
    setRemovingMember(null)
    setConfirmRemoveMember(null)
  }

  const getPropertyImages = (property) => {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) return property.images
    return []
  }

  const renderPropertyCard = ({ property, images, currentIndex, isSelectedForCompare, isFavorite, stats }) => (
    <div
      className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer flex flex-col h-full card-hover ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100 hover:border-gray-300'}`}
      onClick={() => router.push(`/properties/${property.id}`)}
      onMouseEnter={() => setHoveredPropertyId(property.id)}
      onMouseLeave={() => setHoveredPropertyId(null)}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 rounded-2xl">
        <img src={images[currentIndex]} alt={property.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 md:top-3 md:right-3 z-20 flex items-center gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={(e) => toggleFavorite(e, property.id)} className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all cursor-pointer ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:bg-white hover:text-red-500'}`}>
            <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
          </button>
          <label className="flex items-center cursor-pointer">
            <input type="checkbox" className="hidden" checked={isSelectedForCompare} onChange={(e) => toggleComparison(e, property)} />
            <div className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all ${isSelectedForCompare ? 'bg-black text-white' : 'bg-white/90 text-gray-400 hover:bg-white'}`}>
              {isSelectedForCompare ? (<svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>) : (<svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>)}
            </div>
          </label>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>
        <div className="absolute top-1.5 sm:top-2 md:top-3 left-1.5 sm:left-2 md:left-3 z-10 flex flex-col gap-0.5 sm:gap-1 items-start">
          {renderPropertyStatusBadge(property)}
          {stats.favorite_count >= 1 && (
            <span className="px-1 py-0.5 text-[7px] sm:text-[8px] uppercase font-bold tracking-wider rounded shadow-sm backdrop-blur-md bg-rose-500 text-white flex items-center gap-0.5">
              <svg className="w-2 h-2 sm:w-2.5 sm:h-2.5 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
              {stats.favorite_count}
            </span>
          )}
        </div>
        <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-10 text-white">
          <p className="text-sm sm:text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
          <p className="text-[8px] sm:text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
        </div>
      </div>
      <div className="p-1.5 sm:p-2">
        <div className="mb-0.5 sm:mb-1">
          <div className="flex justify-between items-start">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0 pr-1">
              <h3 className="text-xs sm:text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
              {mostFavoriteId && property.id === mostFavoriteId && (
                <span className="shrink-0 px-1 py-0.5 bg-rose-100 text-rose-600 border border-rose-200 text-[8px] font-bold rounded uppercase tracking-wider">
                  Most Favorite
                </span>
              )}
              {topRatedId && property.id === topRatedId && (
                <span className="shrink-0 px-1 py-0.5 bg-amber-100 text-amber-600 border border-amber-200 text-[8px] font-bold rounded uppercase tracking-wider">
                  Top Rated
                </span>
              )}
            </div>
            {stats.review_count > 0 && (<div className="flex items-center gap-1 text-xs shrink-0"><svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg><span className="font-bold text-gray-900">{stats.avg_rating.toFixed(1)}</span></div>)}
          </div>
          <p className="text-gray-500 text-[10px] sm:text-xs truncate">{property.city}, Philippines</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 text-gray-600 text-[10px] sm:text-xs">
          <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" /></svg>{property.bedrooms}</span>
          <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" /></svg>{property.bathrooms}</span>
          <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>{property.area_sqft} sqm</span>
        </div>
      </div>
    </div>
  )

  const carouselItemClass = "pl-2 basis-1/2 md:basis-1/4 lg:basis-[16.66%]"
  const skeletonSectionIndices = Array.from({ length: 3 }, (_, index) => index)
  const skeletonCardIndices = Array.from({ length: 6 }, (_, index) => index)

  if (loading) {
    if (tenantOccupancy) {
      return (
        <div className="min-h-screen bg-[#F5F5F5] flex flex-col scroll-smooth">
          <div className="max-w-[1800px] w-full mx-auto mt-0 px-4 sm:px-6 lg:px-8 pt-2 relative z-10 flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-4">
              <div className="lg:col-span-4">
                <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm space-y-4">
                  <div className="h-5 w-40 bg-gray-200 rounded skeleton-shimmer"></div>
                  <div className="flex items-center gap-4">
                    <div className="w-[85px] h-[85px] rounded-2xl bg-gray-200 skeleton-shimmer"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-3/4 bg-gray-200 rounded skeleton-shimmer"></div>
                      <div className="h-3 w-2/3 bg-gray-200 rounded skeleton-shimmer"></div>
                      <div className="h-5 w-24 bg-gray-200 rounded-md skeleton-shimmer"></div>
                    </div>
                  </div>
                  <div className="h-16 w-full bg-gray-200 rounded-xl skeleton-shimmer"></div>
                </div>
              </div>
              <div className="lg:col-span-8">
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
                  <div className="h-5 w-44 bg-gray-200 rounded skeleton-shimmer"></div>
                  <div className="h-20 w-full bg-gray-200 rounded-2xl skeleton-shimmer"></div>
                  <div className="h-20 w-full bg-gray-200 rounded-2xl skeleton-shimmer"></div>
                  <div className="h-24 w-full bg-gray-200 rounded-2xl skeleton-shimmer"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col scroll-smooth">
        <div className="max-w-[1800px] w-full mx-auto mt-0 px-4 sm:px-6 lg:px-8 pt-2 relative z-10 flex-1">
          <div className="space-y-8 mt-4">
            {skeletonSectionIndices.map((section) => (
              <div key={section} className="space-y-3">
                {section === 0 ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="h-6 w-56 bg-gray-200 rounded skeleton-shimmer"></div>
                    <div className="w-full sm:flex-1 sm:max-w-md lg:max-w-lg h-11 bg-gray-200 rounded-full skeleton-shimmer"></div>
                    <div className="h-4 w-32 sm:ml-auto bg-gray-200 rounded skeleton-shimmer"></div>
                  </div>
                ) : (
                  <div
                    className={`h-6 bg-gray-200 rounded skeleton-shimmer ${
                      section === 1 ? 'w-44' : 'w-28'
                    }`}
                  ></div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {skeletonCardIndices.map((item) => (
                    <div key={`${section}-${item}`} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                      <div className="aspect-[4/3] bg-gray-200 skeleton-shimmer"></div>
                      <div className="p-2 sm:p-3 space-y-2">
                        <div className="h-3 sm:h-4 bg-gray-200 rounded w-3/4 skeleton-shimmer"></div>
                        <div className="h-2.5 bg-gray-200 rounded w-1/2 skeleton-shimmer"></div>
                        <div className="flex items-center gap-2 pt-1">
                          <div className="h-2.5 bg-gray-200 rounded w-8 skeleton-shimmer"></div>
                          <div className="h-2.5 bg-gray-200 rounded w-8 skeleton-shimmer"></div>
                          <div className="h-2.5 bg-gray-200 rounded w-10 skeleton-shimmer"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const propertyAmenities = Array.isArray(tenantOccupancy?.property?.amenities) ? tenantOccupancy.property.amenities : []
  const normalizedAmenities = propertyAmenities.map(item => String(item).toLowerCase())
  const isWaterFree = normalizedAmenities.includes('free water')
  const isElectricityFree = normalizedAmenities.includes('free electricity')
  const isInternetAvailable = normalizedAmenities.includes('wifi') || normalizedAmenities.includes('wi-fi') || normalizedAmenities.includes('free wifi') || normalizedAmenities.includes('free wi-fi') || normalizedAmenities.includes('internet')
  const isInternetFree = normalizedAmenities.includes('free wifi') || normalizedAmenities.includes('free wi-fi') || normalizedAmenities.includes('free internet')
  const nextInternetDueDate = isInternetFree ? 'Free' : getUpcomingDueDateByDay(tenantOccupancy?.wifi_due_day)
  const nextWaterDueDate = isWaterFree ? 'Free' : getUpcomingDueDateByDay(tenantOccupancy?.water_due_day)
  const nextElectricityDueDate = isElectricityFree ? 'Free' : getUpcomingDueDateByDay(tenantOccupancy?.electricity_due_day)

  const occupancyStartDateObj = tenantOccupancy?.start_date ? new Date(tenantOccupancy.start_date) : null
  const todayDateOnly = new Date()
  todayDateOnly.setHours(0, 0, 0, 0)
  if (occupancyStartDateObj) occupancyStartDateObj.setHours(0, 0, 0, 0)
  const hasOccupancyStarted = !occupancyStartDateObj || todayDateOnly >= occupancyStartDateObj

  const renderSeeAllCard = (items, targetUrl = '/properties/allProperties') => {
    const defaultImg = 'https://images.unsplash.com/photo-1560518884-ce5882228f44?w=500&q=80';
    let img1, img2, img3;

    if (items && items.length > 0) {
      const getImg = (idx) => {
        const item = items[idx % items.length];
        const imgs = getPropertyImages(item);
        return imgs && imgs.length > 0 ? imgs[0] : defaultImg;
      };
      img1 = getImg(0);
      img2 = getImg(1);
      img3 = getImg(2);
    } else {
      img1 = img2 = img3 = defaultImg;
    }

    return (
      <CarouselItem key="see-all" className={carouselItemClass}>
        <div className="p-1 h-full">
          <div
            onClick={() => router.push(targetUrl)}
            className={`group bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:border-gray-300 transition-all h-full min-h-[220px] aspect-[4/3] sm:aspect-auto ${mounted ? 'animate-slideInCard delay-200' : 'opacity-0'}`}
          >
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 mb-6 mt-4 flex items-center justify-center">
              <div className="absolute top-0 right-0 sm:-right-2 w-14 h-14 sm:w-16 sm:h-16 rounded-xl shadow-md border-4 border-white overflow-hidden rotate-12 transform group-hover:translate-x-3 group-hover:-translate-y-1 transition-all duration-300 z-0">
                 <img src={img2} alt="" className="w-full h-full object-cover"/>
              </div>
              <div className="absolute top-2 left-0 sm:-left-2 w-14 h-14 sm:w-16 sm:h-16 rounded-xl shadow-md border-4 border-white overflow-hidden -rotate-6 transform group-hover:-translate-x-3 group-hover:translate-y-1 transition-all duration-300 z-10">
                 <img src={img3} alt="" className="w-full h-full object-cover"/>
              </div>
              <div className="absolute top-5 left-3 sm:left-4 w-16 h-16 sm:w-20 sm:h-20 rounded-xl shadow-xl border-4 border-white overflow-hidden z-20 transform group-hover:scale-110 transition-all duration-300 bg-gray-100">
                 <img src={img1} alt="" className="w-full h-full object-cover"/>
              </div>
            </div>
            <span className="font-bold text-gray-900 mt-6 text-[13px] sm:text-base border-b-2 border-transparent group-hover:border-gray-900 transition-colors">See all</span>
          </div>
        </div>
      </CarouselItem>
    );
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col scroll-smooth">
      <div className="max-w-[1800px] w-full mx-auto mt-0 px-4 sm:px-6 lg:px-8 pt-2 relative z-10 flex-1">

        {tenantOccupancy ? (
          /* --- ACTIVE PROPERTY SECTION (MANAGEMENT VIEW) --- */
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-4">

              {/* Left Column: Property Details & Support (Minimized) */}
              <div className="lg:col-span-4 space-y-6">

                {/* Active Property Card */}
                <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                      </div>
                      Active Property
                    </h2>
                      {/* <button
                        onClick={() => router.push('/properties/allProperties')}
                        className="text-[10px] font-bold text-slate-500 hover:text-black hover:underline cursor-pointer uppercase tracking-wider bg-gray-50 px-2 py-1 rounded"
                      >
                        See More Properties
                      </button> */}
                  </div>

                  <div className="flex flex-col gap-4">
                    {/* Image & Details */}
                    <div className="flex items-center gap-4">
                      {tenantOccupancy.property?.images?.length > 0 ? (
                        <div className="w-[85px] h-[85px] shrink-0 rounded-2xl overflow-hidden shadow-sm border border-gray-100 bg-gray-50">
                          <img src={tenantOccupancy.property.images[activePropertyImageIndex]} alt="Property" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-[85px] h-[85px] shrink-0 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400">
                          <svg className="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight line-clamp-1 mb-0.5">{tenantOccupancy.property?.title}</h1>
                        <p className="text-gray-500 text-[11px] flex items-start gap-1 font-medium mb-1.5">
                          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          <span className="line-clamp-2 leading-snug">{tenantOccupancy.property?.city}, {tenantOccupancy.property?.address}</span>
                        </p>
                        <span className={`self-start px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide border ${tenantOccupancy.end_request_status === 'approved' ? 'bg-blue-50 text-blue-600 border-blue-100' : (tenantOccupancy.status === 'pending_end' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-[#E3F6ED] text-[#1E9A5B] border-[#1E9A5B]/20')} shadow-sm`}>
                          {tenantOccupancy.end_request_status === 'approved' 
                            ? `Move-out Approved (${new Date(tenantOccupancy.end_request_date).toLocaleDateString()})` 
                            : (tenantOccupancy.status === 'pending_end' ? 'Move-out Pending' : 'Active Property')}
                        </span>
                        {tenantOccupancy.end_request_status === 'approved' && (
                          <div className="mt-1.5 flex items-start gap-1 p-1 bg-red-50 rounded border border-red-100">
                             <svg className="w-3 h-3 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                             <p className="text-[9px] text-red-700 font-black leading-tight">
                               Auto-cancellation risk: Settle all bills before the date above.
                             </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rental start date */}
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col gap-1.5 mt-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Start Date</span>
                        <span className="text-gray-900 text-xs font-bold font-mono">
                          {new Date(tenantOccupancy.start_date || tenantOccupancy.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                        </span>
                      </div>
                    </div>

                    {/* Buttons Grid */}
                    <div className="flex flex-col gap-2 mt-1">
                      {hasOccupancyStarted ? (
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => router.push(`/properties/${tenantOccupancy.property?.id}`)} className="py-2.5 text-xs bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer items-center justify-center flex text-center">Details</button>
                          {tenantOccupancy.property?.terms_conditions && <a href={tenantOccupancy.property.terms_conditions.startsWith('http') ? tenantOccupancy.property.terms_conditions : '/terms'} target="_blank" rel="noopener noreferrer" className="col-span-1 py-2.5 text-xs bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:bg-gray-50 shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Terms</a>}
                          {!isFamilyMember && (
                            tenantOccupancy.end_request_status === 'cancel_pending' ? (
                              <div className="col-span-1 py-1.5 px-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center justify-center">
                                <span className="text-[9px] font-black uppercase text-amber-700 text-center leading-tight">Cancellation Request Pending Approval</span>
                              </div>
                            ) : (tenantOccupancy.end_request_status === 'approved' || tenantOccupancy.status === 'pending_end') ? (
                              <button 
                                onClick={() => setShowCancelEndModal(true)} 
                                className="col-span-1 py-2.5 text-[11px] uppercase tracking-wider bg-white text-orange-600 font-bold rounded-xl border border-orange-100 hover:bg-orange-50 hover:border-orange-200 transition-colors cursor-pointer text-center"
                              >
                                Cancel Move-Out
                              </button>
                            ) : (
                              <button 
                                onClick={() => setShowEndRequestModal(true)} 
                                className="col-span-1 py-2.5 text-[11px] uppercase tracking-wider bg-white text-red-500 font-bold rounded-xl border border-red-100 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors cursor-pointer text-center"
                              >
                                Request to leave
                              </button>
                            )
                          )}
                        </div>
                      ) : (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                          <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                            Start on {new Date(tenantOccupancy.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Security Deposit Card */}
                <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">Security Deposit</h3>
                  </div>
                  {securityDepositPaid ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Total Deposit</span>
                        <span className="font-black text-gray-900">₱{Number(tenantOccupancy?.security_deposit || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Used for Maintenance</span>
                        <span className="font-bold text-gray-600">₱{Number(tenantOccupancy?.security_deposit_used || 0).toLocaleString()}</span>
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-700">Remaining Balance</span>
                        <span className="font-black text-lg text-black">₱{Number((tenantOccupancy?.security_deposit || 0) - (tenantOccupancy?.security_deposit_used || 0)).toLocaleString()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500">No security deposit paid yet</p>
                      <p className="text-xs text-gray-400 mt-1">Required: ₱{Number(tenantOccupancy?.security_deposit || 0).toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {/* Family Members Section */}
                <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm">Family Members</h3>
                        <p className="text-[10px] text-gray-400">{familyMembers.length + 1}/5 members</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isFamilyMember && familyMembers.length < 4 && (
                        <button
                          onClick={openFamilyModal}
                          className="text-[10px] font-bold text-black-600 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-full transition-colors cursor-pointer border border-gray-200"
                        >
                          + Add Member
                        </button>
                      )}
                      {isFamilyMember && (
                        <button
                          onClick={openLeaveFamilyModal}
                          disabled={leavingFamily}
                          className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full transition-colors cursor-pointer border border-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {leavingFamily ? 'Leaving...' : 'Leave Family'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Primary Tenant (Mother) */}
                  <div className="p-2.5 bg-gradient-to-r from-gray-50 to-gray-50 rounded-xl border border-gray-100 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gray-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                        {isFamilyMember
                          ? (tenantOccupancy?.tenant?.avatar_url
                            ? <img src={tenantOccupancy.tenant.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                            : `${tenantOccupancy?.tenant?.first_name?.[0] || ''}${tenantOccupancy?.tenant?.last_name?.[0] || ''}`)
                          : (profile?.avatar_url
                            ? <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                            : `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`)
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {isFamilyMember
                            ? `${tenantOccupancy?.tenant?.first_name || ''} ${tenantOccupancy?.tenant?.last_name || ''}`.trim() || 'Primary Tenant'
                            : `${profile.first_name} ${profile.last_name}`}
                        </p>
                        <p className="text-[10px] text-gray-600 font-semibold">Primary Tenant</p>
                      </div>
                      <span className="text-[9px] font-bold bg-gray-200 text-black-800 px-2 py-0.5 rounded-full">Owner</span>
                    </div>
                  </div>

                  {/* Members List */}
                  {loadingFamily ? (
                    <div className="text-center py-3">
                      <div className="w-5 h-5 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : familyMembers.length > 0 ? (
                    <div className="space-y-1.5">
                      {familyMembers.map((fm) => (
                        <div key={fm.id} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 transition-all">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-bold text-[10px] shadow-sm">
                              {fm.member_profile?.avatar_url ? (
                                <img src={fm.member_profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                              ) : (
                                `${fm.member_profile?.first_name?.[0] || ''}${fm.member_profile?.last_name?.[0] || ''}`
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-gray-900 truncate">
                                {fm.member_profile?.first_name} {fm.member_profile?.last_name}
                              </p>
                              <p className="text-[10px] text-gray-400 truncate">{fm.member_profile?.email}</p>
                            </div>
                            {!isFamilyMember && (
                              confirmRemoveMember === fm.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => removeFamilyMember(fm.id)}
                                    disabled={removingMember === fm.id}
                                    className="text-[9px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-md cursor-pointer border border-red-200 disabled:opacity-50"
                                  >
                                    {removingMember === fm.id ? '...' : 'Yes'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmRemoveMember(null)}
                                    className="text-[9px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-md cursor-pointer"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmRemoveMember(fm.id)}
                                  className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-all cursor-pointer px-2 py-1"
                                  title="Remove family member"
                                >
                                  Kick
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-3">
                      <p className="text-[11px] text-gray-400">No family members added yet.</p>
                    </div>
                  )}

                  {isFamilyMember && (
                    <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        You are a family member. Only the primary tenant can manage members, but you can leave the family group anytime.
                      </p>
                    </div>
                  )}
                </div>

                {/* Add Family Member Modal */}
                {showFamilyModal && typeof window !== 'undefined' && createPortal(
                  <div
                    className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto px-4 py-5 sm:items-center sm:px-6 sm:py-8"
                    onClick={closeFamilyModal}
                  >
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[4px]" />
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="family-member-modal-title"
                      className="relative isolate my-auto flex w-full max-w-[460px] max-h-[min(720px,calc(100vh-2.5rem))] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_30px_60px_-12px_rgba(15,23,42,0.35)] animate-in fade-in duration-150"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Modal Header */}
                      <div className="bg-gray-900 px-5 py-5 sm:px-7 sm:py-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-4">
                            <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white shadow-sm">
                              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                            </div>
                            <div className="min-w-0">
                              <p id="family-member-modal-title" className="text-white font-black text-[22px] tracking-[-0.02em] leading-[1.15]">
                                Add Family Member
                              </p>
                              <p className="mt-1 text-[13px] font-medium text-white/80">{familyMembers.length}/4 slots used</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={closeFamilyModal}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white shadow-sm transition-all hover:bg-white/30 cursor-pointer"
                            aria-label="Close add family member modal"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>

                      {/* Search Input */}
                      <div className="border-b border-gray-100 bg-white px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
                        <div className="relative mb-3">
                          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-all focus-within:border-slate-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-900/10">
                            <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input
                              type="text"
                              placeholder="Search by name or email..."
                              value={familySearchQuery}
                              onChange={e => setFamilySearchQuery(e.target.value)}
                              className="h-14 w-full rounded-[24px] border-0 bg-transparent pl-12 pr-12 text-[15px] font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:outline-none focus:ring-0"
                              autoFocus
                            />
                          </div>
                          {familySearching && (
                            <div className="absolute right-5 top-1/2 -translate-y-1/2">
                              <div className="w-5 h-5 border-[3px] border-gray-900/30 border-t-gray-900 rounded-full animate-spin"></div>
                            </div>
                          )}
                        </div>
                        <p className="ml-2 text-[12px] font-medium text-slate-400">Only tenant accounts will appear in results.</p>
                      </div>

                      {/* Search Results */}
                      <div className="min-h-[240px] flex-1 overflow-y-auto bg-[#fafafa]">
                        {familySearchResults.length > 0 ? (
                          <div className="p-4 space-y-2">
                            {familySearchResults.map(user => (
                              <div key={user.id} className="p-3 bg-white rounded-[20px] border border-gray-200 hover:border-gray-400 hover:shadow-md transition-all shadow-sm">
                                <div className="flex items-center gap-3">
                                  <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm border border-gray-200/50">
                                    {user.avatar_url ? (
                                      <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                      `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[15px] font-bold text-gray-900 truncate tracking-tight">
                                      {user.first_name} {user.middle_name && user.middle_name.toLowerCase() !== 'n/a' ? user.middle_name + ' ' : ''}{user.last_name}
                                    </p>
                                    <p className="text-[12px] font-medium text-gray-500 truncate">{user.email}</p>
                                    {user.phone && <p className="text-[10px] text-gray-400 mt-0.5">{user.phone}</p>}
                                  </div>
                                  <button
                                    onClick={() => addFamilyMember(user.id)}
                                    disabled={addingMember === user.id}
                                    className="text-[13px] font-bold text-white bg-gray-900 hover:bg-black px-5 py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 shadow-md flex-shrink-0"
                                  >
                                    {addingMember === user.id ? (
                                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    ) : 'Add'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : familySearchQuery.trim().length >= 2 && !familySearching ? (
                          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-gray-100 text-[#9ca3af] flex items-center justify-center mb-4 shadow-sm">
                              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </div>
                            <p className="text-[17px] font-bold text-gray-700 tracking-tight">No tenant accounts found</p>
                            <p className="text-[13px] font-medium text-[#9ca3af] mt-1.5">Try a different name or email</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mb-4 shadow-sm">
                              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <p className="text-[17px] font-bold text-[#64748b] tracking-tight">Search for a tenant</p>
                            <p className="text-[13px] font-medium text-[#94a3b8] mt-1.5">Type at least 2 characters to search</p>
                          </div>
                        )}
                      </div>

                      {/* Footer Note */}
                      <div className="border-t border-gray-100 bg-white px-5 py-4 sm:px-6 sm:py-5">
                        <p className="text-center text-[13px] font-medium leading-[1.6] text-[#64748b]">
                          Note: Family members will have access to payments and maintenance for this property.
                          They cannot submit end-of-stay requests.
                        </p>
                      </div>
                    </div>
                  </div>,
                  document.body
                )}

              </div>

              {/* Right Column: Financials & Pending Payments */}
              <div className="lg:col-span-8 space-y-6">

                {/* All Payments Section */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">

                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-lg">Recent Payments</h3>
                      {pendingPayments.length > 0 && (
                        <span className="bg-red-50 text-orange-600 text-xs font-bold px-2.5 py-1 rounded-full border border-red-100">
                          {pendingPayments.length} Pending
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => router.push('/payments')}
                      className="text-xs font-bold text-slate-500 hover:text-black hover:underline transition-all cursor-pointer"
                    >
                      See All Payments
                    </button>
                  </div>

                  {/* 1. Pending Bills List */}
                  {pendingPayments.length > 0 ? (
                    <div className="space-y-3 mb-9">
                      {pendingPayments.map((bill) => {
                        const rent = parseFloat(bill.rent_amount) || 0;
                        const water = parseFloat(bill.water_bill) || 0;
                        const electric = parseFloat(bill.electrical_bill) || 0;
                        const wifi = parseFloat(bill.wifi_bill) || 0;
                        const other = parseFloat(bill.other_bills) || 0;
                        const security = parseFloat(bill.security_deposit_amount) || 0;
                        const advance = parseFloat(bill.advance_amount) || 0;

                        // FIX: Include security and advance in total
                        const total = rent + water + electric + wifi + other + security + advance;

                        let billType = 'Other Bill';
                        if ((rent > 0 && security > 0) || (rent > 0 && advance > 0 && security > 0)) billType = 'Move-In Bill';
                        else if (rent > 0) billType = 'House Rent';
                        else if (advance > 0) billType = 'Advance Payment';
                        else if (security > 0) billType = 'Security Deposit';
                        else if (electric > 0) billType = 'Electric Bill';
                        else if (water > 0) billType = 'Water Bill';
                        else if (wifi > 0) billType = 'Wifi Bill';

                        return (
                          <div key={bill.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-black border border-slate-100 shadow-sm shrink-0">
                                {billType === 'House Rent' ? (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                )}
                              </div>
                              <div>
                                <p className="font-bold text-slate-700 text-sm">{billType}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Due: {bill.due_date ? new Date(bill.due_date).toLocaleDateString() : 'Immediate'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                              <div className="text-right">
                                <p className="font-black text-slate-900">₱{total.toLocaleString()}</p>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total Amount</p>
                              </div>
                              <button
                                onClick={() => router.push('/payments')}
                                className="px-4 py-2 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200 cursor-pointer"
                              >
                                Pay Now
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-3 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 mb-4">
                      <div className="w-12 h-12 bg-green-300 text-black-600 rounded-full flex items-center justify-center mx-auto mb-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <p className="text-sm text-slate-500 font-medium">No pending payments. You&apos;re all caught up!</p>
                    </div>
                  )}
                  <p className="text-sm text-slate-500 font-medium">Note: Please ensure all electricity, water and wifi bills are paid before the due date. The landlord is not liable for late payments.</p>


                  <div className="border-t border-gray-100 pt-6 pb-4 mb-6">
                    <h4 className="font-bold text-slate-900 text-sm mb-4">Payment Overview</h4>

                    {/* 2. Next Due Date */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

                      {/* Next Due Date */}
                      <div className="bg-gray-50/50 rounded-2xl p-4 border border-indigo-50">
                        <p className="text-xs text-black-400 font-bold uppercase tracking-wider mb-1">Next House Due Date</p>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-black-100 text-white-600 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <div>
                            {!nextPaymentDateLoading && nextPaymentDate ? (
                              <p className="text-lg font-black text-slate-900">{nextPaymentDate}</p>
                            ) : (
                              <p className="text-lg font-black text-slate-900 flex items-center gap-1">
                                Loading <span className="flex items-center"><span className="animate-pulse delay-75">.</span><span className="animate-pulse delay-150">.</span><span className="animate-pulse delay-300">.</span></span>
                              </p>
                            )}
                            {!nextPaymentDateLoading && tenantOccupancy?.property?.price && !String(nextPaymentDate).includes('All Paid') && (
                              <div className="mt-0.5">
                                <p className="text-xs text-black-500 font-semibold">
                                  Expected Bill: ₱{Number(tenantOccupancy.property.price).toLocaleString()}
                                </p>
                              </div>
                            )}
                            {!nextPaymentDateLoading && tenantOccupancy?.property?.price && String(nextPaymentDate).includes('All Paid') && (
                              <p className="text-xs text-green-600 font-semibold mt-0.5">All bills settled!</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50/50 rounded-2xl p-4 border border-emerald-50">
                        <p className="text-xs text-black-400 font-bold uppercase tracking-wider mb-2">Utility Next Due Date</p>
                        <div className="space-y-3">
                          {isInternetAvailable && (
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-700">Internet</span>
                              </div>
                              <span className="text-sm font-black text-slate-900">{nextInternetDueDate}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-700">Water</span>
                            </div>
                            <span className="text-sm font-black text-slate-900">{nextWaterDueDate}</span>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-700">Electricity</span>
                            </div>
                            <span className="text-sm font-black text-slate-900">{nextElectricityDueDate}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3. Rent Payment History (Visual Tracker) */}
                    <div className="bg-gray-50 rounded-2xl p-5 border border-slate-100">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-white text-slate-600 rounded-lg shadow-sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <h3 className="font-bold text-slate-900 text-sm">Track your payments ({new Date().getFullYear()})</h3>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-2">
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => {
                          const currentYear = new Date().getFullYear();
                          const targetAbsoluteMonth = currentYear * 12 + index;

                          const isMonthCoveredByPaidHistory = paymentHistory.some(p => {
                            if (!p.due_date || parseFloat(p.rent_amount) <= 0) return false;

                            const d = new Date(p.due_date);
                            if (Number.isNaN(d.getTime())) return false;
                            const pMonth = d.getMonth();
                            const pYear = d.getFullYear();

                            const advance = parseFloat(p.advance_amount || 0);
                            const rent = parseFloat(p.rent_amount || 0);
                            let monthsCovered = 1;

                            // Any rent bill with advance (including move-in) covers extra months.
                            if (advance > 0 && rent > 0) {
                              monthsCovered += Math.floor(advance / rent);
                            }

                            const paymentStartAbsoluteMonth = pYear * 12 + pMonth;
                            const paymentEndAbsoluteMonth = paymentStartAbsoluteMonth + monthsCovered - 1;

                            return targetAbsoluteMonth >= paymentStartAbsoluteMonth && targetAbsoluteMonth <= paymentEndAbsoluteMonth;
                          });

                          const occupancyStartDate = tenantOccupancy?.start_date ? new Date(tenantOccupancy.start_date) : null;
                          const hasValidStartDate = occupancyStartDate && !Number.isNaN(occupancyStartDate.getTime());
                          const occupancyStartAbsoluteMonth = hasValidStartDate
                            ? (occupancyStartDate.getFullYear() * 12 + occupancyStartDate.getMonth())
                            : null;

                          const hasPendingRentForStartMonth = occupancyStartAbsoluteMonth !== null && pendingPayments.some(p => {
                            if (!p?.due_date || parseFloat(p.rent_amount || 0) <= 0) return false;
                            const pendingDate = new Date(p.due_date);
                            if (Number.isNaN(pendingDate.getTime())) return false;
                            const pendingAbsoluteMonth = pendingDate.getFullYear() * 12 + pendingDate.getMonth();
                            return pendingAbsoluteMonth === occupancyStartAbsoluteMonth;
                          });

                          const currentAbsoluteMonth = (new Date().getFullYear() * 12) + new Date().getMonth();
                          const fallbackStartMonthPaid = occupancyStartAbsoluteMonth !== null
                            && targetAbsoluteMonth === occupancyStartAbsoluteMonth
                            && occupancyStartAbsoluteMonth <= currentAbsoluteMonth
                            && !isMonthCoveredByPaidHistory
                            && !hasPendingRentForStartMonth;

                          const isPaid = isMonthCoveredByPaidHistory || fallbackStartMonthPaid;

                          const isActiveMonth = new Date().getMonth() === index;

                          return (
                            <div key={month} className="flex flex-col items-center justify-center p-2">
                              <span className={`text-[10px] font-bold uppercase mb-1.5 ${isPaid ? 'text-black' : 'text-gray-400'}`}>
                                {month}
                              </span>

                              {isPaid ? (
                                <div className="w-5 h-5 rounded-full bg-green-300 text-black flex items-center justify-center shadow-sm">
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : isActiveMonth ? (
                                <div className="w-5 h-5 rounded-full border-2 border-black flex items-center justify-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full border border-gray-200"></div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div >
        ) : (
          /* --- ALL PROPERTIES SECTION (DISCOVERY VIEW) --- */
          <div className="space-y-8">
            {futureOccupancy && (
              <div className="relative z-[70] bg-white border border-gray-200 rounded-[1.5rem] p-6 sm:p-7 flex flex-col lg:flex-row items-center justify-between shadow-sm mt-8 group hover:border-gray-300 transition-all duration-300">
                <div className="flex flex-col lg:flex-row items-center gap-6 w-full">
                  {/* Clean Icon Container */}
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 shrink-0">
                    <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>

                  <div className="flex-1 text-center lg:text-left min-w-0">
                    <div className="flex flex-col sm:flex-row items-center gap-3 mb-1 justify-center lg:justify-start">
                      <h3 className="text-base font-bold text-slate-900">Upcoming Occupancy</h3>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold uppercase tracking-wider rounded-md border border-slate-200">Scheduled</span>
                    </div>
                    <p className="text-slate-500 font-medium text-sm leading-relaxed">
                      at <span className="text-slate-900 font-bold underline decoration-slate-200 underline-offset-4 cursor-pointer hover:text-black transition-colors" onClick={() => router.push(`/properties/${futureOccupancy.property?.id}`)}>{futureOccupancy.property?.title}</span> starts on <span className="text-slate-900 font-bold">{new Date(futureOccupancy.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span>.
                    </p>
                    <p className="text-slate-400 text-[11px] mt-1.5 flex items-center gap-1 justify-center lg:justify-start">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                      Message the landlord to coordinate your move-in
                    </p>
                  </div>

                  <div className="w-full lg:w-auto mt-4 lg:mt-0 flex flex-col items-center lg:items-end gap-2">
                    <button 
                      onClick={() => router.push('/payments')} 
                      className="w-full lg:w-auto px-8 py-3 bg-black text-white font-bold text-[11px] uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                    >
                      Pay earlier
                    </button>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-[10px] font-medium leading-none">Ignore this button if you have already paid in full</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* All Properties Section */}
            <div className={`relative z-[60] mb-0 mt-4 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center mb-4 gap-3">
                <h2 className="text-2xl font-black text-black shrink-0">Recommended Properties</h2>
                <div className="flex items-center gap-3 w-full sm:w-auto sm:flex-1 sm:max-w-md lg:max-w-lg">
                  <div className="relative flex-1" ref={searchRef}>
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                      {isSearching ? (
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin"></div>
                      ) : (
                        <svg className="text-gray-400 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Search properties, cities..."
                      className="w-full bg-white border border-gray-200 rounded-full focus:ring-2 focus:ring-black/20 focus:border-gray-400 font-medium pl-11 pr-10 py-3 text-sm transition-all duration-300 hover:border-gray-300 hover:shadow-md focus:shadow-md placeholder:text-gray-400 shadow-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setShowSearchDropdown(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchQuery.trim()) handleSearch()
                        if (e.key === 'Escape') setShowSearchDropdown(false)
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearchDropdown(false) }}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-900 transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                    {showSearchDropdown && !searchQuery.trim() && suggestedSearchProperties.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50" style={{ animationDuration: '0.2s' }}>
                        <div className="p-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Suggested Properties</p>
                          {suggestedSearchProperties.map((property) => (
                            <div
                              key={property.id}
                              onClick={() => { router.push(`/properties/${property.id}`); setShowSearchDropdown(false) }}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-all duration-200 group"
                            >
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                {property.images?.[0] ? (
                                  <img src={property.images[0]} alt={property.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{property.title}</p>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <span>{property.city}</span>
                                  <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                  <span className="font-bold text-gray-900">₱{Number(property.price).toLocaleString()}/mo</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Search Dropdown */}
                    {showSearchDropdown && searchQuery.trim() && searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50" style={{ animationDuration: '0.2s' }}>
                        <div className="p-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Search Results</p>
                          {searchResults.map((property) => (
                            <div
                              key={property.id}
                              onClick={() => { router.push(`/properties/${property.id}`); setShowSearchDropdown(false) }}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-all duration-200 group"
                            >
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                {property.images?.[0] ? (
                                  <img src={property.images[0]} alt={property.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{property.title}</p>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <span>{property.city}</span>
                                  <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                  <span className="font-bold text-gray-900">₱{Number(property.price).toLocaleString()}/mo</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-gray-100 p-2">
                          <button
                            onClick={() => { handleSearch(); setShowSearchDropdown(false) }}
                            className="w-full text-center py-2 text-sm font-bold text-gray-900 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                          >
                            View all results for &quot;{searchQuery}&quot;
                          </button>
                        </div>
                      </div>
                    )}
                    {showSearchDropdown && searchQuery.trim() && searchResults.length === 0 && !isSearching && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 p-4 text-center">
                        <p className="text-sm font-medium text-gray-500">No properties found for &quot;{searchQuery}&quot;</p>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSeeMore}
                  className="text-sm font-black text-gray-900 hover:text-black hover:underline underline-offset-4 sm:ml-auto cursor-pointer whitespace-nowrap"
                >
                  See more properties
                </button>
              </div>
              {properties.length === 0 ? (
                <div className="text-center py-20 h-[400px] flex items-center justify-center">No properties found.</div>
              ) : (
                <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)] cursor-pointer">
                  <CarouselContent className="-ml-2">
                    {properties.slice(0, maxDisplayItems).map((item) => (
                      <CarouselItem key={item.id} className={carouselItemClass}>
                        <div className="p-1 h-full">
                          {renderPropertyCard({
                            property: item, images: getPropertyImages(item),
                            currentIndex: currentImageIndex[item.id] || 0,
                            isSelectedForCompare: comparisonList.some(p => p.id === item.id),
                            isFavorite: favorites.includes(item.id),
                            stats: propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
                          })}
                        </div>
                      </CarouselItem>
                    ))}
                    {properties.length > maxDisplayItems && renderSeeAllCard(properties)}
                  </CarouselContent>
                  <CarouselPrevious /><CarouselNext />
                </Carousel>
              )}
            </div>

            {/* Tenants Favorites Section */}
            {locationPermission === 'granted' && userLocationCity && guestFavorites.length > 0 && (
              <div className={`mb-2 mt-4 transition-all duration-700 delay-150 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-black text-black">Available in {userLocationCity}</h2>
                    </div>
                  </div>
                </div>
                <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)]">
                  <CarouselContent className="-ml-2">
                    {guestFavorites.slice(0, maxDisplayItems).map((item) => {
                      const images = getPropertyImages(item)
                      const currentIndex = currentImageIndex[item.id] || 0
                      const isSelectedForCompare = comparisonList.some(p => p.id === item.id)
                      const isFavorite = favorites.includes(item.id)
                      const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }

                      return (
                        <CarouselItem key={item.id} className={carouselItemClass}>
                          <div className="p-1 h-full">
                            {renderPropertyCard({
                              property: item,
                              images,
                              currentIndex,
                              isSelectedForCompare,
                              isFavorite,
                              stats
                            })}
                          </div>
                        </CarouselItem>
                      )
                    })}
                    {guestFavorites.length > maxDisplayItems && renderSeeAllCard(guestFavorites)}
                  </CarouselContent>
                  <CarouselPrevious />
                  <CarouselNext />
                </Carousel>
              </div>
            )}

            {/* Most Favorite Properties Section */}
            {mostFavoriteProperties.length > 0 && (
              <div className={`mb-2 mt-4 transition-all duration-700 delay-250 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-black text-black">Most Favorite Properties</h2>
                    </div>
                  </div>
                </div>
                <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)]">
                  <CarouselContent className="-ml-2">
                    {mostFavoriteProperties.slice(0, maxDisplayItems).map((item) => {
                      const images = getPropertyImages(item)
                      const currentIndex = currentImageIndex[item.id] || 0
                      const isSelectedForCompare = comparisonList.some(p => p.id === item.id)
                      const isFavorite = favorites.includes(item.id)
                      const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }

                      return (
                        <CarouselItem key={item.id} className={carouselItemClass}>
                          <div className="p-1 h-full">
                            {renderPropertyCard({
                              property: item,
                              images,
                              currentIndex,
                              isSelectedForCompare,
                              isFavorite,
                              stats
                            })}
                          </div>
                        </CarouselItem>
                      )
                    })}
                    {mostFavoriteProperties.length > maxDisplayItems && renderSeeAllCard(mostFavoriteProperties, '/properties/allProperties?filterMostFavorite=true')}
                  </CarouselContent>
                  <CarouselPrevious />
                  <CarouselNext />
                </Carousel>
              </div>
            )}

            {/* Nearby Properties Section - Carousel */}
            {locationPermission === 'granted' && nearbyProperties.length > 0 && (
              <div className={`mb-2 mt-4 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-black text-black">Nearby Properties</h2>
                    </div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Within 1 km of your current location</p>
                  </div>
                </div>
                <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)]">
                  <CarouselContent className="-ml-2">
                    {nearbyProperties.slice(0, maxDisplayItems).map((item) => {
                      const images = getPropertyImages(item)
                      const currentIndex = currentImageIndex[item.id] || 0
                      const isSelectedForCompare = comparisonList.some(p => p.id === item.id)
                      const isFavorite = favorites.includes(item.id)
                      const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }

                      return (
                        <CarouselItem key={item.id} className={carouselItemClass}>
                          <div className="p-1 h-full">
                            {renderPropertyCard({
                              property: item,
                              images,
                              currentIndex,
                              isSelectedForCompare,
                              isFavorite,
                              stats
                            })}
                          </div>
                        </CarouselItem>
                      )
                    })}
                    {nearbyProperties.length > maxDisplayItems && renderSeeAllCard(nearbyProperties)}
                  </CarouselContent>
                  <CarouselPrevious />
                  <CarouselNext />
                </Carousel>
              </div>
            )}

            {/* Top Rated Section - Carousel */}
            {topRated.length > 0 && (
              <div className={`mb-2 mt-4 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-black text-black">Top Rated</h2>
                    </div>
                  </div>
                </div>
                <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)]">
                  <CarouselContent className="-ml-2">
                    {topRated.slice(0, maxDisplayItems).map((item) => {
                      const images = getPropertyImages(item)
                      const currentIndex = currentImageIndex[item.id] || 0
                      const isSelectedForCompare = comparisonList.some(p => p.id === item.id)
                      const isFavorite = favorites.includes(item.id)
                      const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }

                      return (
                        <CarouselItem key={item.id} className={carouselItemClass}>
                          <div className="p-1 h-full">
                            {renderPropertyCard({
                              property: item,
                              images,
                              currentIndex,
                              isSelectedForCompare,
                              isFavorite,
                              stats
                            })}
                          </div>
                        </CarouselItem>
                      )
                    })}
                    {topRated.length > maxDisplayItems && renderSeeAllCard(topRated, '/properties/allProperties?minRating=5')}
                  </CarouselContent>
                  <CarouselPrevious />
                  <CarouselNext />
                </Carousel>
              </div>
            )}
          </div>
        )
        }

      </div >

      {/* Floating Compare Button */}
      {
        comparisonList.length > 0 && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40 animate-bounce-in">
            <button onClick={handleCompareClick} className="bg-black text-white px-8 py-4 rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center gap-3 border-2 border-white/20 cursor-pointer">
              <span className="relative">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-black">
                  {comparisonList.length}
                </span>
              </span>
              <span className="font-bold text-sm uppercase tracking-wider">Compare Selected</span>
              {comparisonList.length < 2 && (
                <span className="text-xs text-gray-400 font-normal normal-case">(Select at least 2)</span>
              )}
            </button>
          </div>
        )
      }

      {/* End Request Modal Warning Confirmation */}
      {
        showEndWarningModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-sm w-full p-8 text-center transform animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              
              <h3 className="text-2xl font-black text-gray-900 mb-3 uppercase tracking-tight">Final Warning</h3>
              
              <p className="text-gray-600 text-sm leading-relaxed mb-8">
                This request <span className="font-bold text-yellow-600">cannot be undone</span> once submitted. The move-out date you selected will be final upon approval. Are you absolutely sure?
              </p>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={confirmRequestEndOccupancy}
                  className="w-full py-4 bg-yellow-500 hover:bg-yellow-600 text-white font-black rounded-2xl transition-all cursor-pointer uppercase tracking-widest text-xs"
                >
                  Yes, Confirm Request
                </button>
                <button 
                  onClick={() => setShowEndWarningModal(false)}
                  className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-2xl transition-all cursor-pointer uppercase tracking-widest text-xs"
                >
                  Wait, Go Back
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* End Request Modal */}
      {
        showEndRequestModal && tenantOccupancy && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeEndRequestModal}>
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold mb-4">Request to Leave</h3>

              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-1">Date when*</label>
                <input
                  type="date"
                  value={endRequestDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setEndRequestDate(e.target.value)}
                  className="w-full p-3 border rounded-xl"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-1">Reason*</label>
                <textarea
                  value={endRequestReason}
                  onChange={(e) => setEndRequestReason(e.target.value)}
                  placeholder="Enter your reason..."
                  className="w-full p-3 border rounded-xl"
                />
              </div>

              <div className="flex gap-2">
                <button onClick={() => closeEndRequestModal()} className="flex-1 py-2 bg-gray-100 rounded-xl cursor-pointer hover:bg-gray-200 transition-colors">Cancel</button>
                <button
                  onClick={requestEndOccupancy}
                  disabled={submittingEndRequest}
                  className={`flex-1 py-2 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${submittingEndRequest ? 'bg-black/70 cursor-not-allowed' : 'bg-black hover:bg-gray-800 cursor-pointer'}`}
                >
                  {submittingEndRequest ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Submitting...
                    </>
                  ) : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Cancel End-of-Stay Request Modal */}
      {
        showCancelEndModal && (
          <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCancelEndModal(false)}>
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Cancel Move-Out?</h3>
              <p className="text-sm text-gray-600 mb-5">
                Are you sure you want to cancel your move-out request? This will require your landlord&apos;s approval again to keep your stay active.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowCancelEndModal(false)}
                  disabled={submittingCancelEnd}
                  className="flex-1 py-2 bg-gray-100 rounded-xl cursor-pointer hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Hold on
                </button>
                <button
                  onClick={cancelEndOccupancyRequest}
                  disabled={submittingCancelEnd}
                  className={`flex-1 py-2 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${submittingCancelEnd ? 'bg-orange-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 cursor-pointer'}`}
                >
                  {submittingCancelEnd ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Wait...
                    </>
                  ) : 'Yes, Cancel Move-Out'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Leave Family Modal */}
      {
        showLeaveFamilyModal && (
          <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeLeaveFamilyModal}>
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Leave Family Group?</h3>
              <p className="text-sm text-gray-600 mb-5">You will lose access to this active stay and related family member privileges.</p>

              <div className="flex gap-2">
                <button
                  onClick={closeLeaveFamilyModal}
                  disabled={leavingFamily}
                  className="flex-1 py-2 bg-gray-100 rounded-xl cursor-pointer hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={leaveFamilyGroup}
                  disabled={leavingFamily}
                  className={`flex-1 py-2 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${leavingFamily ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 cursor-pointer'}`}
                >
                  {leavingFamily ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Leaving...
                    </>
                  ) : 'Yes, Leave'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Review Modal */}
      {
        showReviewModal && reviewTarget && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCancelReview}>
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto relative" style={{ animation: 'reviewModalIn 0.25s ease-out' }} onClick={e => e.stopPropagation()}>

              {/* Close (X) Button — just closes, doesn't permanently dismiss */}
              <button
                onClick={handleCancelReview}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-600">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">How was your stay?</h2>
                <p className="text-gray-500 text-sm">You recently ended your stay at <strong>{reviewTarget.property?.title}</strong> ({new Date(reviewTarget.start_date || reviewTarget.created_at).toLocaleDateString()} - {new Date(reviewTarget.end_date || new Date()).toLocaleDateString()}). We&apos;d love to hear your feedback!</p>
              </div>

              {/* Rating Categories */}
              <div className="space-y-5 mb-6">
                {/* Cleanliness Rating */}
                <div className="bg-gray-50 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                      </div>
                      <span className="font-bold text-gray-800">Cleanliness</span>
                    </div>
                    <span className="text-sm font-bold text-gray-500">{cleanlinessRating}/5</span>
                  </div>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setCleanlinessRating(star)} className="focus:outline-none transition-transform hover:scale-110 cursor-pointer">
                        <svg className={`w-8 h-8 ${star <= cleanlinessRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Communication Rating */}
                <div className="bg-gray-50 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      </div>
                      <span className="font-bold text-gray-800">Communication</span>
                    </div>
                    <span className="text-sm font-bold text-gray-500">{communicationRating}/5</span>
                  </div>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setCommunicationRating(star)} className="focus:outline-none transition-transform hover:scale-110 cursor-pointer">
                        <svg className={`w-8 h-8 ${star <= communicationRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location Rating */}
                <div className="bg-gray-50 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </div>
                      <span className="font-bold text-gray-800">Location</span>
                    </div>
                    <span className="text-sm font-bold text-gray-500">{locationRating}/5</span>
                  </div>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setLocationRating(star)} className="focus:outline-none transition-transform hover:scale-110 cursor-pointer">
                        <svg className={`w-8 h-8 ${star <= locationRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Landlord Rating */}
                <div className="bg-gray-50 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A3 3 0 016 17h12a3 3 0 01.879.132M15 11a3 3 0 11-6 0 3 3 0 016 0zM19 21v-1a4 4 0 00-4-4H9a4 4 0 00-4 4v1" /></svg>
                      </div>
                      <span className="font-bold text-gray-800">Landlord</span>
                    </div>
                    <span className="text-sm font-bold text-gray-500">{landlordRating}/5</span>
                  </div>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setLandlordRating(star)} className="focus:outline-none transition-transform hover:scale-110 cursor-pointer">
                        <svg className={`w-8 h-8 ${star <= landlordRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Overall Rating Display */}
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-4 mb-6 border border-yellow-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-800">Overall Rating</span>
                  <div className="flex items-center gap-2">
                    <svg className="w-6 h-6 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                    <span className="text-2xl font-black text-gray-900">{((cleanlinessRating + communicationRating + locationRating) / 3).toFixed(1)}</span>
                    <span className="text-gray-400 text-sm">/5</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">Average of Cleanliness, Communication & Location</p>
              </div>

              {/* Text Review (Optional) */}
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Write your experience here (optional)..."
                className="w-full p-4 border border-gray-200 rounded-xl mb-4 text-sm bg-gray-50 focus:bg-white focus:border-black outline-none resize-none h-28"
              />

              {/* Don't show again checkbox */}
              <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShowReviewAgain}
                  onChange={(e) => setDontShowReviewAgain(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black cursor-pointer"
                />
                <span className="text-sm text-gray-500">Don&apos;t show this again for this property</span>
              </label>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleSkipReview}
                  className="flex-1 py-3.5 rounded-xl font-bold border border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100 transition-all cursor-pointer"
                >
                  Skip Review
                </button>
                <button
                  onClick={submitReview}
                  disabled={submittingReview}
                  className={`flex-1 py-3.5 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 ${submittingReview ? 'bg-gray-400 cursor-not-allowed' : 'bg-black hover:bg-gray-800 hover:shadow-xl cursor-pointer'}`}
                >
                  {submittingReview ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Submitting...
                    </>
                  ) : 'Submit Review'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Review Modal Animation */}
      <style jsx>{`
        @keyframes reviewModalIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <Footer />
    </div >
  )
}

