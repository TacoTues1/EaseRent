import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function PaymentHistoryPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadUserRole(result.data.session.user.id)
      } else {
        router.push('/auth')
      }
    })
  }, [])

  async function loadUserRole(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    setUserRole(data?.role || 'tenant')
  }

  // UPDATED: Added Realtime Subscription
  useEffect(() => {
    if (session && userRole) {
      loadPayments()

      // Subscribe to changes in the 'payments' table
      const channel = supabase
        .channel('payment_history_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments' },
          () => {
            // Re-fetch data whenever a change occurs
            loadPayments()
          }
        )
        .subscribe()

      // Cleanup subscription on unmount
      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [session, userRole])

  async function loadPayments() {
    let query = supabase
      .from('payments')
      .select('*, properties(title), profiles!payments_tenant_fkey(first_name, middle_name, last_name)')
      .order('paid_at', { ascending: false })

    if (userRole === 'tenant') {
      query = query.eq('tenant', session.user.id)
    } else if (userRole === 'landlord') {
      query = query.eq('landlord', session.user.id)
    }

    const { data } = await query
    setPayments(data || [])
    setLoading(false)
  }

  // Calculate totals
  const totalIncome = payments.reduce((sum, p) => {
    const rent = parseFloat(p.amount) || 0
    const water = parseFloat(p.water_bill) || 0
    const electrical = parseFloat(p.electrical_bill) || 0
    const other = parseFloat(p.other_bills) || 0
    return sum + rent + water + electrical + other
  }, 0)

  // Calculate chart data (Last 6 months)
  const getChartData = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const currentMonth = new Date().getMonth()
    const data = []

    for (let i = 5; i >= 0; i--) {
      const monthIndex = (currentMonth - i + 12) % 12
      data.push({
        label: months[monthIndex],
        value: 0
      })
    }

    payments.forEach(payment => {
      const date = new Date(payment.paid_at)
      const monthIndex = date.getMonth()
      const monthLabel = months[monthIndex]
      const dataPoint = data.find(d => d.label === monthLabel)

      if (dataPoint) {
        const total = (
          (parseFloat(payment.amount) || 0) +
          (parseFloat(payment.water_bill) || 0) +
          (parseFloat(payment.electrical_bill) || 0) +
          (parseFloat(payment.other_bills) || 0)
        )
        dataPoint.value += total
      }
    })

    return data
  }

  const chartData = getChartData()
  const maxChartValue = Math.max(...chartData.map(d => d.value), 1000)

  if (!session) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-black"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-black">History</h1>
            <p className="text-sm text-gray-500 mt-1">View all payment records</p>
          </div>
          <Link
            href="/payments"
            className="px-6 py-2.5 bg-white border-2 border-black text-black font-bold rounded-lg cursor-pointer"
          >
            ← Back to Payments
          </Link>
        </div>

        {/* Stats & Graph Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Summary Cards */}
          <div className="space-y-4 lg:col-span-1">
            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
              <div className="text-sm font-medium text-gray-500 mb-2">
                {userRole === 'landlord' ? 'Total Collected' : 'Total Paid'}
              </div>
              <div className="text-3xl font-black text-gray-900 truncate">
                ₱{totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
              <div className="text-sm font-medium text-gray-500 mb-2">Transactions</div>
              <div className="text-3xl font-black text-gray-900">{payments.length}</div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
              <div className="text-sm font-medium text-gray-500 mb-2">Average</div>
              <div className="text-3xl font-black text-gray-900 truncate">
                ₱{payments.length > 0 ? (totalIncome / payments.length).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </div>
            </div>
          </div>

          {/* Payment Trends Graph */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">Payment Volume</h3>
                <p className="text-sm text-gray-500 font-medium mt-1">Last 6 months overview</p>
              </div>
            </div>

            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPayment" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1aff00ff" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#1aff00ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '12px', padding: '12px' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value) => [`₱${value.toLocaleString()}`, 'Total Payments']}
                    cursor={{ stroke: '#000', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#55ed44ff"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorPayment)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Payment History Table */}
        <div className="bg-white border-2 border-black overflow-hidden rounded-xl shadow-md">
          <div className="px-6 py-4 border-b-2 border-black bg-white flex justify-between items-center">
            <h2 className="text-lg font-bold text-black uppercase tracking-wider">Transaction Log</h2>
            <span className="text-xs font-medium bg-gray-100 px-2 py-1 rounded border border-gray-200">
              {payments.length} Records
            </span>
          </div>

          {loading ? (
            <div className="p-8 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-black"></div>
            </div>
          ) : payments.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-black mb-1">No history found</h3>
              <p className="text-gray-500 text-sm">
                No payment records are available yet.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden divide-y divide-gray-100">
                {payments.map(payment => {
                  const rent = parseFloat(payment.amount) || 0
                  const water = parseFloat(payment.water_bill) || 0
                  const electrical = parseFloat(payment.electrical_bill) || 0
                  const other = parseFloat(payment.other_bills) || 0
                  const totalBills = water + electrical + other
                  const grandTotal = rent + totalBills

                  return (
                    <div key={payment.id} className="p-5 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-bold text-sm text-black">{payment.properties?.title || 'Unknown Property'}</div>
                          {userRole === 'landlord' && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {payment.profiles?.first_name} {payment.profiles?.last_name}
                            </div>
                          )}
                        </div>
                        <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-black text-white border border-black rounded-sm">
                          Paid
                        </span>
                      </div>

                      <div className="flex items-baseline gap-1 mb-3">
                        <span className="text-xs font-bold text-gray-500 uppercase">Total</span>
                        <span className="text-xl font-bold text-black">₱{grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3 bg-gray-50 p-2 rounded border border-gray-100">
                        <div>Rent: <span className="font-medium text-black">₱{rent.toLocaleString()}</span></div>
                        <div>Bills: <span className="font-medium text-black">₱{totalBills.toLocaleString()}</span></div>
                      </div>

                      <div className="flex justify-between items-center text-xs text-gray-400 border-t border-gray-100 pt-3">
                        <div className="flex items-center gap-1">
                          <span className="uppercase font-bold tracking-wider">{payment.method?.replace('_', ' ')}</span>
                        </div>
                        <span>{new Date(payment.paid_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Property</th>
                      {userRole === 'landlord' && (
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tenant</th>
                      )}
                      <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Rent</th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Bills</th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Method</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map(payment => {
                      const rent = parseFloat(payment.amount) || 0
                      const water = parseFloat(payment.water_bill) || 0
                      const electrical = parseFloat(payment.electrical_bill) || 0
                      const other = parseFloat(payment.other_bills) || 0
                      const totalBills = water + electrical + other
                      const grandTotal = rent + totalBills

                      return (
                        <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-sm font-bold text-black">
                            {payment.properties?.title || 'N/A'}
                          </td>
                          {userRole === 'landlord' && (
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {payment.profiles?.first_name} {payment.profiles?.last_name || 'N/A'}
                            </td>
                          )}
                          <td className="px-6 py-4 text-sm text-right font-medium text-gray-600">
                            ₱{rent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-4 text-sm text-right">
                            {totalBills > 0 ? (
                              <div className="group relative inline-block cursor-help">
                                <span className="font-medium text-gray-600 border-b border-dotted border-gray-400">
                                  ₱{totalBills.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                                {/* Tooltip for bill breakdown */}
                                <div className="absolute bottom-full right-0 mb-2 w-48 bg-black text-white text-xs p-3 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                                  <div className="flex justify-between mb-1"><span>Water:</span> <span>₱{water.toLocaleString()}</span></div>
                                  <div className="flex justify-between mb-1"><span>Electric:</span> <span>₱{electrical.toLocaleString()}</span></div>
                                  <div className="flex justify-between"><span>Other:</span> <span>₱{other.toLocaleString()}</span></div>
                                  {payment.bills_description && (
                                    <div className="mt-2 pt-2 border-t border-gray-700 italic text-gray-300">
                                      "{payment.bills_description}"
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-bold text-black">
                            ₱{grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 border border-gray-200 px-2 py-1 rounded-sm bg-gray-50">
                              {payment.method?.replace('_', ' ') || 'Cash'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-center text-gray-500">
                            {new Date(payment.paid_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-black text-white border border-black rounded-full">
                              Paid
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}