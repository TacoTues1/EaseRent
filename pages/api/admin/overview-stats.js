import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { getAdminProfile, getAuthenticatedUser } from '../../../lib/apiAuth'
import { SUPPORT_TICKET_STATUSES } from '../../../lib/supportTickets'

const OVERVIEW_CHARTS = [
  {
    key: 'users',
    table: 'profiles',
    field: 'role',
    values: ['tenant', 'landlord', 'admin'],
    filters: [{ type: 'eq', column: 'is_deleted', value: false }]
  },
  {
    key: 'bookings',
    table: 'bookings',
    field: 'status',
    values: ['pending', 'pending_approval', 'approved', 'accepted', 'viewing_done', 'rejected', 'cancelled', 'completed', 'assigned', 'ready_to_book'],
    includeOther: true
  },
  {
    key: 'properties',
    table: 'properties',
    field: 'status',
    values: ['available', 'occupied', 'not_available'],
    filters: [{ type: 'eq', column: 'is_deleted', value: false }],
    includeOther: true
  },
  {
    key: 'maintenance',
    table: 'maintenance_requests',
    field: 'status',
    values: ['pending', 'scheduled', 'in_progress', 'completed', 'resolved', 'closed', 'cancelled'],
    includeOther: true
  },
  {
    key: 'tickets',
    table: 'support_tickets',
    field: 'status',
    values: SUPPORT_TICKET_STATUSES.map(status => status.value),
    includeOther: true
  },
  {
    key: 'occupancy',
    table: 'tenant_occupancies',
    field: 'status',
    values: ['active', 'pending_end', 'ended'],
    includeOther: true
  },
  {
    key: 'leaves',
    table: 'tenant_occupancies',
    field: 'end_request_status',
    values: ['pending', 'approved', 'rejected', 'cancel_pending', 'completed'],
    includeOther: true
  }
]

function applyFilters(query, filters = []) {
  return filters.reduce((currentQuery, filter) => {
    if (filter.type === 'eq') return currentQuery.eq(filter.column, filter.value)
    if (filter.type === 'neq') return currentQuery.neq(filter.column, filter.value)
    if (filter.type === 'in') return currentQuery.in(filter.column, filter.value)
    if (filter.type === 'is') return currentQuery.is(filter.column, filter.value)
    if (filter.type === 'not_null') return currentQuery.not(filter.column, 'is', null)
    return currentQuery
  }, query)
}

function formatChartLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

async function countRows(table, filters = []) {
  const query = applyFilters(
    supabaseAdmin.from(table).select('id', { count: 'exact', head: true }),
    filters
  )
  const { count, error } = await query

  if (error) {
    throw new Error(`${table} count failed: ${error.message}`)
  }

  return count || 0
}

async function buildChart(config) {
  const baseFilters = config.filters || []
  const countTasks = config.values.map(async value => {
    const count = await countRows(config.table, [
      ...baseFilters,
      { type: 'eq', column: config.field, value }
    ])

    return {
      name: formatChartLabel(value),
      value: count
    }
  })

  const totalTask = config.includeOther
    ? countRows(config.table, [
        ...baseFilters,
        { type: 'not_null', column: config.field }
      ])
    : Promise.resolve(null)

  const [knownCounts, totalCount] = await Promise.all([
    Promise.all(countTasks),
    totalTask
  ])

  const chart = knownCounts.filter(item => item.value > 0)

  if (config.includeOther) {
    const knownTotal = knownCounts.reduce((sum, item) => sum + item.value, 0)
    const otherCount = Math.max(0, (totalCount || 0) - knownTotal)
    if (otherCount > 0) {
      chart.push({ name: 'Other', value: otherCount })
    }
  }

  return chart
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client is not configured' })
  }

  try {
    const user = await getAuthenticatedUser(req)
    await getAdminProfile(supabaseAdmin, user.id)

    const chartEntries = await Promise.all(
      OVERVIEW_CHARTS.map(async config => [config.key, await buildChart(config)])
    )

    res.setHeader('Cache-Control', 'private, max-age=20')
    return res.status(200).json({
      chartData: Object.fromEntries(chartEntries)
    })
  } catch (error) {
    const message = error.message || 'Request failed'
    const status = message.includes('Only admins') ? 403 : message.includes('unreachable') ? 503 : 401
    return res.status(status).json({ error: message })
  }
}
