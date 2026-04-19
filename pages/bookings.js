import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import { useEffect, useRef, useState } from 'react'
import { createNotification } from '../lib/notifications'
import { supabase } from '../lib/supabaseClient'

const BOOKINGS_PER_PAGE = 5
const ACTIVE_BOOKING_STATUSES = ['pending', 'pending_approval', 'approved', 'accepted', 'viewing_done', 'assigned']
const SLOT_LOCKING_BOOKING_STATUSES = ['pending', 'pending_approval', 'approved', 'accepted', 'rejected']
const PENDING_BOOKING_STATUSES = ['pending', 'pending_approval']
const ASSIGNMENT_RELATED_BOOKING_STATUSES = ['pending', 'pending_approval', 'approved', 'accepted', 'viewing_done', 'assigned']
const TENANT_PREFERRED_SCHEDULE_LABEL = 'TENANTS PREFEREED SCHEDULE'
const EMPTY_STATUS_SUMMARY = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  completed: 0,
}

function getTodayDateInputValue() {
  const now = new Date()
  const tzOffset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - tzOffset).toISOString().split('T')[0]
}

function parseTenantPreferredSchedule(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null

  const normalizedTime = timeValue.length === 5 ? `${timeValue}:00` : timeValue
  const parsedDate = new Date(`${dateValue}T${normalizedTime}`)
  if (Number.isNaN(parsedDate.getTime())) return null

  return parsedDate
}

function parseTenantPreferredScheduleRange(dateValue, startTimeValue, endTimeValue) {
  if (!dateValue || !startTimeValue || !endTimeValue) return null

  const startDate = parseTenantPreferredSchedule(dateValue, startTimeValue)
  const endDate = parseTenantPreferredSchedule(dateValue, endTimeValue)

  if (!startDate || !endDate) return null
  if (endDate.getTime() <= startDate.getTime()) return null

  return { startDate, endDate }
}

function buildBookingNotesWithPreferredSchedule(rawNotes, preferredDate, preferredStartTime, preferredEndTime) {
  const parsedPreferredSchedule = parseTenantPreferredScheduleRange(preferredDate, preferredStartTime, preferredEndTime)
  const sanitizedNotes = String(rawNotes || '')
    .split('\n')
    .filter((line) => !line.trim().toUpperCase().startsWith(`${TENANT_PREFERRED_SCHEDULE_LABEL}:`))
    .join('\n')
    .trim()

  if (!parsedPreferredSchedule) return sanitizedNotes

  const preferredDateText = parsedPreferredSchedule.startDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
  const preferredStartText = parsedPreferredSchedule.startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  })
  const preferredEndText = parsedPreferredSchedule.endDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  })
  const preferredScheduleText = `${preferredDateText} ${preferredStartText} - ${preferredEndText}`

  return sanitizedNotes
    ? `${TENANT_PREFERRED_SCHEDULE_LABEL}: ${preferredScheduleText}\n${sanitizedNotes}`
    : `${TENANT_PREFERRED_SCHEDULE_LABEL}: ${preferredScheduleText}`
}

function extractTenantPreferredSchedule(notesValue) {
  if (!notesValue) {
    return {
      preferredScheduleText: '',
      cleanNotes: ''
    }
  }

  const lines = String(notesValue).split('\n')
  let preferredScheduleText = ''
  const cleanLines = []

  lines.forEach((line) => {
    const trimmedLine = line.trim()
    const normalizedLine = trimmedLine.toUpperCase()
    const schedulePrefix = `${TENANT_PREFERRED_SCHEDULE_LABEL}:`

    if (!preferredScheduleText && normalizedLine.startsWith(schedulePrefix)) {
      preferredScheduleText = trimmedLine.slice(schedulePrefix.length).trim()
      return
    }

    cleanLines.push(line)
  })

  return {
    preferredScheduleText,
    cleanNotes: cleanLines.join('\n').trim()
  }
}

function parsePreferredScheduleText(preferredScheduleText) {
  if (!preferredScheduleText) return null

  const trimmedText = String(preferredScheduleText).trim()
  const rangeSeparatorIndex = trimmedText.lastIndexOf(' - ')
  if (rangeSeparatorIndex < 0) return null

  const startText = trimmedText.slice(0, rangeSeparatorIndex).trim()
  const endTimeText = trimmedText.slice(rangeSeparatorIndex + 3).trim()
  const startDate = new Date(startText)

  if (Number.isNaN(startDate.getTime())) return null

  const endDate = new Date(`${startDate.toDateString()} ${endTimeText}`)

  return {
    startDate,
    endDate: Number.isNaN(endDate.getTime()) ? null : endDate
  }
}

function getBookingScheduleReferenceDate(booking) {
  if (!booking) return null

  const preferredScheduleInfo = extractTenantPreferredSchedule(booking.notes)
  const parsedPreferredSchedule = parsePreferredScheduleText(preferredScheduleInfo.preferredScheduleText)

  if (parsedPreferredSchedule?.endDate) return parsedPreferredSchedule.endDate
  if (parsedPreferredSchedule?.startDate) return parsedPreferredSchedule.startDate

  const fallbackValues = [booking.end_time, booking.start_time, booking.booking_date]
  for (const value of fallbackValues) {
    if (!value) continue

    const parsedValue = new Date(value)
    if (!Number.isNaN(parsedValue.getTime())) {
      return parsedValue
    }
  }

  return null
}

function buildStatusSummary(rows = []) {
  return rows.reduce((summary, row) => {
    const status = String(row?.status || '').toLowerCase()

    summary.total += 1

    if (status === 'pending' || status === 'pending_approval') {
      summary.pending += 1
    } else if (status === 'approved' || status === 'accepted' || status === 'viewing_done') {
      summary.approved += 1
    } else if (status === 'assigned' || status === 'completed') {
      summary.completed += 1
    } else if (status === 'rejected' || status === 'cancelled') {
      summary.rejected += 1
    }

    return summary
  }, { ...EMPTY_STATUS_SUMMARY })
}

function shouldExcludeBookingFromAvailability(booking) {
  if (!booking || booking.is_application) return false
  const status = String(booking.status || '').toLowerCase()
  return ACTIVE_BOOKING_STATUSES.includes(status)
}

export default function BookingsPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState([])
  const [totalBookingCount, setTotalBookingCount] = useState(0)
  const [statusSummary, setStatusSummary] = useState(EMPTY_STATUS_SUMMARY)
  const [filter, setFilter] = useState('all')
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [availableTimeSlots, setAvailableTimeSlots] = useState([])
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('')
  const [selectedBookingDate, setSelectedBookingDate] = useState('')
  const [bookingCalendarMonth, setBookingCalendarMonth] = useState(new Date())
  const [bookingNotes, setBookingNotes] = useState('')
  const [preferredScheduleDate, setPreferredScheduleDate] = useState('')
  const [preferredScheduleTime, setPreferredScheduleTime] = useState('')
  const [preferredScheduleEndTime, setPreferredScheduleEndTime] = useState('')
  const [showPreferredSchedulePicker, setShowPreferredSchedulePicker] = useState(false)
  const [submittingBooking, setSubmittingBooking] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [bookingToCancel, setBookingToCancel] = useState(null)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [bookingToReject, setBookingToReject] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [showTenantModifyWarningModal, setShowTenantModifyWarningModal] = useState(false)
  const [pendingTenantModifyAction, setPendingTenantModifyAction] = useState(null)
  const [showSubmitScheduleWarningModal, setShowSubmitScheduleWarningModal] = useState(false)
  const [pendingSubmitScheduleWarning, setPendingSubmitScheduleWarning] = useState(null)
  const [showViewingSuccessWarningModal, setShowViewingSuccessWarningModal] = useState(false)
  const [bookingToMarkSuccess, setBookingToMarkSuccess] = useState(null)
  const [sameDateConflictBookings, setSameDateConflictBookings] = useState([])
  const [showLandlordCancelWarningModal, setShowLandlordCancelWarningModal] = useState(false)
  const [bookingToCancelByLandlord, setBookingToCancelByLandlord] = useState(null)
  const [processingAction, setProcessingAction] = useState(null) // tracks which booking.id + action is in progress
  const [hasActiveOccupancy, setHasActiveOccupancy] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const skeletonBookingIndices = Array.from({ length: BOOKINGS_PER_PAGE }, (_, index) => index)

  // Assign Tenant Modal States
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignBooking, setAssignBooking] = useState(null)
  const [availableProperties, setAvailableProperties] = useState([])
  const [selectedPropertyId, setSelectedPropertyId] = useState('')
  const [penaltyDetails, setPenaltyDetails] = useState('')
  const [startDate, setStartDate] = useState('')
  const [wifiDueDay, setWifiDueDay] = useState('')
  const [wifiPayment, setWifiPayment] = useState('')
  const [waterDueDay, setWaterDueDay] = useState('')
  const [waterPayment, setWaterPayment] = useState('')
  const [electricityDueDay, setElectricityDueDay] = useState('')
  const [electricityPayment, setElectricityPayment] = useState('')
  const [contractPdf, setContractPdf] = useState(null)

  const [showWifiDayPicker, setShowWifiDayPicker] = useState(false)
  const [showWaterDayPicker, setShowWaterDayPicker] = useState(false)
  const [showElectricityDayPicker, setShowElectricityDayPicker] = useState(false)

  const [showAssignWarning, setShowAssignWarning] = useState(false)
  const realtimeRefreshTimeoutRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
      } else {
        router.push('/')
      }
    })
  }, [router])

  useEffect(() => {
    if (session && profile) {
      loadBookings(currentPage, filter)
    }
  }, [session, profile, currentPage, filter])

  useEffect(() => {
    setCurrentPage(1)
    setBookings([])
    setLoading(true)
  }, [filter])

  useEffect(() => {
    if (!session?.user?.id || !profile?.role) return

    const userId = session.user.id
    const roleLower = String(profile.role || '').toLowerCase()
    const bookingFilter = roleLower === 'landlord'
      ? `landlord=eq.${userId}`
      : `tenant=eq.${userId}`

    const scheduleRealtimeRefresh = () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current)
      }

      // Debounce bursts of updates from status transitions.
      realtimeRefreshTimeoutRef.current = setTimeout(() => {
        loadBookings(currentPage, filter)
      }, 150)
    }

    const channelName = `bookings-realtime-${userId}-${roleLower}-${currentPage}-${filter}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: bookingFilter,
      }, scheduleRealtimeRefresh)

    if (roleLower === 'landlord') {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tenant_occupancies',
        filter: `landlord_id=eq.${userId}`,
      }, scheduleRealtimeRefresh)

      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'properties',
        filter: `landlord=eq.${userId}`,
      }, scheduleRealtimeRefresh)
    } else {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'applications',
        filter: `tenant=eq.${userId}`,
      }, scheduleRealtimeRefresh)

      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tenant_occupancies',
        filter: `tenant_id=eq.${userId}`,
      }, scheduleRealtimeRefresh)
    }

    const focusRefresh = () => scheduleRealtimeRefresh()
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', focusRefresh)
    }

    const fallbackIntervalId = setInterval(() => {
      scheduleRealtimeRefresh()
    }, 10000)

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        scheduleRealtimeRefresh()
      }
    })

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current)
        realtimeRefreshTimeoutRef.current = null
      }

      clearInterval(fallbackIntervalId)

      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', focusRefresh)
      }

      supabase.removeChannel(channel)
    }
  }, [session?.user?.id, profile?.role, currentPage, filter])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (data) {
      setProfile(data)
    }
    setLoading(false)
  }

  async function hasInheritedActiveOccupancy(userId) {
    if (!userId) return false
    try {
      const response = await fetch(`/api/family-members?member_id=${userId}`, { cache: 'no-store' })
      if (!response.ok) return false
      const data = await response.json()
      return !!data?.occupancy
    } catch (err) {
      console.error('Error checking inherited occupancy on bookings page:', err)
      return false
    }
  }

  async function syncTimeSlotBookedFlags(slotIds = []) {
    const uniqueSlotIds = [...new Set((slotIds || []).filter(Boolean))]
    if (uniqueSlotIds.length === 0) return

    const { data: slotLockingRows, error: activeRowsError } = await supabase
      .from('bookings')
      .select('time_slot_id')
      .in('time_slot_id', uniqueSlotIds)
      .in('status', SLOT_LOCKING_BOOKING_STATUSES)

    if (activeRowsError) {
      console.error('Failed to sync slot booking flags:', activeRowsError)
      return
    }

    const bookedSet = new Set((slotLockingRows || []).map(row => row.time_slot_id).filter(Boolean))
    const bookedIds = uniqueSlotIds.filter(slotId => bookedSet.has(slotId))
    const freeIds = uniqueSlotIds.filter(slotId => !bookedSet.has(slotId))

    if (bookedIds.length > 0) {
      await supabase.from('available_time_slots').update({ is_booked: true }).in('id', bookedIds)
    }

    if (freeIds.length > 0) {
      await supabase.from('available_time_slots').update({ is_booked: false }).in('id', freeIds)
    }
  }

  async function fetchOpenSlotsForProperty(landlordId, propertyId, excludeBookingId = null) {
    if (!landlordId || !propertyId) return []

    const params = new URLSearchParams({
      propertyId: String(propertyId),
      landlordId: String(landlordId),
      includeBookedSlots: '1',
    })

    if (excludeBookingId) {
      params.set('excludeBookingId', String(excludeBookingId))
    }

    try {
      const response = await fetch(`/api/available-slots?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store'
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error || `Availability API failed with status ${response.status}`)
      }

      const payload = await response.json()
      return Array.isArray(payload?.slots) ? payload.slots : []
    } catch (error) {
      console.error('Failed to load available slots:', error)
      return []
    }
  }

  function applyFilterToBookingQuery(query, activeFilter) {
    if (activeFilter === 'pending_approval') {
      return query.in('status', ['pending', 'pending_approval'])
    }
    if (activeFilter === 'approved') {
      return query.in('status', ['approved', 'accepted', 'viewing_done'])
    }
    if (activeFilter === 'rejected') {
      return query.in('status', ['rejected', 'cancelled'])
    }
    if (activeFilter === 'completed') {
      return query.in('status', ['assigned', 'completed'])
    }
    return query
  }

  async function loadBookings(page = currentPage, activeFilter = filter) {
    setLoading(true)
    let bookingsData = []
    let hasActiveOccupancyNow = false
    let nextStatusSummary = { ...EMPTY_STATUS_SUMMARY }
    let useClientSidePagination = true
    const from = (page - 1) * BOOKINGS_PER_PAGE
    const to = from + BOOKINGS_PER_PAGE - 1
    let dbCount = 0

    const userRole = (profile.role || '').toLowerCase();

    if (userRole === 'landlord') {
      setHasActiveOccupancy(false)
      const { data: myProperties, error: propError } = await supabase
        .from('properties')
        .select('id, title, landlord')
        .eq('landlord', session.user.id)

      if (propError) console.error('Error loading properties:', propError)

      if (!myProperties || myProperties.length === 0) {
        setBookings([])
        setTotalBookingCount(0)
        setStatusSummary(EMPTY_STATUS_SUMMARY)
        setLoading(false)
        return
      }

      const propertyIds = myProperties.map(p => p.id)

      const { data: landlordStatusRows, error: landlordStatusError } = await supabase
        .from('bookings')
        .select('status')
        .in('property_id', propertyIds)

      if (landlordStatusError) {
        console.error('Error loading landlord booking status summary:', landlordStatusError)
      } else {
        nextStatusSummary = buildStatusSummary(landlordStatusRows || [])
      }

      let query = supabase
        .from('bookings')
        .select('*', { count: 'exact' })
        .in('property_id', propertyIds)
        .order('booking_date', { ascending: false })
      query = applyFilterToBookingQuery(query, activeFilter)

      const { data, error, count } = await query
      if (error) {
        console.error('Error loading bookings:', error)
      } else {
        bookingsData = data || []
        dbCount = count || 0
      }

    } else {
      // --- TENANT LOGIC ---

      const { data: activeOccupancy } = await supabase
        .from('tenant_occupancies')
        .select('id')
        .eq('tenant_id', session.user.id)
        .in('status', ['active', 'pending_end'])
        .limit(1)
        .maybeSingle()

      const hasFamilyOccupancy = !activeOccupancy && await hasInheritedActiveOccupancy(session.user.id)
      hasActiveOccupancyNow = !!activeOccupancy || hasFamilyOccupancy
      setHasActiveOccupancy(hasActiveOccupancyNow)

      const { data: tenantStatusRows, error: tenantStatusError } = await supabase
        .from('bookings')
        .select('status')
        .eq('tenant', session.user.id)

      if (tenantStatusError) {
        console.error('Error loading tenant booking status summary:', tenantStatusError)
      } else {
        nextStatusSummary = buildStatusSummary(tenantStatusRows || [])
      }

      // 1. Fetch Existing Bookings
      let query = supabase
        .from('bookings')
        .select('*', { count: 'exact' })
        .eq('tenant', session.user.id)
        .order('booking_date', { ascending: false })
      query = applyFilterToBookingQuery(query, activeFilter)

      const { data: existingBookings, error, count } = await query
      if (error) console.error('Error loading bookings:', error)

      bookingsData = existingBookings || []
      dbCount = count || 0

      // 2. Fetch "Accepted" Applications (Ready to Book)
      // FIX: Remove 'created_at' to avoid 400 Bad Request if column doesn't exist
      const { data: acceptedApps } = await supabase
        .from('applications')
        .select('id, property_id, tenant, status, message')
        .eq('tenant', session.user.id)
        .eq('status', 'accepted')

      if (page === 1 && activeFilter === 'all' && acceptedApps && acceptedApps.length > 0) {
        const appsToBook = acceptedApps.map(app => ({
          id: app.id,
          is_application: true,
          property_id: app.property_id,
          tenant: app.tenant,
          booking_date: null,
          status: 'ready_to_book',
          notes: app.message
        }))

        bookingsData = [...appsToBook, ...bookingsData]
      }
    }

    setTotalBookingCount(dbCount)
    setStatusSummary(nextStatusSummary)

    if (!bookingsData || bookingsData.length === 0) {
      setBookings([])
      setLoading(false)
      return
    }

    // ENRICHMENT
    const isUuid = (value) =>
      typeof value === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

    const bookingPropertyIds = [...new Set(bookingsData.map(b => b.property_id).filter(Boolean))]
    const tenantIds = [...new Set(bookingsData.map(b => b.tenant).filter(isUuid))]

    const propertyMap = {}
    if (bookingPropertyIds.length > 0) {
      const { data: properties, error: propertiesError } = await supabase
        .from('properties')
        .select('id, title, address, city, landlord, status')
        .in('id', bookingPropertyIds)

      if (propertiesError) {
        console.error('Error loading booking properties:', propertiesError)
      }

      properties?.forEach(p => {
        propertyMap[p.id] = p
      })
    }

    const tenantMap = {}
    if (tenantIds.length > 0) {
      const { data: tenantProfiles, error: tenantProfilesError } = await supabase
        .from('profiles')
        .select('id, first_name, middle_name, last_name, email, phone, avatar_url')
        .in('id', tenantIds)

      if (tenantProfilesError) {
        console.error('Error loading booking tenant profiles:', tenantProfilesError)
      }

      tenantProfiles?.forEach(t => {
        tenantMap[t.id] = t
      })
    }

    const enrichedBookings = bookingsData.map(booking => ({
      ...booking,
      property: propertyMap[booking.property_id],
      tenant_profile: tenantMap[booking.tenant]
    }))

    let finalBookings = enrichedBookings;

    const getBookingUpdatedTimestamp = (booking) => {
      const fallbackValues = [booking?.updated_at, booking?.created_at, booking?.booking_date, booking?.start_time, booking?.end_time]
      for (const value of fallbackValues) {
        if (!value) continue
        const parsedValue = new Date(value)
        if (!Number.isNaN(parsedValue.getTime())) {
          return parsedValue.getTime()
        }
      }

      return Number.NEGATIVE_INFINITY
    }

    finalBookings.sort((a, b) => {
      const timeA = getBookingUpdatedTimestamp(a)
      const timeB = getBookingUpdatedTimestamp(b)

      if (timeA !== timeB) {
        return timeB - timeA
      }

      const createdA = new Date(a?.created_at || 0).getTime()
      const createdB = new Date(b?.created_at || 0).getTime()
      return createdB - createdA
    })

    // Keep booking status synced when assignments are completed from mobile clients.
    const syncCandidates = finalBookings.filter((booking) => {
      if (!booking || booking.is_application) return false
      if (!booking.id || !booking.tenant || !booking.property_id) return false
      const status = String(booking.status || '').toLowerCase()
      return ASSIGNMENT_RELATED_BOOKING_STATUSES.includes(status)
    })

    if (syncCandidates.length > 0) {
      const syncTenantIds = [...new Set(syncCandidates.map((booking) => booking.tenant).filter(isUuid))]
      const syncPropertyIds = [...new Set(syncCandidates.map((booking) => booking.property_id).filter(Boolean))]

      if (syncTenantIds.length > 0 && syncPropertyIds.length > 0) {
        const { data: activeOccupancies, error: occupancySyncError } = await supabase
          .from('tenant_occupancies')
          .select('tenant_id, property_id')
          .in('tenant_id', syncTenantIds)
          .in('property_id', syncPropertyIds)
          .in('status', ['active', 'pending_end'])

        if (occupancySyncError) {
          console.error('Error syncing booking statuses from occupancies:', occupancySyncError)
        } else {
          const occupancyKeys = new Set((activeOccupancies || []).map((row) => `${row.tenant_id}|${row.property_id}`))
          const completedBookingIds = syncCandidates
            .filter((booking) => occupancyKeys.has(`${booking.tenant}|${booking.property_id}`))
            .map((booking) => booking.id)

          if (completedBookingIds.length > 0) {
            const { error: statusSyncError } = await supabase
              .from('bookings')
              .update({ status: 'completed' })
              .in('id', completedBookingIds)
              .in('status', ASSIGNMENT_RELATED_BOOKING_STATUSES)

            if (statusSyncError) {
              console.error('Error setting completed status after occupancy sync:', statusSyncError)
            } else {
              const completedSet = new Set(completedBookingIds)
              finalBookings = finalBookings.map((booking) =>
                completedSet.has(booking.id)
                  ? { ...booking, status: 'completed' }
                  : booking
              )
            }
          }
        }
      }
    }

    // --- AUTO-CANCEL PAST PENDING BOOKINGS ---
    const now = new Date()
    const pastPendingBookings = finalBookings.filter((booking) => {
      const status = String(booking?.status || '').toLowerCase()
      if (!PENDING_BOOKING_STATUSES.includes(status)) return false

      const scheduleReferenceDate = getBookingScheduleReferenceDate(booking)
      return Boolean(scheduleReferenceDate) && scheduleReferenceDate < now
    })

    if (pastPendingBookings.length > 0) {
      const pastIds = pastPendingBookings.map(b => b.id)

      // Update status to cancelled in the DB
      await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .in('id', pastIds)

      // Free up their time slots
      const slotIds = pastPendingBookings
        .map(b => b.time_slot_id)
        .filter(Boolean)
      if (slotIds.length > 0) {
        await syncTimeSlotBookedFlags(slotIds)
      }

      // Send notifications to tenants about auto-cancellation
      for (const booking of pastPendingBookings) {
        try {
          await createNotification({
            recipient: booking.tenant,
            actor: booking.tenant, // system action
            type: 'booking_auto_cancelled',
            message: `Your viewing for "${booking.property?.title || 'a property'}" was auto-cancelled because the scheduled date has passed. Please book a new viewing schedule.`,
            link: '/bookings'
          })
        } catch (err) {
          console.error('Auto-cancel notification error:', err)
        }
      }

      // Update local data to reflect the cancellation
      finalBookings = finalBookings.map(b =>
        pastIds.includes(b.id) ? { ...b, status: 'cancelled' } : b
      )
    }

    if (userRole === 'landlord' && activeFilter === 'all') {
      const firstWaitingAssignment = finalBookings.find(b => (b.status || '').toLowerCase() === 'viewing_done')
      if (firstWaitingAssignment?.id) {
        const { data: latestBooking, error: latestBookingError } = await supabase
          .from('bookings')
          .select('id, status, tenant, property_id')
          .eq('id', firstWaitingAssignment.id)
          .maybeSingle()

        if (latestBookingError) {
          console.error('Error validating waiting assignment booking:', latestBookingError)
        }

        const latestStatus = String(latestBooking?.status || '').toLowerCase()

        if (latestBooking?.id && latestStatus === 'viewing_done') {
          const { data: existingOccupancy, error: occupancyError } = await supabase
            .from('tenant_occupancies')
            .select('id')
            .eq('tenant_id', latestBooking.tenant)
            .eq('property_id', latestBooking.property_id)
            .in('status', ['active', 'pending_end'])
            .limit(1)
            .maybeSingle()

          if (occupancyError) {
            console.error('Error validating occupancy before assignment redirect:', occupancyError)
          }

          if (existingOccupancy) {
            const { error: fixStatusError } = await supabase
              .from('bookings')
              .update({ status: 'completed' })
              .eq('id', latestBooking.id)
              .eq('status', 'viewing_done')

            if (fixStatusError) {
              console.error('Failed to auto-sync completed booking status:', fixStatusError)
            }

            finalBookings = finalBookings.map((booking) =>
              booking.id === latestBooking.id ? { ...booking, status: 'completed' } : booking
            )
          }
        }
      }
    }

    if (useClientSidePagination) {
      setBookings(finalBookings.slice(from, to + 1))
    } else {
      setBookings(finalBookings.slice(0, BOOKINGS_PER_PAGE))
    }
    setLoading(false)
  }

  // --- ACTIONS ---
  async function approveBooking(booking) {
    setProcessingAction(`approve-${booking.id}`)
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'approved' })
        .eq('id', booking.id)

      if (!error) {
        await syncTimeSlotBookedFlags([booking.time_slot_id])

        await createNotification({
          recipient: booking.tenant,
          actor: session.user.id,
          type: 'booking_approved',
          message: `Your viewing request for ${booking.property?.title} on ${new Date(booking.booking_date).toLocaleString('en-US')} has been approved!`,
          link: '/bookings'
        })

        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'booking_status',
            recordId: booking.id,
            actorId: session.user.id
          })
        })

        try {
          fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: booking.id })
          })
        } catch (e) { console.error(e) }

        showToast.success('Booking approved!', {
          duration: 4000,
          position: 'top-center',
          transition: 'bounceIn'
        })

        loadBookings()
      } else {
        showToast.error('Failed to approve booking', { duration: 4000, position: "top-center", transition: "bounceIn" });
      }
    } finally { setProcessingAction(null) }
  }

  async function markViewingSuccess(booking) {
    setProcessingAction(`viewing-${booking.id}`)
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'viewing_done' })
        .eq('id', booking.id)

      if (!error) {
        await createNotification({
          recipient: booking.tenant,
          actor: session.user.id,
          type: 'viewing_success',
          message: `Your viewing for ${booking.property?.title} was marked as successful! The landlord may assign you to a property soon.`,
          link: '/bookings'
        })
        showToast.success("Viewing marked as successful! Redirecting to tenant assignment...", { duration: 2500, position: "top-center", transition: "bounceIn" });
        router.push(`/assign-tenant?bookingId=${booking.id}`)
      } else {
        showToast.error('Failed to update booking', { duration: 4000, position: "top-center", transition: "bounceIn" });
      }
    } finally { setProcessingAction(null) }
  }

  async function getSamePropertyCompetingBookings(booking) {
    if (!booking?.property_id) return []

    const { data, error } = await supabase
      .from('bookings')
      .select('id, tenant, booking_date, time_slot_id')
      .eq('property_id', booking.property_id)
      .neq('id', booking.id)
      .in('status', ACTIVE_BOOKING_STATUSES)

    if (error) {
      console.error('Failed to load same-property competing bookings:', error)
      return []
    }

    return data || []
  }

  async function handleViewingSuccessRequest(booking) {
    const competingSamePropertyBookings = await getSamePropertyCompetingBookings(booking)
    setBookingToMarkSuccess(booking)
    setSameDateConflictBookings(competingSamePropertyBookings)
    setShowViewingSuccessWarningModal(true)
  }

  function closeViewingSuccessWarningModal() {
    setShowViewingSuccessWarningModal(false)
    setBookingToMarkSuccess(null)
    setSameDateConflictBookings([])
  }

  async function notifyRejectedBookingFromViewingSuccess(conflictBooking, selectedBooking, rejectionReason) {
    await createNotification({
      recipient: conflictBooking.tenant,
      actor: session.user.id,
      type: 'booking_rejected',
      message: `Your viewing request for ${selectedBooking.property?.title || 'this property'} was rejected because another request for this property was marked as viewing success.`,
      link: '/bookings'
    })

    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'booking_rejected',
        recordId: conflictBooking.id,
        actorId: session.user.id,
        reason: rejectionReason
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to send rejection email/SMS for booking ${conflictBooking.id}`)
    }
  }

  async function confirmViewingSuccessWithWarning() {
    if (!bookingToMarkSuccess) return

    const selectedBooking = bookingToMarkSuccess
    closeViewingSuccessWarningModal()

    setProcessingAction(`viewing-${selectedBooking.id}`)
    try {
      const { data: updatedSelectedBooking, error } = await supabase
        .from('bookings')
        .update({ status: 'viewing_done' })
        .eq('id', selectedBooking.id)
        .in('status', ['approved', 'accepted'])
        .select('id')
        .maybeSingle()

      if (!error && updatedSelectedBooking) {
        const { data: latestCompetingBookings, error: latestCompetingError } = await supabase
          .from('bookings')
          .select('id, tenant, booking_date, time_slot_id')
          .eq('property_id', selectedBooking.property_id)
          .neq('id', selectedBooking.id)
          .in('status', ACTIVE_BOOKING_STATUSES)

        if (latestCompetingError) {
          console.error('Failed to load latest same-property competing bookings:', latestCompetingError)
        }

        const competingBookings = latestCompetingBookings || []
        const competingIds = competingBookings.map(item => item.id)

        let rejectedCount = 0
        let rejectedBookings = []
        if (competingIds.length > 0) {
          const { data: rejectedRows, error: rejectConflictsError } = await supabase
            .from('bookings')
            .update({ status: 'rejected' })
            .in('id', competingIds)
            .in('status', ACTIVE_BOOKING_STATUSES)
            .select('id, tenant, booking_date, time_slot_id')

          if (rejectConflictsError) {
            console.error('Failed to reject same-property competing requests:', rejectConflictsError)
            showToast.error('Viewing marked as successful, but failed to reject other requests for this property. Please review manually.', {
              duration: 5000,
              position: 'top-center',
              transition: 'bounceIn'
            })
          } else {
            rejectedBookings = rejectedRows || []
            rejectedCount = rejectedBookings.length
            const rejectionReason = 'Another request for this property was marked as viewing success.'

            const notificationResults = await Promise.allSettled(
              rejectedBookings.map((conflictBooking) =>
                notifyRejectedBookingFromViewingSuccess(conflictBooking, selectedBooking, rejectionReason)
              )
            )

            const failedNotificationCount = notificationResults.filter(result => result.status === 'rejected').length
            if (failedNotificationCount > 0) {
              console.error('Failed to send rejection SMS/email for some tenants:', failedNotificationCount)
              showToast.warning(`${failedNotificationCount} rejected tenant(s) may not have received SMS/email. Please review notifications.`, {
                duration: 6000,
                position: 'top-center',
                transition: 'bounceIn'
              })
            }
          }
        }

        const affectedSlotIds = [
          selectedBooking.time_slot_id,
          ...rejectedBookings.map(item => item.time_slot_id)
        ].filter(Boolean)

        await syncTimeSlotBookedFlags(affectedSlotIds)

        await createNotification({
          recipient: selectedBooking.tenant,
          actor: session.user.id,
          type: 'viewing_success',
          message: `Your viewing for ${selectedBooking.property?.title} was marked as successful! The landlord may assign you to a property soon.`,
          link: '/bookings'
        })

        if (rejectedCount > 0) {
          showToast.success(`Viewing marked as successful.`, {
            duration: 5000,
            position: 'top-center',
            transition: 'bounceIn'
          })
        } else {
          showToast.success("Viewing marked as successful!", { duration: 4000, position: "top-center", transition: "bounceIn" });
        }

        router.push(`/assign-tenant?bookingId=${selectedBooking.id}`)
      } else {
        showToast.error('Failed to update booking. It may have already been processed.', { duration: 4000, position: "top-center", transition: "bounceIn" });
      }
    } finally { setProcessingAction(null) }
  }

  async function cancelViewing(booking) {
    setProcessingAction(`cancel-viewing-${booking.id}`)
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', booking.id)

      if (!error) {
        if (booking.time_slot_id) {
          await syncTimeSlotBookedFlags([booking.time_slot_id])
        }
        await createNotification({
          recipient: booking.tenant,
          actor: session.user.id,
          type: 'booking_cancelled',
          message: `Your viewing for ${booking.property?.title} has been cancelled by the landlord.`,
          link: '/bookings'
        })
        showToast.success('Viewing cancelled. Tenant has been notified.', { duration: 4000, position: "top-center", transition: "bounceIn" });
        loadBookings()
      } else {
        showToast.error('Failed to cancel viewing', { duration: 4000, position: "top-center", transition: "bounceIn" });
      }
    } finally { setProcessingAction(null) }
  }

  function promptLandlordCancelViewing(booking) {
    setBookingToCancelByLandlord(booking)
    setShowLandlordCancelWarningModal(true)
  }

  async function confirmLandlordCancelViewing() {
    if (!bookingToCancelByLandlord) return

    await cancelViewing(bookingToCancelByLandlord)
    setShowLandlordCancelWarningModal(false)
    setBookingToCancelByLandlord(null)
  }

  function closeLandlordCancelWarningModal() {
    setShowLandlordCancelWarningModal(false)
    setBookingToCancelByLandlord(null)
  }

  // --- ASSIGN TENANT FUNCTIONS ---
  async function openAssignTenantModal(booking) {
    setAssignBooking(booking)
    setContractPdf(null)
    setPenaltyDetails('')
    setStartDate(new Date().toISOString().split('T')[0])
    setWifiDueDay('')
    setWifiPayment('')
    setWaterDueDay('')
    setWaterPayment('')
    setElectricityDueDay('')
    setElectricityPayment('')
    setSelectedPropertyId('')
    setShowAssignWarning(false)
    setShowWifiDayPicker(false)
    setShowWaterDayPicker(false)
    setShowElectricityDayPicker(false)

    // Load available properties for this landlord
    const { data: props } = await supabase
      .from('properties')
      .select('id, title, price, status, amenities')
      .eq('landlord', session.user.id)
      .eq('status', 'available')
      .eq('is_deleted', false)

    let properties = props || []

    // Sort: Booked property first
    if (booking.property_id) {
      properties.sort((a, b) => {
        if (a.id === booking.property_id) return -1;
        if (b.id === booking.property_id) return 1;
        return 0;
      });
    }

    setAvailableProperties(properties)
    setShowAssignModal(true)
  }

  async function confirmAssignTenant() {
    if (!assignBooking) return
    if (!selectedPropertyId) {
      showToast.error('Please select a property', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (!startDate) {
      showToast.error('Please select a start date', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }

    const selectedProp = availableProperties.find(p => p.id === selectedPropertyId)
    if (!selectedProp) return

    const selectedAmenities = selectedProp.amenities || []
    const isWaterFree = selectedAmenities.includes('Free Water')
    const isElecFree = selectedAmenities.includes('Free Electricity')
    const isWifiAvailable = selectedAmenities.includes('Wifi') || selectedAmenities.includes('WiFi') || selectedAmenities.includes('Free WiFi')
    const isWifiFree = selectedAmenities.includes('Free WiFi')

    if (isWifiAvailable && !isWifiFree && (!wifiDueDay || parseInt(wifiDueDay) <= 0 || parseInt(wifiDueDay) > 31)) {
      showToast.error('Please enter a valid Wifi Due Day (1-31)', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (isWifiAvailable && !isWifiFree && (!wifiPayment || parseFloat(wifiPayment) < 0)) {
      showToast.error('Please enter a valid monthly payment for Wifi', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (!isWaterFree && (!waterDueDay || parseInt(waterDueDay) <= 0 || parseInt(waterDueDay) > 31)) {
      showToast.error('Please enter a valid Water Due Day (1-31)', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (!isWaterFree && (!waterPayment || parseFloat(waterPayment) < 0)) {
      showToast.error('Please enter a valid monthly payment for Water', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (!isElecFree && (!electricityDueDay || parseInt(electricityDueDay) <= 0 || parseInt(electricityDueDay) > 31)) {
      showToast.error('Please enter a valid Electricity Due Day (1-31)', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }
    if (!isElecFree && (!electricityPayment || parseFloat(electricityPayment) < 0)) {
      showToast.error('Please enter a valid monthly payment for Electricity', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }

    if (!penaltyDetails || parseFloat(penaltyDetails) <= 0) {
      showToast.error('Please enter a Late Payment Fee', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }

    if (!showAssignWarning) {
      setShowAssignWarning(true)
      return
    }

    let contractPdfUrl = null
    if (contractPdf) {
      const fileName = `contract_${Date.now()}_${contractPdf.name}`
      const { error: uploadError } = await supabase.storage
        .from('payment-files')
        .upload(fileName, contractPdf)

      if (uploadError) {
        showToast.error('Failed to upload contract PDF', { duration: 4000, position: "top-center", transition: "bounceIn" });
        return
      }

      const { data: contractPublic } = supabase.storage
        .from('payment-files')
        .getPublicUrl(fileName)
      contractPdfUrl = contractPublic?.publicUrl || null
    }

    const securityDepositAmount = selectedProp.price || 0

    const { data: newOccupancy, error } = await supabase.from('tenant_occupancies').insert({
      property_id: selectedPropertyId,
      tenant_id: assignBooking.tenant,
      landlord_id: session.user.id,
      status: 'active',
      start_date: new Date(startDate).toISOString(),
      security_deposit: securityDepositAmount,
      security_deposit_used: 0,
      wifi_due_day: isWifiAvailable && !isWifiFree ? (wifiDueDay ? parseInt(wifiDueDay) : null) : null,
      water_due_day: isWaterFree ? null : (waterDueDay ? parseInt(waterDueDay) : null),
      electricity_due_day: isElecFree ? null : (electricityDueDay ? parseInt(electricityDueDay) : null),
      // NOTE: Keep monthly utility payment fields commented unless matching DB columns exist.
      // water_monthly_payment: waterPayment ? parseFloat(waterPayment) : 0,
      // electricity_monthly_payment: electricityPayment ? parseFloat(electricityPayment) : 0,
      // wifi_monthly_payment: wifiPayment ? parseFloat(wifiPayment) : 0,
      late_payment_fee: penaltyDetails ? parseFloat(penaltyDetails) : 0
    }).select('id').single()

    if (error) {
      showToast.error('Failed to assign tenant.', { duration: 4000, position: "top-center", transition: "bounceIn" }); return
    }

    const occupancyId = newOccupancy?.id
    await supabase.from('properties').update({ status: 'occupied' }).eq('id', selectedPropertyId)
    await supabase.from('bookings').update({ status: 'completed' }).eq('id', assignBooking.id)

    const rentAmount = selectedProp.price || 0
    const advanceAmount = selectedProp.price || 0
    let message = `You have been assigned to occupy "${selectedProp.title}" starting ${new Date(startDate).toLocaleDateString('en-US')}. Security deposit: ₱${Number(securityDepositAmount).toLocaleString()}.`
    if (penaltyDetails && parseFloat(penaltyDetails) > 0) message += ` Late payment fee: ₱${Number(penaltyDetails).toLocaleString()}`
    if (contractPdfUrl) message += ` Contract PDF: ${contractPdfUrl}`

    await createNotification({ recipient: assignBooking.tenant, actor: session.user.id, type: 'occupancy_assigned', message, link: '/maintenance', data: { contract_pdf_url: contractPdfUrl } })

    if (assignBooking.tenant_profile?.phone) {
      fetch('/api/send-sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: assignBooking.tenant_profile.phone, message }) }).catch(err => console.error('SMS Error:', err))
    }
    fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: assignBooking.id, type: 'assignment', customMessage: message }) }).catch(err => console.error('Email Error:', err))

    // Send dedicated Move-In Welcome notification (Email + SMS with premium templates)
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'move_in',
        recordId: occupancyId,
        tenantName: getProfileDisplayName(assignBooking.tenant_profile, 'Tenant'),
        tenantPhone: assignBooking.tenant_profile?.phone,
        tenantEmail: null, // Will be fetched server-side if needed
        propertyTitle: selectedProp.title,
        propertyAddress: '',
        startDate: startDate,
        landlordName: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
        landlordPhone: profile?.phone || '',
        securityDeposit: securityDepositAmount,
        rentAmount: rentAmount,
        contractPdfUrl
      })
    }).catch(err => console.error('Move-in notification error:', err))

    const dueDate = new Date(startDate)
    try {
      const { error: billError } = await supabase.from('payment_requests').insert({
        landlord: session.user.id, tenant: assignBooking.tenant, property_id: selectedPropertyId, occupancy_id: occupancyId,
        rent_amount: rentAmount, security_deposit_amount: securityDepositAmount, advance_amount: advanceAmount,
        water_bill: 0, electrical_bill: 0, other_bills: 0,
        bills_description: 'Move-in Payment (Rent + Advance + Security Deposit)',
        due_date: dueDate.toISOString(), status: 'pending', is_move_in_payment: true
      })
      if (!billError) {
        const totalAmount = rentAmount + advanceAmount + securityDepositAmount
        await createNotification({ recipient: assignBooking.tenant, actor: session.user.id, type: 'payment_request', message: `Move-in payment: ₱${Number(totalAmount).toLocaleString()} Total. Due: ${dueDate.toLocaleDateString('en-US')}`, link: '/payments' })
      }
    } catch (err) { console.error('Auto-bill exception:', err) }

    showToast.success('Tenant assigned! Move-in payment bill sent.', { duration: 4000, position: "top-center", transition: "bounceIn" })
    setShowAssignModal(false)
    setShowAssignWarning(false)
    loadBookings()
  }

  function promptRejectBooking(booking) {
    setBookingToReject(booking)
    setRejectionReason('')
    setShowRejectModal(true)
  }

  async function rejectBooking(booking, reason) {
    const normalizedReason = (reason || '').trim()
    if (!normalizedReason) {
      showToast.error('Please provide a reason for rejection.', { duration: 4000, transition: "bounceIn" })
      return
    }

    setProcessingAction(`reject-${booking.id}`)
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'rejected' })
        .eq('id', booking.id)

      if (!error) {
        if (booking.time_slot_id) {
          await syncTimeSlotBookedFlags([booking.time_slot_id])
        }

        await createNotification({
          recipient: booking.tenant,
          actor: session.user.id,
          type: 'booking_rejected',
          message: `Your viewing request for ${booking.property?.title} has been rejected. Reason: ${normalizedReason}`,
          link: '/bookings'
        })

        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'booking_rejected',
            recordId: booking.id,
            actorId: session.user.id,
            reason: normalizedReason
          })
        }).catch(err => console.error('Reject notify error:', err))

        showToast.success('Booking rejected and tenant notified', { duration: 4000, transition: "bounceIn" });
        setShowRejectModal(false)
        setBookingToReject(null)
        setRejectionReason('')
        loadBookings()
      } else {
        showToast.error('Failed to reject booking', { duration: 4000, transition: "bounceIn" });
      }
    } finally { setProcessingAction(null) }
  }

  async function confirmRejectBooking() {
    if (!bookingToReject) return
    await rejectBooking(bookingToReject, rejectionReason)
  }

  function isWithinOneHourBeforeSchedule(bookingDate) {
    if (!bookingDate) return false

    const now = new Date()
    const booking = new Date(bookingDate)
    if (Number.isNaN(booking.getTime())) return false

    const diffInMinutes = (booking - now) / (1000 * 60)
    return diffInMinutes >= 0 && diffInMinutes <= 60
  }

  async function executeTenantModifyAction(actionType, booking) {
    if (!booking) return

    if (actionType === 'cancel') {
      promptCancelBooking(booking)
      return
    }

    await openBookingModal(booking)
  }

  function closeTenantModifyWarningModal() {
    setShowTenantModifyWarningModal(false)
    setPendingTenantModifyAction(null)
  }

  function requestTenantModifyAction(booking, actionType, scheduleDateValue) {
    if (isWithinOneHourBeforeSchedule(scheduleDateValue)) {
      setPendingTenantModifyAction({ booking, actionType, scheduleDateValue })
      setShowTenantModifyWarningModal(true)
      return
    }

    void executeTenantModifyAction(actionType, booking)
  }

  function confirmTenantModifyWarning() {
    if (!pendingTenantModifyAction?.booking || !pendingTenantModifyAction?.actionType) {
      closeTenantModifyWarningModal()
      return
    }

    const { booking, actionType } = pendingTenantModifyAction
    closeTenantModifyWarningModal()
    void executeTenantModifyAction(actionType, booking)
  }

  function closeSubmitScheduleWarningModal() {
    setShowSubmitScheduleWarningModal(false)
    setPendingSubmitScheduleWarning(null)
  }

  function confirmSubmitScheduleWarningModal() {
    closeSubmitScheduleWarningModal()
    void submitBooking(null, true)
  }

  function promptCancelBooking(booking) {
    setBookingToCancel(booking)
    setShowCancelModal(true)
  }

  // 2. Execute the actual cancellation
  async function confirmCancelBooking() {
    if (!bookingToCancel) return
    setProcessingAction(`cancel-${bookingToCancel.id}`)
    try {

      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingToCancel.id)

      if (!error) {
        if (bookingToCancel.time_slot_id) {
          await syncTimeSlotBookedFlags([bookingToCancel.time_slot_id])
        }
        showToast.success('Booking cancelled', { duration: 4000, transition: "bounceIn" });
        loadBookings();
      } else {
        showToast.error('Failed to cancel booking', { duration: 4000, transition: "bounceIn" });
      }

      // Cleanup
      setShowCancelModal(false)
      setBookingToCancel(null)
    } finally { setProcessingAction(null) }
  }

  // --- MODAL FUNCTIONS ---
  async function openBookingModal(booking) {
    if (!hasActiveOccupancy) {
      const hasFamilyOccupancy = await hasInheritedActiveOccupancy(session?.user?.id)
      if (hasFamilyOccupancy) {
        setHasActiveOccupancy(true)
        showToast.error('Booking limit reached: You already have an active property.')
        return
      }
    }

    if (hasActiveOccupancy) {
      showToast.error('Booking limit reached: You already have an active property.')
      return
    }

    const { data: latestProperty, error: latestPropertyError } = await supabase
      .from('properties')
      .select('id, status, landlord, title')
      .eq('id', booking.property_id)
      .maybeSingle()

    if (latestPropertyError || !latestProperty) {
      showToast.error('Cannot schedule: Property information is unavailable right now.')
      return
    }

    const latestStatus = String(latestProperty.status || '').toLowerCase()
    if (latestStatus !== 'available') {
      showToast.error('This property is already occupied or unavailable. You cannot book viewing again.', {
        duration: 4000,
        transition: 'bounceIn'
      })
      return
    }

    if (!latestProperty.landlord) {
      showToast.error("Cannot schedule: Landlord info missing")
      return
    }

    const bookingWithLatestProperty = {
      ...booking,
      property: {
        ...booking.property,
        status: latestProperty.status,
        landlord: latestProperty.landlord,
        title: latestProperty.title || booking.property?.title
      }
    }

    setSelectedApplication(bookingWithLatestProperty)
    setShowBookingModal(true)
    setBookingNotes('')
    setSelectedTimeSlot('')
    setSelectedBookingDate('')
    setPreferredScheduleDate('')
    setPreferredScheduleTime('')
    setPreferredScheduleEndTime('')
    setShowPreferredSchedulePicker(false)
    setBookingCalendarMonth(new Date())

    const excludeBookingId = shouldExcludeBookingFromAvailability(bookingWithLatestProperty)
      ? bookingWithLatestProperty.id
      : null
    const fetchedSlots = await fetchOpenSlotsForProperty(bookingWithLatestProperty.property.landlord, bookingWithLatestProperty.property_id, excludeBookingId)
    setAvailableTimeSlots(fetchedSlots)

    if (fetchedSlots.length > 0) {
      const now = new Date()
      const firstAvailableSlot = fetchedSlots
        .slice()
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        .find((slot) => {
          if (slot.is_available === false) return false
          const slotStart = new Date(slot.start_time)
          return !Number.isNaN(slotStart.getTime()) && slotStart >= now
        })

      if (firstAvailableSlot) {
        const firstAvailableDate = new Date(firstAvailableSlot.start_time)
        const dateKey = `${firstAvailableDate.getFullYear()}-${String(firstAvailableDate.getMonth() + 1).padStart(2, '0')}-${String(firstAvailableDate.getDate()).padStart(2, '0')}`
        setSelectedBookingDate(dateKey)
        setSelectedTimeSlot(firstAvailableSlot.id)
      }

      const monthSourceSlot = firstAvailableSlot || fetchedSlots[0]
      const firstSlotDate = new Date(monthSourceSlot.start_time)
      if (!Number.isNaN(firstSlotDate.getTime())) {
        setBookingCalendarMonth(new Date(firstSlotDate.getFullYear(), firstSlotDate.getMonth(), 1))
      }
    }
  }

  function closeBookingModal() {
    setShowBookingModal(false)
    setSelectedApplication(null)
    setAvailableTimeSlots([])
    setSelectedTimeSlot('')
    setSelectedBookingDate('')
    setPreferredScheduleDate('')
    setPreferredScheduleTime('')
    setPreferredScheduleEndTime('')
    setShowPreferredSchedulePicker(false)
    setBookingCalendarMonth(new Date())
    setShowSubmitScheduleWarningModal(false)
    setPendingSubmitScheduleWarning(null)
  }

  async function submitBooking(e, forceProceedWithinHour = false) {
    e?.preventDefault?.()
    if (!selectedApplication) return

    const hasCompletePreferredSchedule = Boolean(preferredScheduleDate && preferredScheduleTime && preferredScheduleEndTime)
    if (!selectedTimeSlot && !hasCompletePreferredSchedule) {
      showToast.error('Please select a viewing slot or set a complete preferred schedule.', { duration: 4000, transition: "bounceIn" })
      return
    }

    const hasAnyPreferredScheduleInput = Boolean(preferredScheduleDate || preferredScheduleTime || preferredScheduleEndTime)
    if (hasAnyPreferredScheduleInput && (!preferredScheduleDate || !preferredScheduleTime || !preferredScheduleEndTime)) {
      showToast.error('Please provide preferred schedule date, start time, and end time.', { duration: 4000, transition: 'bounceIn' })
      return
    }

    let parsedPreferredSchedule = null

    if (preferredScheduleDate && preferredScheduleTime && preferredScheduleEndTime) {
      parsedPreferredSchedule = parseTenantPreferredScheduleRange(preferredScheduleDate, preferredScheduleTime, preferredScheduleEndTime)
      if (!parsedPreferredSchedule) {
        showToast.error('Preferred schedule is invalid. End time must be later than start time.', { duration: 4000, transition: 'bounceIn' })
        return
      }

      if (parsedPreferredSchedule.startDate < new Date()) {
        showToast.error('Preferred schedule cannot be in the past.', { duration: 4000, transition: 'bounceIn' })
        return
      }
    }

    const isUsingPreferredSchedule = Boolean(parsedPreferredSchedule)

    setSubmittingBooking(true)

    // --- GLOBAL DB CHECK: Strict 1-Booking-Limit ---
    // Check if the tenant has ANY active booking for ANY property
    const { data: globalActive } = await supabase
      .from('bookings')
      .select('id')
      .eq('tenant', session.user.id)
      .in('status', ACTIVE_BOOKING_STATUSES)
      .maybeSingle()

    const { data: activeOccupancy } = await supabase
      .from('tenant_occupancies')
      .select('id')
      .eq('tenant_id', session.user.id)
      .in('status', ['active', 'pending_end'])
      .limit(1)
      .maybeSingle()

    const hasFamilyOccupancy = !activeOccupancy && await hasInheritedActiveOccupancy(session.user.id)

    // If there is ANY active booking in the system:
    if (globalActive) {
      // If we are trying to create a NEW one (even for a different property) -> BLOCK IT
      // Only allow if we are Rescheduling the EXACT SAME booking ID
      if (globalActive.id !== selectedApplication.id) {
        showToast.error("Limit reached: You can only have 1 active viewing schedule at a time.", { duration: 4000, transition: "bounceIn" })
        setSubmittingBooking(false)
        return
      }
    }

    if (activeOccupancy || hasFamilyOccupancy) {
      showToast.error('Booking limit reached: You already have an active property.', { duration: 4000, transition: "bounceIn" })
      setSubmittingBooking(false)
      return
    }

    const { data: currentProperty, error: currentPropertyError } = await supabase
      .from('properties')
      .select('status')
      .eq('id', selectedApplication.property_id)
      .maybeSingle()

    if (currentPropertyError || !currentProperty) {
      showToast.error('Cannot submit booking because property information is unavailable. Please try again.')
      setSubmittingBooking(false)
      return
    }

    const currentPropertyStatus = String(currentProperty.status || '').toLowerCase()
    if (currentPropertyStatus !== 'available') {
      showToast.error('This property is already occupied or unavailable. You cannot book viewing again.', {
        duration: 4000,
        transition: 'bounceIn'
      })
      setSubmittingBooking(false)
      closeBookingModal()
      return
    }

    const refreshAvailableSlots = async () => {
      const data = await fetchOpenSlotsForProperty(
        selectedApplication.property.landlord,
        selectedApplication.property_id,
        shouldExcludeBookingFromAvailability(selectedApplication) ? selectedApplication.id : null
      )

      setAvailableTimeSlots(data || [])
    }

    const slot = selectedTimeSlot ? availableTimeSlots.find(s => s.id === selectedTimeSlot) : null
    const bookingStartIso = isUsingPreferredSchedule ? parsedPreferredSchedule.startDate.toISOString() : slot?.start_time
    const bookingEndIso = isUsingPreferredSchedule ? parsedPreferredSchedule.endDate.toISOString() : slot?.end_time
    const bookingTimeSlotId = isUsingPreferredSchedule ? null : slot?.id

    if (!forceProceedWithinHour && isWithinOneHourBeforeSchedule(bookingStartIso)) {
      setPendingSubmitScheduleWarning({
        startIso: bookingStartIso,
        endIso: bookingEndIso,
        isPreferredSchedule: isUsingPreferredSchedule,
      })
      setShowSubmitScheduleWarningModal(true)
      setSubmittingBooking(false)
      return
    }

    if (!isUsingPreferredSchedule && !slot) {
      await refreshAvailableSlots()
      showToast.error('Selected time slot is no longer available. Please pick another schedule.', { duration: 4000, transition: "bounceIn" })
      setSubmittingBooking(false)
      return
    }

    if (!isUsingPreferredSchedule && slot.is_available === false) {
      await refreshAvailableSlots()
      setSelectedTimeSlot('')
      showToast.error('This schedule is already booked. Please choose another time slot.', { duration: 4000, transition: "bounceIn" })
      setSubmittingBooking(false)
      return
    }

    // Best-effort check before insert. Final protection is DB-level unique index.
    let slotConflictQuery = bookingTimeSlotId
      ? supabase
        .from('bookings')
        .select('id')
        .eq('time_slot_id', bookingTimeSlotId)
        .in('status', SLOT_LOCKING_BOOKING_STATUSES)
      : null

    let scheduleConflictQuery = supabase
      .from('bookings')
      .select('id')
      .eq('property_id', selectedApplication.property_id)
      .eq('booking_date', bookingStartIso)
      .in('status', SLOT_LOCKING_BOOKING_STATUSES)

    if (!selectedApplication.is_application) {
      if (slotConflictQuery) {
        slotConflictQuery = slotConflictQuery.neq('id', selectedApplication.id)
      }
      scheduleConflictQuery = scheduleConflictQuery.neq('id', selectedApplication.id)
    }

    const { data: existingSlotBooking, error: slotCheckError } = slotConflictQuery
      ? await slotConflictQuery.limit(1).maybeSingle()
      : { data: null, error: null }
    const { data: existingScheduleBooking, error: scheduleCheckError } = await scheduleConflictQuery.limit(1).maybeSingle()

    if (slotCheckError || scheduleCheckError) {
      console.error('Slot conflict check failed:', slotCheckError)
      if (scheduleCheckError) console.error('Schedule conflict check failed:', scheduleCheckError)
      showToast.error('Unable to validate the selected schedule. Please try again.', { duration: 4000, transition: "bounceIn" })
      setSubmittingBooking(false)
      return
    }

    if (existingSlotBooking || existingScheduleBooking) {
      await refreshAvailableSlots()
      if (!isUsingPreferredSchedule) {
        setSelectedTimeSlot('')
      }
      showToast.error('This schedule has just been booked by another user. Please choose a different time slot.', { duration: 4000, transition: "bounceIn" })
      setSubmittingBooking(false)
      return
    }

    // 1. Create NEW booking
    const { data: newBooking, error } = await supabase.from('bookings').insert({
      property_id: selectedApplication.property_id,
      tenant: session.user.id,
      landlord: selectedApplication.property.landlord,
      start_time: bookingStartIso,
      end_time: bookingEndIso,
      booking_date: bookingStartIso,
      time_slot_id: bookingTimeSlotId,
      status: 'pending',
      notes: buildBookingNotesWithPreferredSchedule(bookingNotes || `Booking for ${selectedApplication.property?.title}`, preferredScheduleDate, preferredScheduleTime, preferredScheduleEndTime)
    }).select().single()

    if (error) {
      console.error('Booking Error:', error)
      const slotAlreadyTaken = error.code === '23505'
        || error.message?.includes('bookings_unique_active_slot_idx')
        || error.message?.includes('bookings_unique_active_property_datetime_idx')
      if (slotAlreadyTaken) {
        await refreshAvailableSlots()
        if (!isUsingPreferredSchedule) {
          setSelectedTimeSlot('')
        }
        showToast.error('This schedule has just been booked by another user. Please choose a different time slot.', {
          duration: 4000,
          transition: "bounceIn"
        })
      } else {
        showToast.error(`Failed to book: ${error.message}`, { duration: 4000, transition: "bounceIn" })
      }
      setSubmittingBooking(false)
      return
    }

    const affectedSlotIds = bookingTimeSlotId ? [bookingTimeSlotId] : []

    // 3. Handle Status Updates
    if (!selectedApplication.is_application) {
      if (selectedApplication.status !== 'rejected' && selectedApplication.status !== 'cancelled') {
        await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', selectedApplication.id)

        if (selectedApplication.time_slot_id) {
          affectedSlotIds.push(selectedApplication.time_slot_id)
        }
      }
    }

    await syncTimeSlotBookedFlags(affectedSlotIds)

    if (newBooking) {
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
    // 4. Notify Landlord
    await createNotification({
      recipient: selectedApplication.property.landlord,
      actor: session.user.id,
      type: 'new_booking',
      message: `${profile.first_name} requested a viewing for ${selectedApplication.property?.title}.`,
      link: '/bookings'
    })

    showToast.success("Viewing scheduled successfully!", { duration: 4000, transition: "bounceIn" })
    // setSubmittingEndRequest(false)
    setSubmittingBooking(false)
    closeBookingModal()
    loadBookings()
  }

  function getStatusBadge(status, isLimitReached) {
    switch (status) {
      case 'ready_to_book':
        if (isLimitReached) {
          return <span className="px-2.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wide border border-gray-200 rounded-full">Limit Reached</span>
        }
        return <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wide border border-blue-100 rounded-full">Ready to Book</span>
      case 'pending':
      case 'pending_approval':
        return <span className="px-2.5 py-0.5 bg-yellow-50 text-yellow-700 text-[10px] font-bold uppercase tracking-wide border border-yellow-100 rounded-full">Pending</span>
      case 'approved':
      case 'accepted':
        return <span className="px-2.5 py-0.5 bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wide border border-green-100 rounded-full">Booking Approved</span>
      case 'viewing_done':
        return <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wide border border-indigo-100 rounded-full">Waiting for Assigning</span>
      case 'assigned':
        return <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide border border-emerald-100 rounded-full">Assigned</span>
      case 'rejected':
        return <span className="px-2.5 py-0.5 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wide border border-red-100 rounded-full">Rejected</span>
      case 'cancelled':
        return <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wide border border-slate-200 rounded-full">Cancelled</span>
      case 'completed':
        return <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide border border-slate-200 rounded-full">Completed</span>
      default:
        return <span className="px-2.5 py-0.5 bg-gray-50 text-gray-600 text-[10px] font-bold uppercase tracking-wide border border-gray-200 rounded-full">{status}</span>
    }
  }

  function getTimeSlotInfo(booking, preferredScheduleText = '') {
    const parsedPreferredSchedule = parsePreferredScheduleText(preferredScheduleText)

    if (parsedPreferredSchedule) {
      const preferredStartText = parsedPreferredSchedule.startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      const preferredEndText = parsedPreferredSchedule.endDate
        ? parsedPreferredSchedule.endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : ''

      return {
        emoji: '⏰',
        label: 'Tenant Preferred',
        date: parsedPreferredSchedule.startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        time: preferredEndText ? `${preferredStartText} - ${preferredEndText}` : preferredStartText,
        referenceDate: parsedPreferredSchedule.startDate
      }
    }

    if (preferredScheduleText) {
      return {
        emoji: '⏰',
        label: 'Tenant Preferred',
        date: 'Custom Schedule',
        time: preferredScheduleText,
        referenceDate: null
      }
    }

    const startValue = booking?.start_time || booking?.booking_date
    const endValue = booking?.end_time

    if (!startValue) {
      return { emoji: '📅', label: 'Not Scheduled', date: 'Not Scheduled', time: 'Select a time', referenceDate: null }
    }

    const startDate = new Date(startValue)
    if (Number.isNaN(startDate.getTime())) {
      return { emoji: '📅', label: 'Not Scheduled', date: 'Not Scheduled', time: 'Select a time', referenceDate: null }
    }

    const startText = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const endDate = endValue ? new Date(endValue) : null
    const dateText = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

    if (endDate && !Number.isNaN(endDate.getTime())) {
      const endText = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      return { emoji: '⏰', label: 'Scheduled', date: dateText, time: `${startText} - ${endText}`, referenceDate: startDate }
    }

    return { emoji: '⏰', label: 'Scheduled', date: dateText, time: startText, referenceDate: startDate }
  }

  function getProfileDisplayName(profileData, fallback = 'Unknown User') {
    if (!profileData) return fallback

    const name = [profileData.first_name, profileData.middle_name, profileData.last_name]
      .filter(Boolean)
      .join(' ')
      .trim()

    if (name) return name
    if (profileData.email) return profileData.email
    if (profileData.phone) return profileData.phone

    return fallback
  }

  function getProfileInitials(profileData) {
    const first = profileData?.first_name?.[0] || ''
    const last = profileData?.last_name?.[0] || ''
    const initials = `${first}${last}`.trim()
    if (initials) return initials.toUpperCase()
    return 'U'
  }

  const renderBookingSkeletonList = () => (
    <div className="space-y-4">
      {skeletonBookingIndices.map((item) => (
        <div key={item} className="bg-white border border-gray-100 p-5 md:p-6 rounded-2xl shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="h-6 w-56 bg-gray-200 rounded skeleton-shimmer"></div>
              <div className="h-4 w-72 bg-gray-200 rounded skeleton-shimmer"></div>
              <div className="h-4 w-48 bg-gray-200 rounded skeleton-shimmer"></div>
              <div className="h-12 w-full bg-gray-200 rounded-xl skeleton-shimmer"></div>
            </div>
            <div className="min-w-[200px] space-y-3">
              <div className="h-16 w-full bg-gray-200 rounded-xl skeleton-shimmer"></div>
              <div className="h-10 w-full bg-gray-200 rounded-xl skeleton-shimmer"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  const renderLandlordBookingSkeletonList = () => (
    <div className="space-y-4">
      {skeletonBookingIndices.map((item) => (
        <div key={`landlord-booking-skeleton-${item}`} className="bg-white border border-gray-100 p-5 md:p-6 rounded-2xl shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="h-6 w-52 bg-gray-200 rounded skeleton-shimmer"></div>
              <div className="h-4 w-72 bg-gray-200 rounded skeleton-shimmer"></div>
              <div className="h-4 w-64 bg-gray-200 rounded skeleton-shimmer"></div>
              <div className="h-12 w-full bg-gray-200 rounded-xl skeleton-shimmer"></div>
            </div>
            <div className="min-w-[220px] space-y-3">
              <div className="h-16 w-full bg-gray-200 rounded-xl skeleton-shimmer"></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-10 w-full bg-gray-200 rounded-lg skeleton-shimmer"></div>
                <div className="h-10 w-full bg-gray-200 rounded-lg skeleton-shimmer"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  const pendingCount = statusSummary.pending
  const approvedCount = statusSummary.approved
  const rejectedCount = statusSummary.rejected
  const completedCount = statusSummary.completed
  const userRoleLower = (profile?.role || '').toLowerCase();

  const filteredBookings = bookings
  const isProfileLoading = loading && !profile
  const isListLoading = isProfileLoading || (loading && filteredBookings.length === 0)

  if (!profile && !loading) return null
  const totalPages = Math.max(1, Math.ceil(totalBookingCount / BOOKINGS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedBookings = filteredBookings
  const pageStart = totalBookingCount === 0 ? 0 : (safeCurrentPage - 1) * BOOKINGS_PER_PAGE + 1
  const pageEnd = Math.min((safeCurrentPage - 1) * BOOKINGS_PER_PAGE + paginatedBookings.length, totalBookingCount)

  function handlePageChange(nextPage) {
    if (loading || nextPage < 1 || nextPage > totalPages || nextPage === safeCurrentPage) return

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    setLoading(true)
    setBookings([])
    setCurrentPage(nextPage)
  }

  // --- GLOBAL BUTTON STATE ---
  // Check if user has ANY active booking currently displayed
  const hasGlobalActive = bookings.some(b =>
    ACTIVE_BOOKING_STATUSES.includes(b.status)
  )
  const hasBookingBlocked = hasGlobalActive || hasActiveOccupancy
  const minPreferredScheduleDate = getTodayDateInputValue()
  const isPreferredScheduleToday = preferredScheduleDate === minPreferredScheduleDate
  const minPreferredScheduleTime = isPreferredScheduleToday ? new Date().toTimeString().slice(0, 5) : undefined
  const minPreferredScheduleEndTime = preferredScheduleTime || minPreferredScheduleTime

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F3F4F5] p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Viewing Bookings</h1>
              <p className="text-gray-500 text-sm mt-1">
                {userRoleLower === 'landlord' ? 'Manage viewing requests from prospective tenants.' : 'Manage your viewing appointments.'}
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Pending</span>
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">{pendingCount}</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Approved / Completed</span>
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">{approvedCount + completedCount}</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Rejected/Cancelled</span>
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">{rejectedCount}</p>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="bg-white border-2 border-black mb-8 p-1.5 rounded-xl inline-flex flex-wrap gap-2 w-full md:w-auto relative">
            {['all', 'approved', 'pending_approval', 'rejected', 'completed'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`relative flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg cursor-pointer transition-all duration-300 ease-in-out uppercase tracking-wide ${filter === f
                  ? 'bg-black text-white shadow-lg transform scale-[1.03]'
                  : 'bg-transparent text-gray-500 hover:bg-gray-100'
                  }`}
              >
                {f === 'pending_approval' ? 'Pending' : f === 'rejected' ? 'Rejected/Cancelled' : f.charAt(0).toUpperCase() + f.slice(1)} ({
                  f === 'all' ? statusSummary.total :
                    f === 'approved' ? approvedCount :
                      f === 'pending_approval' ? pendingCount :
                        f === 'completed' ? completedCount :
                          rejectedCount
                })
              </button>
            ))}
          </div>
        </>

        {/* Bookings List */}
        {isListLoading ? (
          userRoleLower === 'landlord' ? renderLandlordBookingSkeletonList() : renderBookingSkeletonList()
        ) : filteredBookings.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <h3 className="text-gray-900 font-bold mb-1">No bookings found</h3>
            <p className="text-gray-500 text-sm">No bookings in this category.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedBookings.map((booking) => {
              const statusLower = (booking.status || '').toLowerCase()
              const propertyStatusLower = String(booking.property?.status || '').toLowerCase()
              const isPropertyUnavailable = Boolean(propertyStatusLower) && propertyStatusLower !== 'available'
              const roleLower = (profile.role || '').toLowerCase()
              const preferredScheduleInfo = extractTenantPreferredSchedule(booking.notes)
              const hasPreferredSchedule = Boolean(preferredScheduleInfo.preferredScheduleText)
              const displayNotes = preferredScheduleInfo.cleanNotes
              const timeInfo = getTimeSlotInfo(booking, preferredScheduleInfo.preferredScheduleText)
              const bookingDate = new Date(booking.booking_date)
              const scheduleReferenceDate = timeInfo.referenceDate || (Number.isNaN(bookingDate.getTime()) ? null : bookingDate)
              const isPast = Boolean(scheduleReferenceDate) && scheduleReferenceDate < new Date()

              return (
                <div key={booking.id} className="bg-white border border-gray-100 p-5 md:p-6 rounded-2xl shadow-sm transition-all">
                  <div className="flex flex-col md:flex-row md:items-start gap-6">

                    {/* Main Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{booking.property?.title}</h3>
                        {getStatusBadge(booking.status, hasBookingBlocked)}
                        {roleLower === 'landlord' && hasPreferredSchedule && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                            TENANTS PREFERRED SCHEDULE
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 text-sm text-gray-500 mb-4">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          <span>{booking.property?.address}, {booking.property?.city}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          <span className="font-medium text-gray-900">{getProfileDisplayName(booking.tenant_profile, 'Unknown Tenant')}</span>
                          {booking.tenant_profile?.phone && <span className="text-gray-400">• {booking.tenant_profile.phone}</span>}
                        </div>
                      </div>

                      {displayNotes && (
                        <div className="bg-gray-50 p-3 rounded-xl text-sm text-gray-600 border border-gray-100 italic">
                          "{displayNotes}"
                        </div>
                      )}
                    </div>

                    {/* Time & Actions */}
                    <div className="flex flex-col md:items-end gap-4 min-w-[200px]">
                      {booking.status === 'ready_to_book' ? (
                        !hasBookingBlocked && (
                          <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-right w-full md:w-auto">
                            <p className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-1">Action Required</p>
                            <p className="font-bold text-blue-900 text-sm">Please schedule a viewing time.</p>
                          </div>
                        )
                      ) : (
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-right w-full md:w-auto">
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">{hasPreferredSchedule ? 'Preferred Time' : 'Requested Time'}</p>
                          <p className="font-bold text-gray-900 text-lg">
                            {timeInfo.date}
                          </p>
                          <div className="flex items-center justify-end gap-2 text-sm text-gray-600">
                            <span>{timeInfo.time}</span>
                            {isPast && !['assigned', 'completed', 'cancelled', 'rejected'].includes(statusLower) && <span className="text-red-500 font-bold text-xs bg-red-50 px-1.5 py-0.5 rounded">PAST</span>}
                          </div>
                        </div>
                      )}

                      {/* Landlord Actions */}
                      {roleLower === 'landlord' &&
                        (statusLower === 'pending' || statusLower === 'pending_approval') && (
                          <div className="flex gap-2 w-full md:w-auto">
                            <button
                              onClick={() => approveBooking(booking)}
                              disabled={processingAction === `approve-${booking.id}`}
                              className={`flex-1 md:flex-none px-4 py-2.5 text-white text-xs font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${processingAction === `approve-${booking.id}` ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 cursor-pointer hover:bg-green-700'}`}
                            >
                              {processingAction === `approve-${booking.id}` ? (<><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Processing...</>) : 'Accept'}
                            </button>
                            <button
                              onClick={() => promptRejectBooking(booking)}
                              disabled={processingAction === `reject-${booking.id}`}
                              className={`flex-1 md:flex-none px-4 py-2.5 border text-xs font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${processingAction === `reject-${booking.id}` ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white border-gray-200 text-gray-700 cursor-pointer hover:bg-gray-50'}`}
                            >
                              {processingAction === `reject-${booking.id}` ? (<><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Processing...</>) : 'Reject'}
                            </button>
                          </div>
                        )}

                      {/* Landlord: After approval - Viewing Success / Cancel */}
                      {roleLower === 'landlord' &&
                        (statusLower === 'approved' || statusLower === 'accepted') && (
                          <div className="flex gap-2 w-full md:w-auto">
                            <button
                              onClick={() => handleViewingSuccessRequest(booking)}
                              disabled={processingAction === `viewing-${booking.id}`}
                              className={`flex-1 md:flex-none px-4 py-2.5 text-white text-xs font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${processingAction === `viewing-${booking.id}` ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 cursor-pointer hover:bg-green-700'}`}
                            >
                              {processingAction === `viewing-${booking.id}` ? (<><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Processing...</>) : 'Viewing Success'}
                            </button>
                            <button
                              onClick={() => promptLandlordCancelViewing(booking)}
                              disabled={processingAction === `cancel-viewing-${booking.id}`}
                              className={`flex-1 md:flex-none px-4 py-2.5 border text-xs font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${processingAction === `cancel-viewing-${booking.id}` ? 'bg-red-50 text-red-300 border-red-100 cursor-not-allowed' : 'bg-white border-red-200 text-red-600 cursor-pointer hover:bg-red-50'}`}
                            >
                              {processingAction === `cancel-viewing-${booking.id}` ? (<><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Cancelling...</>) : 'Cancel Viewing'}
                            </button>
                          </div>
                        )}

                      {/* Landlord: After viewing success - Assign Tenant */}
                      {roleLower === 'landlord' && statusLower === 'viewing_done' && (
                        <div className="flex gap-2 w-full md:w-auto">
                          <button
                            onClick={() => router.push(`/assign-tenant?bookingId=${booking.id}`)}
                            className="flex-1 md:flex-none px-4 py-2.5 bg-black text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-gray-800 transition-colors shadow-sm flex items-center gap-2 justify-center"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                            Assign Tenant
                          </button>
                        </div>
                      )}

                      {/* TENANT ACTIONS - Hide all buttons for assigned/completed status */}
                      {roleLower !== 'landlord' && !['assigned', 'completed'].includes(statusLower) && (!isPast || ['rejected', 'cancelled'].includes(statusLower)) && (
                        <div className="flex gap-2 w-full md:w-auto">

                          {/* Case 1: Ready to Book (Accepted Application) */}
                          {booking.status === 'ready_to_book' && (
                            <button
                              onClick={() => !hasBookingBlocked && openBookingModal(booking)}
                              disabled={hasBookingBlocked}
                              className={`flex-1 md:flex-none px-4 py-2.5 text-xs font-bold rounded-lg transition-colors shadow-sm ${hasBookingBlocked
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                : 'bg-black text-white cursor-pointer hover:bg-gray-800'
                                }`}
                            >
                              {hasBookingBlocked ? 'Booking Limit Reached' : 'Schedule Viewing'}
                            </button>
                          )}

                          {/* Case 2: Rejected - "Book Again" */}
                          {statusLower === 'rejected' && (
                            (() => {
                              const isBookAgainBlocked = hasBookingBlocked || isPropertyUnavailable
                              return (
                            <button
                              onClick={() => !isBookAgainBlocked && openBookingModal(booking)}
                              disabled={isBookAgainBlocked}
                              className={`flex-1 md:flex-none px-4 py-2.5 text-xs font-bold rounded-lg transition-colors shadow-sm ${isBookAgainBlocked
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                : 'bg-black text-white cursor-pointer hover:bg-gray-800'
                                }`}
                            >
                              {isPropertyUnavailable ? 'Property Unavailable' : hasBookingBlocked ? 'Booking Limit Reached' : 'Book Again'}
                            </button>
                              )
                            })()
                          )}

                          {/* Case 3: Pending/Approved - "Reschedule" */}
                          {['pending', 'pending_approval', 'approved', 'accepted', ''].includes(statusLower) && (
                            <>
                              {['pending', 'pending_approval'].includes(statusLower) && (
                                <button
                                  onClick={() => requestTenantModifyAction(booking, 'reschedule', scheduleReferenceDate || bookingDate)}
                                  className="flex-1 md:flex-none px-4 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-blue-700 transition-colors shadow-sm"
                                >
                                  Reschedule
                                </button>
                              )}
                              {['pending', 'pending_approval'].includes(statusLower) && (
                                <button
                                  onClick={() => requestTenantModifyAction(booking, 'cancel', scheduleReferenceDate || bookingDate)}
                                  className="flex-1 md:flex-none px-4 py-2.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg cursor-pointer hover:bg-red-50 transition-colors shadow-sm"
                                >
                                  Cancel
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {totalPages > 1 && (
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-xs font-medium text-gray-500">
                  Showing {pageStart}-{pageEnd} of {totalBookingCount}
                </p>
                  <div className="flex items-center gap-2">
                  <button
                      onClick={() => handlePageChange(safeCurrentPage - 1)}
                    disabled={loading || safeCurrentPage === 1}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="text-xs font-bold text-gray-600 px-2">
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(safeCurrentPage + 1)}
                    disabled={loading || safeCurrentPage === totalPages}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- VIEWING SUCCESS WARNING MODAL --- */}
      {showViewingSuccessWarningModal && bookingToMarkSuccess && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white shadow-2xl rounded-2xl max-w-md w-full p-6">
            <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Confirm Viewing Success</h3>
            {sameDateConflictBookings.length > 0 ? (
              <p className="text-gray-600 text-sm text-center mb-5">
                This property has <span className="font-bold text-gray-900">{sameDateConflictBookings.length + 1}</span> active booking request(s).
                If you mark this request as viewing success, the other <span className="font-bold text-gray-900">{sameDateConflictBookings.length}</span> request(s)
                will be automatically rejected.
              </p>
            ) : (
              <p className="text-gray-600 text-sm text-center mb-5">
                You are about to mark this viewing request as successful and proceed to tenant assignment.
              </p>
            )}

            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-5">
              <p className="text-xs uppercase tracking-wider font-bold text-red-600 mb-1">Warning</p>
              <p className="text-sm text-red-700">This action cannot be undone.</p>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-5">
              <p className="text-xs uppercase tracking-wider font-bold text-amber-700 mb-1">Selected Request</p>
              <p className="text-sm font-bold text-gray-900 truncate">{bookingToMarkSuccess.property?.title || 'Property'}</p>
              {bookingToMarkSuccess.booking_date && (
                <p className="text-xs text-gray-600 mt-0.5">
                  {new Date(bookingToMarkSuccess.booking_date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeViewingSuccessWarningModal}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmViewingSuccessWithWarning}
                className="flex-1 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors shadow-sm cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TENANT MODIFY WARNING MODAL (WITHIN 1 HOUR) --- */}
      {showTenantModifyWarningModal && pendingTenantModifyAction?.booking && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6 text-center">
            <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">Schedule Is Within 1 Hour</h3>
            <p className="text-gray-500 text-sm mb-3">
              This viewing schedule is less than 1 hour away.
            </p>
            <p className="text-gray-600 text-sm mb-2">
              Do you still want to {pendingTenantModifyAction.actionType === 'cancel' ? 'cancel' : 'reschedule'} this booking?
            </p>

            {pendingTenantModifyAction.scheduleDateValue && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-5 text-left">
                <p className="text-xs uppercase tracking-wider font-bold text-amber-700 mb-1">Current Schedule</p>
                <p className="text-sm font-semibold text-gray-900">
                  {new Date(pendingTenantModifyAction.scheduleDateValue).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {new Date(pendingTenantModifyAction.scheduleDateValue).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  {pendingTenantModifyAction.booking?.end_time ? ` - ${new Date(pendingTenantModifyAction.booking.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeTenantModifyWarningModal}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Go Back
              </button>
              <button
                onClick={confirmTenantModifyWarning}
                className="flex-1 py-2.5 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-colors shadow-sm cursor-pointer"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SUBMIT SCHEDULE WARNING MODAL (WITHIN 1 HOUR) --- */}
      {showSubmitScheduleWarningModal && pendingSubmitScheduleWarning && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6 text-center">
            <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">Schedule Is Within 1 Hour</h3>
            <p className="text-gray-500 text-sm mb-3">
              The schedule you selected is less than 1 hour from now.
            </p>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-5 text-left">
              <p className="text-xs uppercase tracking-wider font-bold text-amber-700 mb-1">Selected Schedule</p>
              <p className="text-sm font-semibold text-gray-900">
                {new Date(pendingSubmitScheduleWarning.startIso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {new Date(pendingSubmitScheduleWarning.startIso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {pendingSubmitScheduleWarning.endIso ? ` - ${new Date(pendingSubmitScheduleWarning.endIso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
              </p>
              <p className="text-[10px] text-amber-700 mt-2 font-semibold">
                {pendingSubmitScheduleWarning.isPreferredSchedule ? 'Preferred schedule will be used for this request.' : 'Selected slot schedule will be used for this request.'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeSubmitScheduleWarningModal}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Go Back
              </button>
              <button
                onClick={confirmSubmitScheduleWarningModal}
                className="flex-1 py-2.5 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-colors shadow-sm cursor-pointer"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- REJECT REASON MODAL --- */}
      {showRejectModal && bookingToReject && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-md w-full p-6">
            <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Reject Viewing Request</h3>
            <p className="text-gray-500 text-sm mb-4 text-center">
              Please provide a reason for rejecting <span className="font-semibold text-gray-900">{bookingToReject.property?.title}</span>.
            </p>

            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Rejection Reason
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
              placeholder="Type the reason here..."
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-black outline-none transition-colors resize-none"
            />

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setBookingToReject(null)
                  setRejectionReason('')
                }}
                disabled={processingAction === `reject-${bookingToReject.id}`}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmRejectBooking}
                disabled={processingAction === `reject-${bookingToReject.id}` || !rejectionReason.trim()}
                className={`flex-1 py-2.5 text-white font-bold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 ${(processingAction === `reject-${bookingToReject.id}` || !rejectionReason.trim()) ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 cursor-pointer hover:bg-red-700'}`}
              >
                {processingAction === `reject-${bookingToReject.id}` ? (<><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Processing...</>) : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CANCEL CONFIRMATION MODAL --- */}
      {showCancelModal && bookingToCancel && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6 text-center">

            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Viewing?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Are you sure you want to cancel your viewing for <span className="font-semibold text-gray-900">{bookingToCancel.property?.title}</span>? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Keep it
              </button>
              <button
                onClick={confirmCancelBooking}
                disabled={!!processingAction}
                className={`flex-1 py-2.5 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-100 flex items-center justify-center gap-2 ${processingAction ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 cursor-pointer hover:bg-red-700'}`}
              >
                {processingAction ? (<><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Cancelling...</>) : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- LANDLORD CANCEL VIEWING WARNING MODAL --- */}
      {showLandlordCancelWarningModal && bookingToCancelByLandlord && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6 text-center">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Viewing Request?</h3>
            <p className="text-gray-500 text-sm mb-3">
              You are about to cancel the viewing for <span className="font-semibold text-gray-900">{bookingToCancelByLandlord.property?.title}</span>.
            </p>

            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-6 text-left">
              <p className="text-xs uppercase tracking-wider font-bold text-red-600 mb-1">Warning</p>
              <p className="text-sm text-red-700">This action cannot be undone. The tenant will be notified that the viewing was cancelled.</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeLandlordCancelWarningModal}
                disabled={processingAction === `cancel-viewing-${bookingToCancelByLandlord.id}`}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Keep Viewing
              </button>
              <button
                onClick={confirmLandlordCancelViewing}
                disabled={processingAction === `cancel-viewing-${bookingToCancelByLandlord.id}`}
                className={`flex-1 py-2.5 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-100 flex items-center justify-center gap-2 ${processingAction === `cancel-viewing-${bookingToCancelByLandlord.id}` ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 cursor-pointer hover:bg-red-700'}`}
              >
                {processingAction === `cancel-viewing-${bookingToCancelByLandlord.id}` ? (<><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Cancelling...</>) : 'Yes, Cancel Viewing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- BOOKING MODAL --- */}
      {showBookingModal && selectedApplication && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Reschedule Viewing</h3>
              <button
                onClick={closeBookingModal}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 text-gray-500 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <p className="font-bold text-gray-900 text-sm">{selectedApplication.property?.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{selectedApplication.property?.address}</p>
            </div>

            <form onSubmit={submitBooking} className="space-y-5">
              {!showPreferredSchedulePicker && (availableTimeSlots.length > 0 ? (
                (() => {
                  const slotsByDate = {}
                  const now = new Date()

                  availableTimeSlots.forEach(slot => {
                    const slotStart = new Date(slot.start_time)
                    if (Number.isNaN(slotStart.getTime()) || slotStart < now) return

                    const dateKey = `${slotStart.getFullYear()}-${String(slotStart.getMonth() + 1).padStart(2, '0')}-${String(slotStart.getDate()).padStart(2, '0')}`
                    if (!slotsByDate[dateKey]) slotsByDate[dateKey] = []
                    slotsByDate[dateKey].push(slot)
                  })

                  const monthStart = new Date(bookingCalendarMonth.getFullYear(), bookingCalendarMonth.getMonth(), 1)
                  const monthEnd = new Date(bookingCalendarMonth.getFullYear(), bookingCalendarMonth.getMonth() + 1, 0)
                  const daysInMonth = monthEnd.getDate()
                  const firstDayIndex = monthStart.getDay()

                  const today = new Date()
                  today.setHours(0, 0, 0, 0)

                  const monthKey = `${bookingCalendarMonth.getFullYear()}-${String(bookingCalendarMonth.getMonth() + 1).padStart(2, '0')}`
                  const hasAvailableSlotsInMonth = Object.keys(slotsByDate).some((key) => {
                    if (!key.startsWith(monthKey)) return false
                    return (slotsByDate[key] || []).some((slot) => slot.is_available !== false)
                  })

                  const selectedDateSlots = selectedBookingDate
                    ? (slotsByDate[selectedBookingDate] || []).slice().sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
                    : []

                  const calendarCells = []
                  for (let i = 0; i < firstDayIndex; i++) calendarCells.push(null)
                  for (let day = 1; day <= daysInMonth; day++) calendarCells.push(day)

                  const minMonth = new Date()
                  minMonth.setDate(1)
                  minMonth.setHours(0, 0, 0, 0)
                  const currentMonthStart = new Date(bookingCalendarMonth.getFullYear(), bookingCalendarMonth.getMonth(), 1)
                  const canGoPrevMonth = currentMonthStart > minMonth

                  return (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                          Select Date
                        </label>
                        <div className="border border-gray-200 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-3">
                            <button
                              type="button"
                              onClick={() => canGoPrevMonth && setBookingCalendarMonth(new Date(bookingCalendarMonth.getFullYear(), bookingCalendarMonth.getMonth() - 1, 1))}
                              disabled={!canGoPrevMonth}
                              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${canGoPrevMonth ? 'hover:bg-gray-100 text-gray-700 cursor-pointer' : 'text-gray-300 cursor-not-allowed'}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <p className="text-sm font-bold text-gray-900">
                              {bookingCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </p>
                            <button
                              type="button"
                              onClick={() => setBookingCalendarMonth(new Date(bookingCalendarMonth.getFullYear(), bookingCalendarMonth.getMonth() + 1, 1))}
                              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-700 transition-colors cursor-pointer"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                          </div>

                          <div className="grid grid-cols-7 gap-1 mb-1">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                              <div key={day} className="text-center text-[10px] font-bold text-gray-400 uppercase py-1">{day}</div>
                            ))}
                          </div>

                          <div className="grid grid-cols-7 gap-1">
                            {calendarCells.map((day, index) => {
                              if (!day) return <div key={`blank-${index}`} className="h-9" />

                              const dateKey = `${bookingCalendarMonth.getFullYear()}-${String(bookingCalendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                              const dateObj = new Date(bookingCalendarMonth.getFullYear(), bookingCalendarMonth.getMonth(), day)
                              const isPastDate = dateObj < today
                              const dateSlots = slotsByDate[dateKey] || []
                              const availableDateSlots = dateSlots.filter((slot) => slot.is_available !== false)
                              const hasSlots = dateSlots.length > 0
                              const hasAvailableSlots = availableDateSlots.length > 0
                              const hasUnavailableOnly = hasSlots && !hasAvailableSlots
                              const isDisabled = !hasAvailableSlots || isPastDate
                              const isSelected = selectedBookingDate === dateKey
                              const isToday = dateObj.getTime() === today.getTime()

                              return (
                                <button
                                  key={dateKey}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() => {
                                    setSelectedBookingDate(dateKey)
                                    setSelectedTimeSlot(availableDateSlots[0]?.id || '')
                                  }}
                                  className={`h-9 rounded-lg text-xs font-bold transition-all relative ${isSelected
                                    ? 'bg-black text-white'
                                    : hasUnavailableOnly && !isPastDate
                                      ? 'text-red-600 cursor-not-allowed'
                                    : isDisabled
                                      ? 'text-gray-300 cursor-not-allowed'
                                      : 'text-gray-800 hover:bg-green-50 cursor-pointer'
                                    } ${isToday && !isSelected ? 'ring-1 ring-black ring-offset-1' : ''}`}
                                >
                                  {day}
                                  {hasAvailableSlots && !isPastDate && !isSelected && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-green-600 rounded-full"></span>}
                                  {hasUnavailableOnly && !isPastDate && !isSelected && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-red-600 rounded-full"></span>}
                                </button>
                              )
                            })}
                          </div>

                          {!hasAvailableSlotsInMonth && (
                            <p className="text-[11px] text-gray-500 text-center mt-3">No available dates in this month.</p>
                          )}

                          <div className="mt-3 flex items-center gap-4 text-[10px] font-semibold text-gray-600">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-green-600"></span>
                              Available
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-red-600"></span>
                              Fully Booked
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                          Available Time Slots
                        </label>

                        {!selectedBookingDate ? (
                          <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-center">
                            <p className="text-xs text-gray-500">Select a date to view available times.</p>
                          </div>
                        ) : selectedDateSlots.length === 0 ? (
                          <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-center">
                            <p className="text-xs text-gray-500">No available time slots for the selected date.</p>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                            {selectedDateSlots.map((slot) => {
                              const slotStart = new Date(slot.start_time)
                              const slotEnd = new Date(slot.end_time)
                              const isAvailable = slot.is_available !== false

                              return (
                                <label
                                  key={slot.id}
                                  className={`block p-3 border rounded-xl transition-all ${selectedTimeSlot === slot.id
                                    ? 'border-black bg-black text-white shadow-md'
                                    : !isAvailable
                                      ? 'border-red-200 bg-red-50 text-red-600 cursor-not-allowed'
                                      : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                                    }`}
                                >
                                  <input
                                    type="radio"
                                    name="timeSlot"
                                    value={slot.id}
                                    checked={selectedTimeSlot === slot.id}
                                    disabled={!isAvailable}
                                    onChange={(e) => setSelectedTimeSlot(e.target.value)}
                                    className="hidden"
                                  />
                                  <div className="flex items-center gap-3">
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${selectedTimeSlot === slot.id ? 'border-white bg-white' : 'border-gray-300'
                                      }`}>
                                      {selectedTimeSlot === slot.id && <div className="w-2 h-2 rounded-full bg-black"></div>}
                                    </div>
                                    <div className="flex-1">
                                      <div className="text-sm font-bold">
                                        {slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - {slotEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                      </div>
                                      <div className={`text-xs ${selectedTimeSlot === slot.id ? 'text-gray-300' : !isAvailable ? 'text-red-500' : 'text-gray-500'}`}>
                                        {slotStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                      </div>
                                    </div>
                                    {!isAvailable && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide text-red-600">Booked</span>
                                    )}
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()
              ) : (
                <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl text-center">
                  <p className="text-sm text-gray-500">
                    No time slots available. Please contact the landlord directly.
                  </p>
                </div>
              ))}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                    Preferred Schedule
                  </label>
                  {showPreferredSchedulePicker && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowPreferredSchedulePicker(false)
                        setPreferredScheduleDate('')
                        setPreferredScheduleTime('')
                        setPreferredScheduleEndTime('')
                      }}
                      className="text-[11px] font-semibold text-gray-500 hover:text-black cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {!showPreferredSchedulePicker ? (
                  <button
                    type="button"
                    onClick={() => setShowPreferredSchedulePicker(true)}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-left text-gray-700 hover:border-black transition-colors cursor-pointer"
                  >
                    Click to set preferred schedule
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={preferredScheduleDate}
                      min={minPreferredScheduleDate}
                      onChange={(e) => {
                        const nextPreferredDate = e.target.value
                        if (nextPreferredDate && nextPreferredDate < minPreferredScheduleDate) {
                          showToast.error('Past dates are not allowed for preferred schedule.', { duration: 3000, transition: 'bounceIn' })
                          setPreferredScheduleDate('')
                          setPreferredScheduleTime('')
                          setPreferredScheduleEndTime('')
                          return
                        }

                        setPreferredScheduleDate(nextPreferredDate)
                        setPreferredScheduleTime('')
                        setPreferredScheduleEndTime('')
                      }}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-black outline-none transition-colors"
                    />

                    {preferredScheduleDate ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="time"
                          value={preferredScheduleTime}
                          min={isPreferredScheduleToday ? minPreferredScheduleTime : undefined}
                          onChange={(e) => {
                            const nextStartTime = e.target.value

                            if (isPreferredScheduleToday && minPreferredScheduleTime && nextStartTime && nextStartTime < minPreferredScheduleTime) {
                              showToast.error('Past time is not allowed for preferred schedule.', { duration: 3000, transition: 'bounceIn' })
                              setPreferredScheduleTime('')
                              setPreferredScheduleEndTime('')
                              return
                            }

                            setPreferredScheduleTime(nextStartTime)
                            if (preferredScheduleEndTime && nextStartTime && preferredScheduleEndTime <= nextStartTime) {
                              setPreferredScheduleEndTime('')
                            }
                          }}
                          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-black outline-none transition-colors"
                          title="Preferred Start Time"
                        />
                        <input
                          type="time"
                          value={preferredScheduleEndTime}
                          min={isPreferredScheduleToday ? minPreferredScheduleEndTime : preferredScheduleTime || undefined}
                          onChange={(e) => {
                            const nextEndTime = e.target.value

                            if (isPreferredScheduleToday && minPreferredScheduleEndTime && nextEndTime && nextEndTime < minPreferredScheduleEndTime) {
                              showToast.error('Past time is not allowed for preferred schedule.', { duration: 3000, transition: 'bounceIn' })
                              setPreferredScheduleEndTime('')
                              return
                            }

                            if (preferredScheduleTime && nextEndTime && nextEndTime <= preferredScheduleTime) {
                              showToast.error('Preferred end time must be later than start time.', { duration: 3000, transition: 'bounceIn' })
                              setPreferredScheduleEndTime('')
                              return
                            }

                            setPreferredScheduleEndTime(nextEndTime)
                          }}
                          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-black outline-none transition-colors"
                          title="Preferred End Time"
                        />
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-500">Choose a date first, then enter start and end time.</p>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-gray-500 mt-1">Past schedules are not allowed.</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Notes
                </label>
                <textarea
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  rows={3}
                  placeholder="Any questions or specific requests?"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-black outline-none transition-colors resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submittingBooking || (!selectedTimeSlot && !(preferredScheduleDate && preferredScheduleTime && preferredScheduleEndTime))}
                  className="w-full py-3.5 bg-black text-white font-bold rounded-xl cursor-pointer hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-gray-200"
                >
                  {submittingBooking ? 'Sending Request...' : 'Request Viewing'}
                </button>
                <span className="ml-2 inline-block text-sm">Note: You can't cancel the booking once approved.</span>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ASSIGN TENANT MODAL --- */}
      {showAssignModal && assignBooking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => { setShowAssignModal(false); setShowAssignWarning(false) }}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            {!showAssignWarning ? (
              <>
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-lg font-bold text-gray-900">Assign Tenant</h3>
                  <button onClick={() => setShowAssignModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 text-gray-500 cursor-pointer">✕</button>
                </div>

                <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-200 overflow-hidden flex-shrink-0 border-2 border-white shadow-sm">
                    {assignBooking.tenant_profile?.avatar_url ? (
                      <img src={assignBooking.tenant_profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-blue-700 font-bold text-sm bg-blue-100">
                        {getProfileInitials(assignBooking.tenant_profile)}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-blue-800 font-bold uppercase tracking-wider mb-0.5">Assigning Tenant</p>
                    <p className="font-bold text-gray-900 text-sm leading-none">{getProfileDisplayName(assignBooking.tenant_profile, 'Unknown Tenant')}</p>
                  </div>
                </div>

                {/* Select Property */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Select Property *</label>
                  {availableProperties.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {availableProperties.map(prop => {
                        const isBookedProperty = prop.id === assignBooking.property_id
                        const isSelected = selectedPropertyId === prop.id

                        return (
                          <label
                            key={prop.id}
                            className={`block p-3 border rounded-xl cursor-pointer transition-all ${isSelected
                              ? 'border-black bg-black text-white'
                              : isBookedProperty
                                ? 'border-green-500 bg-green-50/50 hover:bg-green-50'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                          >
                            <input type="radio" name="propSelect" value={prop.id} checked={isSelected} onChange={() => setSelectedPropertyId(prop.id)} className="hidden" />
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">{prop.title}</span>
                                {isBookedProperty && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isSelected ? 'bg-white text-green-700' : 'bg-green-100 text-green-700'}`}>Requested</span>}
                              </div>
                              <span className="text-xs font-medium">₱{Number(prop.price).toLocaleString()}/mo</span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg border border-red-100">No available properties found.</p>
                  )}
                </div>

                {/* Start Date */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Start Date <span className="text-red-500">*</span></label>
                  <input type="date" value={startDate} min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]} onChange={e => setStartDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-black outline-none" />
                </div>

                {/* Move-in Payment Summary */}
                {selectedPropertyId && (() => {
                  const sp = availableProperties.find(p => p.id === selectedPropertyId)
                  if (!sp) return null
                  const rent = sp.price || 0
                  return (
                    <div className="mb-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Move-in Payment Summary</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-emerald-700">Rent (1 Month):</span><span className="font-bold text-emerald-900">₱{Number(rent).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-emerald-700">Advance (1 Month):</span><span className="font-bold text-emerald-900">₱{Number(rent).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-emerald-700">Security Deposit:</span><span className="font-bold text-emerald-900">₱{Number(rent).toLocaleString()}</span></div>
                        <div className="flex justify-between pt-2 border-t border-emerald-200 mt-1"><span className="text-emerald-800 font-bold">Total Move-in:</span><span className="font-black text-emerald-900 text-base">₱{Number(rent * 3).toLocaleString()}</span></div>
                      </div>
                    </div>
                  )
                })()}

                {/* Late Payment Fee */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Late Payment Fee (₱) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="any" value={penaltyDetails} onChange={e => setPenaltyDetails(e.target.value)} placeholder="e.g. 500" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-black outline-none" />
                </div>

                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Contract PDF (Optional)</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={e => setContractPdf(e.target.files?.[0] || null)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-black outline-none file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-gray-100 file:text-gray-700 file:font-semibold"
                  />
                </div>

                {/* Utility Reminders */}
                {selectedPropertyId && (
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 mb-4">
                    <p className="text-xs text-gray-600 font-medium mb-3">
                      <span className="font-bold">Utility Details:</span> Configure utility dues and payments for this tenant.
                      <small className="block text-gray-400 mt-1">* Note: To save water, electricity and wifi payments to the database, ensure their columns are added in Supabase first.</small>
                    </p>
                    {(() => {
                      const sp = availableProperties.find(p => p.id === selectedPropertyId);
                      if (!sp) return null;
                      const amenities = sp.amenities || [];
                      const isWaterFree = amenities.includes('Free Water');
                      const isElecFree = amenities.includes('Free Electricity');
                      const isWifiAvailable = amenities.includes('Wifi') || amenities.includes('WiFi') || amenities.includes('Free WiFi');
                      const isWifiFree = amenities.includes('Free WiFi');

                      return (
                        <div className="space-y-4">
                          {/* Water */}
                          {!isWaterFree ? (
                            <div className="grid grid-cols-2 gap-3 pb-3 border-b border-gray-200">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">Water Due Day (1-31) <span className="text-red-500">*</span></label>
                                <input type="number" min="1" max="31" value={waterDueDay} onChange={e => setWaterDueDay(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-black outline-none" placeholder="1-31" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">Monthly Payment (₱) <span className="text-red-500">*</span></label>
                                <input type="number" min="0" value={waterPayment} onChange={e => setWaterPayment(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-black outline-none" placeholder="₱0.00" />
                              </div>
                            </div>
                          ) : (
                            <div className="pb-3 border-b border-gray-200">
                              <span className="text-sm font-bold text-green-700 flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Free Water</span>
                            </div>
                          )}

                          {/* Electricity */}
                          {!isElecFree ? (
                            <div className="grid grid-cols-2 gap-3 pb-3 border-b border-gray-200">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">Electricity Due Day <span className="text-red-500">*</span></label>
                                <input type="number" min="1" max="31" value={electricityDueDay} onChange={e => setElectricityDueDay(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-black outline-none" placeholder="1-31" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">Monthly Payment (₱) <span className="text-red-500">*</span></label>
                                <input type="number" min="0" value={electricityPayment} onChange={e => setElectricityPayment(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-black outline-none" placeholder="₱0.00" />
                              </div>
                            </div>
                          ) : (
                            <div className="pb-3 border-b border-gray-200">
                              <span className="text-sm font-bold text-green-700 flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Free Electricity</span>
                            </div>
                          )}

                          {/* WiFi */}
                          {!isWifiAvailable ? (
                            <div>
                              <span className="text-sm font-bold text-gray-700 flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01M5.636 13.636a9 9 0 0112.728 0M1.393 10.393a14 14 0 0121.213 0" /></svg> WiFi Not Available</span>
                            </div>
                          ) : !isWifiFree ? (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">WiFi Due Day <span className="text-red-500">*</span></label>
                                <input type="number" min="1" max="31" value={wifiDueDay} onChange={e => setWifiDueDay(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-black outline-none" placeholder="1-31" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">Monthly Payment (₱) <span className="text-red-500">*</span></label>
                                <input type="number" min="0" value={wifiPayment} onChange={e => setWifiPayment(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-black outline-none" placeholder="₱0.00" />
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="text-sm font-bold text-green-700 flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Free WiFi</span>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}

                <button
                  onClick={confirmAssignTenant}
                  disabled={!selectedPropertyId}
                  className="w-full py-3 bg-black text-white text-sm font-bold rounded-xl cursor-pointer hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  Assign Tenant
                </button>
              </>
            ) : (
              <div className="text-center">
                <div className="w-14 h-14 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-500">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Assignment</h3>
                <p className="text-gray-500 text-sm mb-1">Are you sure you want to assign</p>
                <p className="font-bold text-gray-900 mb-1">{getProfileDisplayName(assignBooking.tenant_profile, 'Unknown Tenant')}</p>
                <p className="text-gray-500 text-sm mb-4">to <strong>{availableProperties.find(p => p.id === selectedPropertyId)?.title}</strong>?</p>
                <p className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded-lg border border-yellow-200 mb-5">This will mark the property as occupied and create a move-in payment bill.</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowAssignWarning(false)} className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">Go Back</button>
                  <button onClick={confirmAssignTenant} className="flex-1 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-900 transition-colors shadow-lg cursor-pointer">Yes, Assign</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}