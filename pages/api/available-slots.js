import { supabaseAdmin } from '../../lib/supabaseAdmin'

const SLOT_LOCKING_BOOKING_STATUSES = ['pending', 'pending_approval', 'approved', 'accepted', 'viewing_done', 'assigned', 'completed']
const EXCLUDABLE_BOOKING_STATUSES = ['pending', 'pending_approval', 'approved', 'accepted']

function parseTimestamp(value) {
  if (!value) return null
  const date = new Date(value)
  const timestamp = date.getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client is not configured' })
  }

  const propertyId = String(req.query?.propertyId || '').trim()
  const landlordId = String(req.query?.landlordId || '').trim()
  const excludeBookingId = String(req.query?.excludeBookingId || '').trim()
  const includeBookedSlots = String(req.query?.includeBookedSlots || '').toLowerCase() === '1'

  if (!propertyId || !landlordId) {
    return res.status(400).json({ error: 'Missing propertyId or landlordId' })
  }

  try {
    const nowIso = new Date().toISOString()

    const [{ data: rawSlots, error: slotsError }, { data: slotLockingBookings, error: bookingsError }] = await Promise.all([
      supabaseAdmin
        .from('available_time_slots')
        .select('id, landlord_id, start_time, end_time, is_booked')
        .eq('landlord_id', landlordId)
        .gte('start_time', nowIso)
        .order('start_time', { ascending: true }),
      supabaseAdmin
        .from('bookings')
        .select('id, time_slot_id, booking_date, start_time, status')
        .eq('landlord', landlordId)
        .in('status', SLOT_LOCKING_BOOKING_STATUSES)
    ])

    if (slotsError) {
      return res.status(500).json({ error: slotsError.message || 'Failed to load available slots' })
    }

    if (bookingsError) {
      return res.status(500).json({ error: bookingsError.message || 'Failed to load active bookings' })
    }

    const slots = rawSlots || []
    const allSlotLockingBookings = slotLockingBookings || []
    let availabilityBookings = allSlotLockingBookings

    if (excludeBookingId) {
      const excluded = allSlotLockingBookings.find(item => String(item.id) === excludeBookingId)
      const canExclude = excluded && EXCLUDABLE_BOOKING_STATUSES.includes(String(excluded.status || '').toLowerCase())

      if (canExclude) {
        availabilityBookings = allSlotLockingBookings.filter(item => String(item.id) !== excludeBookingId)
      }
    }

    const syncTakenSlotIds = new Set(allSlotLockingBookings.map(item => item.time_slot_id).filter(Boolean))
    const syncTakenScheduleTimes = new Set(
      allSlotLockingBookings
        .map(item => parseTimestamp(item.booking_date) ?? parseTimestamp(item.start_time))
        .filter(value => value !== null)
    )

    const availabilityTakenSlotIds = new Set(availabilityBookings.map(item => item.time_slot_id).filter(Boolean))
    const availabilityTakenScheduleTimes = new Set(
      availabilityBookings
        .map(item => parseTimestamp(item.booking_date) ?? parseTimestamp(item.start_time))
        .filter(value => value !== null)
    )

    const shouldBeBookedIds = new Set()
    const shouldBeFreeIds = new Set()

    slots.forEach(slot => {
      const slotTime = parseTimestamp(slot.start_time)
      if (syncTakenSlotIds.has(slot.id) || (slotTime !== null && syncTakenScheduleTimes.has(slotTime))) {
        shouldBeBookedIds.add(slot.id)
      } else {
        shouldBeFreeIds.add(slot.id)
      }
    })

    const staleBookedIds = slots
      .filter(slot => shouldBeBookedIds.has(slot.id) && slot.is_booked !== true)
      .map(slot => slot.id)

    const staleFreeIds = slots
      .filter(slot => shouldBeFreeIds.has(slot.id) && slot.is_booked !== false)
      .map(slot => slot.id)

    if (staleBookedIds.length > 0) {
      await supabaseAdmin.from('available_time_slots').update({ is_booked: true }).in('id', staleBookedIds)
    }

    if (staleFreeIds.length > 0) {
      await supabaseAdmin.from('available_time_slots').update({ is_booked: false }).in('id', staleFreeIds)
    }

    const slotsWithAvailability = slots.map((slot) => {
      const slotTime = parseTimestamp(slot.start_time)
      const isAvailable = !availabilityTakenSlotIds.has(slot.id)
        && !(slotTime !== null && availabilityTakenScheduleTimes.has(slotTime))

      return {
        ...slot,
        is_available: isAvailable,
      }
    })

    if (includeBookedSlots) {
      return res.status(200).json({ slots: slotsWithAvailability })
    }

    const availableSlots = slotsWithAvailability.filter((slot) => slot.is_available)

    return res.status(200).json({ slots: availableSlots })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Unexpected error while loading availability' })
  }
}
