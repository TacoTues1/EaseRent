const DAY_IN_MS = 1000 * 60 * 60 * 24

function parseOccupancyDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

export function getDaysUntil(value) {
  const date = parseOccupancyDate(value)
  if (!date) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.ceil((date.getTime() - today.getTime()) / DAY_IN_MS))
}

export function prepareListableProperties(items = []) {
  return items.filter((property) => {
    if (property?.status === 'available') return true
    return property?.status === 'occupied' && Boolean(property.upcoming_available_date)
  })
}

export async function attachUpcomingAvailability(items = []) {
  const occupiedPropertyIds = Array.from(new Set(
    items
      .filter((property) => property?.status === 'occupied')
      .map((property) => property.id)
      .filter(Boolean)
  ))

  if (occupiedPropertyIds.length === 0) return items

  try {
    const response = await fetch('/api/upcoming-property-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyIds: occupiedPropertyIds })
    })

    if (!response.ok) throw new Error('Failed to load upcoming availability')

    const data = await response.json()
    const availability = data?.availability || {}

    return items.map((property) => {
      const upcomingAvailableDate = availability[property.id]
      return upcomingAvailableDate
        ? { ...property, upcoming_available_date: upcomingAvailableDate }
        : property
    })
  } catch (error) {
    console.error('Error loading upcoming property availability:', error)
    return items
  }
}

export function getPropertyStatusLabel(property) {
  if (property?.status === 'available') return 'Available'

  if (property?.upcoming_available_date) {
    const days = getDaysUntil(property.upcoming_available_date)
    if (days !== null) return `Will be available in ${days} day${days === 1 ? '' : 's'}`
  }

  if (property?.status === 'occupied') return 'Occupied'
  return 'Not Available'
}
