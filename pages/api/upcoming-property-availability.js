import { supabaseAdmin } from '../../lib/supabaseAdmin'

const ACTIVE_OCCUPANCY_STATUSES = new Set(['active', 'pending_end'])
const SCHEDULED_END_REQUEST_STATUSES = new Set(['approved', 'pending', 'cancel_pending'])

function parseOccupancyDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function getOccupancyAvailabilityDate(occupancy) {
  if (!occupancy || !ACTIVE_OCCUPANCY_STATUSES.has(occupancy.status)) return null

  const dateCandidates = []
  if (occupancy.end_request_date && SCHEDULED_END_REQUEST_STATUSES.has(occupancy.end_request_status)) {
    dateCandidates.push(occupancy.end_request_date)
  }
  if (occupancy.contract_end_date) dateCandidates.push(occupancy.contract_end_date)
  if (occupancy.end_date) dateCandidates.push(occupancy.end_date)

  return dateCandidates
    .map((value) => ({ value, date: parseOccupancyDate(value) }))
    .filter((item) => item.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]?.value || null
}

function buildAvailabilityMap(occupancies = []) {
  const grouped = new Map()

  occupancies.forEach((occupancy) => {
    const upcomingDate = getOccupancyAvailabilityDate(occupancy)
    if (!upcomingDate) return

    const propertyId = occupancy.property_id
    const date = parseOccupancyDate(upcomingDate)
    if (!propertyId || !date) return

    const current = grouped.get(propertyId)
    if (!current || date < current.date) {
      grouped.set(propertyId, { value: upcomingDate, date })
    }
  })

  return Object.fromEntries(
    Array.from(grouped.entries()).map(([propertyId, item]) => [propertyId, item.value])
  )
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*') 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client is not configured' })
  }

  const propertyIds = Array.isArray(req.body?.propertyIds)
    ? Array.from(new Set(req.body.propertyIds.map((id) => String(id || '').trim()).filter(Boolean)))
    : []

  if (propertyIds.length === 0) {
    return res.status(200).json({ availability: {} })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('tenant_occupancies')
      .select('property_id, end_request_date, end_request_status, status')
      .in('property_id', propertyIds)
      .in('status', Array.from(ACTIVE_OCCUPANCY_STATUSES))

    if (error) {
      return res.status(500).json({ error: error.message || 'Failed to load upcoming availability' })
    }

    return res.status(200).json({ availability: buildAvailabilityMap(data || []) })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Unexpected error while loading availability' })
  }
}
