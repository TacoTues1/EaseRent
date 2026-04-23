import Lottie from "lottie-react"
import { useEffect, useState } from 'react'
import { NON_ADVANCE_PAYMENT_REQUEST_FILTER, sumRecordedPaymentRequestAmounts } from '../lib/paymentTotals'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import loadingAnimation from "../assets/loading.json"

const PAYMENT_HISTORY_PER_PAGE = 15

export default function PaymentHistoryPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState(null)
  const [chartYear, setChartYear] = useState(new Date().getFullYear())
  const [chartFilter, setChartFilter] = useState('all')
  const [paidIncomeRequests, setPaidIncomeRequests] = useState([])
  const [selectedDetailPayment, setSelectedDetailPayment] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [isPageLoading, setIsPageLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadUserRole(result.data.session.user.id)
      } else {
          router.push('/')
      }
    })
  }, [])

  async function loadUserRole(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    const role = data?.role || 'tenant'

    if (role === 'tenant') {
      router.replace('/payments')
      return
    }

    setUserRole(role)
  }

  // Realtime Subscription
  useEffect(() => {
    if (session && userRole) {
      loadPayments()
      loadPaidIncomeRequests()

      const channel = supabase
        .channel('payment_history_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments' },
          () => {
            loadPayments()
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payment_requests' },
          () => {
            loadPaidIncomeRequests()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [session, userRole])

  useEffect(() => {
    setCurrentPage(1)
  }, [userRole, payments.length])

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

  async function loadPaidIncomeRequests() {
    if (!session?.user?.id || userRole !== 'landlord') {
      setPaidIncomeRequests([])
      return
    }

    const { data, error } = await supabase
      .from('payment_requests')
      .select('amount_paid, rent_amount, security_deposit_amount, advance_amount, water_bill, electrical_bill, wifi_bill, other_bills, paid_at')
      .eq('landlord', session.user.id)
      .eq('status', 'paid')
      .or(NON_ADVANCE_PAYMENT_REQUEST_FILTER)

    if (error) {
      console.error('Error loading payment history income totals:', error)
      return
    }

    setPaidIncomeRequests(data || [])
  }

  // Calculate totals
  const totalIncome = sumRecordedPaymentRequestAmounts(paidIncomeRequests)

  const totalPaymentCount = payments.length
  const totalPages = Math.max(1, Math.ceil(totalPaymentCount / PAYMENT_HISTORY_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = totalPaymentCount === 0 ? 0 : (safeCurrentPage - 1) * PAYMENT_HISTORY_PER_PAGE + 1
  const pageEnd = Math.min((safeCurrentPage - 1) * PAYMENT_HISTORY_PER_PAGE + PAYMENT_HISTORY_PER_PAGE, totalPaymentCount)
  const paginatedPayments = payments.slice((safeCurrentPage - 1) * PAYMENT_HISTORY_PER_PAGE, (safeCurrentPage - 1) * PAYMENT_HISTORY_PER_PAGE + PAYMENT_HISTORY_PER_PAGE)
  const isTableLoading = loading || isPageLoading

  function handlePageChange(nextPage) {
    if (loading || isPageLoading || nextPage < 1 || nextPage > totalPages || nextPage === safeCurrentPage) return

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    setIsPageLoading(true)
    setSelectedDetailPayment(null)
    setCurrentPage(nextPage)

    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        setIsPageLoading(false)
      }, 180)
    } else {
      setIsPageLoading(false)
    }
  }

  function getMethodLabel(method) {
    if (!method) return 'Cash'
    return method === 'paymongo' ? 'E-Wallet / Cards' : method === 'stripe' ? 'Stripe' : method === 'qr_code' ? 'QR Code' : method === 'cash' ? 'Cash' : method.charAt(0).toUpperCase() + method.slice(1).replace('_', ' ')
  }

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
            className="px-6 py-2.5 bg-white border-2 border-black text-black font-bold rounded-lg cursor-pointer hover:bg-black hover:text-white transition-all"
          >
            ← Back to Payments
          </Link>
        </div>

        {/* Stats & Graph Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Summary Cards */}
          <div className="space-y-4 lg:col-span-1">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col justify-center h-full">
              <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
                {userRole === 'landlord' ? 'Total Collected' : 'Total Paid'}
              </div>
              <div className="text-3xl font-black text-gray-900 truncate">
                ₱{totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-1">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col justify-center h-full">
              <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Transactions</div>
              <div className="text-3xl font-black text-gray-900">{totalPaymentCount}</div>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-1">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col justify-center h-full">
              <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Average</div>
              <div className="text-3xl font-black text-gray-900 truncate">
                ₱{totalPaymentCount > 0 ? (totalIncome / totalPaymentCount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </div>
            </div>
          </div>
        </div>

        {/* Payment Trends Graph (Landlord Only) */}
        {userRole === 'landlord' && (() => {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          const chartDataYear = monthNames.map((name, month) => {
            const mStart = new Date(chartYear, month, 1)
            const mEnd = new Date(chartYear, month + 1, 0, 23, 59, 59)
            const monthPaid = paidIncomeRequests.filter(p => {
              if (!p.paid_at) return false
              const d = new Date(p.paid_at)
              return d >= mStart && d <= mEnd
            })
            const income = sumRecordedPaymentRequestAmounts(monthPaid)
            const other = monthPaid.reduce((s, p) => s + (parseFloat(p.other_bills) || 0), 0)
            return { name, income, other }
          })

          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8 flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-black text-gray-900 tracking-tight">Financial Overview</h3>
                  <p className="text-sm text-gray-500 font-medium mt-0.5">Income analysis for {chartYear}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-gray-100 rounded-xl p-1">
                    {[{ key: 'all', label: 'All' }, { key: 'other', label: 'Other Bill' }].map(tab => (
                      <button key={tab.key} onClick={() => setChartFilter(tab.key)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${chartFilter === tab.key ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-black'}`}
                      >{tab.label}</button>
                    ))}
                  </div>
                  <select value={chartYear} onChange={e => setChartYear(parseInt(e.target.value))}
                    className="bg-gray-50 border-none text-sm font-bold rounded-xl px-4 py-2 cursor-pointer hover:bg-gray-100 transition-colors focus:ring-0">
                    {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartDataYear}>
                    <defs>
                      <linearGradient id="colorAll" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1aff00" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#1aff00" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorOther" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '12px', padding: '12px' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={v => [`₱${v.toLocaleString()}`, chartFilter === 'all' ? 'Total Income' : 'Other Bill']}
                      cursor={{ stroke: '#000', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Area type="monotone" dataKey={chartFilter === 'all' ? 'income' : 'other'}
                      stroke={chartFilter === 'all' ? '#55ed44' : '#f59e0b'} strokeWidth={3} fillOpacity={1}
                      fill={`url(#${chartFilter === 'all' ? 'colorAll' : 'colorOther'})`} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })()}

        {/* Payment History Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-black text-gray-900">Transaction Log</h2>
            <span className="text-xs font-medium bg-gray-100 px-2 py-1 rounded border border-gray-200">
              {totalPaymentCount} Records
            </span>
          </div>

          {isTableLoading ? (
            <div className="min-h-screen flex items-center justify-center bg-white">
              <div className="flex flex-col items-center">
                <Lottie
                  animationData={loadingAnimation}
                  loop={true}
                  className="w-64 h-64"
                />
                <p className="text-gray-500 font-medium text-lg mt-4">
                  Loading Payment History...
                </p>
              </div>
            </div>
          ) : totalPaymentCount === 0 ? (
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
                {paginatedPayments.map(payment => {
                  const rent = parseFloat(payment.amount) || 0
                  const water = parseFloat(payment.water_bill) || 0
                  const electrical = parseFloat(payment.electrical_bill) || 0
                  const other = parseFloat(payment.other_bills) || 0
                  const totalBills = water + electrical + other
                  const grandTotal = rent + totalBills

                  return (
                    <div key={payment.id} className="p-5 hover:bg-gray-50 transition-colors cursor-pointer active:bg-gray-100" onClick={() => setSelectedDetailPayment(payment)}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-bold text-sm text-black">{payment.properties?.title || 'Unknown Property'}</div>
                          {userRole === 'landlord' && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {payment.profiles?.first_name} {payment.profiles?.last_name}
                            </div>
                          )}
                        </div>
                        <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-700 border border-green-100 rounded-full">
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
                          <span className="uppercase font-bold tracking-wider">{getMethodLabel(payment.method)}</span>
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
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Property</th>
                      {userRole === 'landlord' && (
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tenant</th>
                      )}
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Rent</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Bills</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Method</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedPayments.map(payment => {
                      const rent = parseFloat(payment.amount) || 0
                      const water = parseFloat(payment.water_bill) || 0
                      const electrical = parseFloat(payment.electrical_bill) || 0
                      const other = parseFloat(payment.other_bills) || 0
                      const totalBills = water + electrical + other
                      const grandTotal = rent + totalBills

                      return (
                        <tr key={payment.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedDetailPayment(payment)}>
                          {/* Property */}
                          <td className="px-3 py-2.5">
                            <div className="max-w-[160px]">
                              <div className="text-sm font-bold text-black truncate" title={payment.properties?.title}>
                                {payment.properties?.title || 'N/A'}
                              </div>
                            </div>
                          </td>

                          {/* Tenant */}
                          {userRole === 'landlord' && (
                            <td className="px-3 py-2.5 text-sm text-gray-600">
                              <div className="max-w-[120px] truncate">
                                {payment.profiles?.first_name} {payment.profiles?.last_name || 'N/A'}
                              </div>
                            </td>
                          )}

                          {/* Rent */}
                          <td className="px-3 py-2.5">
                            <span className="text-sm font-medium text-gray-600 whitespace-nowrap">₱{rent.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </td>

                          {/* Bills */}
                          <td className="px-3 py-2.5">
                            {totalBills > 0 ? (
                              <div className="group relative inline-block cursor-help">
                                <span className="text-sm font-medium text-gray-600 border-b border-dotted border-gray-400 whitespace-nowrap">
                                  ₱{totalBills.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                                {/* Tooltip for bill breakdown */}
                                <div className="absolute bottom-full right-0 mb-2 w-48 bg-black text-white text-xs p-3 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
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

                          {/* Total */}
                          <td className="px-3 py-2.5">
                            <span className="text-sm font-bold text-black whitespace-nowrap">₱{grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </td>

                          {/* Method */}
                          <td className="px-3 py-2.5">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 border border-gray-200 px-2 py-1 rounded-sm bg-gray-50 whitespace-nowrap">
                              {getMethodLabel(payment.method)}
                            </span>
                          </td>

                          {/* Date */}
                          <td className="px-3 py-2.5">
                            <span className="text-sm text-gray-600 whitespace-nowrap">
                              {new Date(payment.paid_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-3 py-2.5">
                            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-700 border border-green-100 rounded-full whitespace-nowrap">
                              Paid
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-5 py-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-xs font-medium text-gray-500">
                    Showing {pageStart}-{pageEnd} of {totalPaymentCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(safeCurrentPage - 1)}
                      disabled={isTableLoading || safeCurrentPage === 1}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-bold text-gray-600 px-2">
                      Page {safeCurrentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(safeCurrentPage + 1)}
                      disabled={isTableLoading || safeCurrentPage === totalPages}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== SLIDE-IN DETAIL PANEL (same as payments.js) ===== */}
      {selectedDetailPayment && (() => {
        const r = selectedDetailPayment
        const rent = parseFloat(r.amount) || 0
        const water = parseFloat(r.water_bill) || 0
        const electrical = parseFloat(r.electrical_bill) || 0
        const wifi = parseFloat(r.wifi_bill) || 0
        const other = parseFloat(r.other_bills) || 0
        const grandTotal = rent + water + electrical + wifi + other

        return (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSelectedDetailPayment(null)} />
            <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
              {/* Header */}
              <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-lg font-black">Payment Details</h3>
                <button onClick={() => setSelectedDetailPayment(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full border bg-green-50 text-green-700 border-green-200">
                    Paid
                  </span>
                  <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded">Payment</span>
                </div>

                {/* Property */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Property</label>
                  <p className="font-bold text-gray-900 mt-0.5">{r.properties?.title || 'N/A'}</p>
                </div>

                {/* People */}
                {userRole === 'landlord' && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tenant</label>
                    <p className="font-bold text-sm mt-0.5">
                      {r.profiles?.first_name} {r.profiles?.middle_name && r.profiles?.middle_name !== 'N/A' ? r.profiles.middle_name + ' ' : ''}{r.profiles?.last_name || ''}
                    </p>
                  </div>
                )}

                {/* Amount Breakdown */}
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Amount Breakdown</label>
                  </div>
                  <div className="p-4 space-y-2">
                    {rent > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Rent</span><span className="font-bold">₱{rent.toLocaleString()}</span></div>}
                    {water > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Water Bill</span><span className="font-bold">₱{water.toLocaleString()}</span></div>}
                    {electrical > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Electric Bill</span><span className="font-bold">₱{electrical.toLocaleString()}</span></div>}
                    {wifi > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Wifi Bill</span><span className="font-bold">₱{wifi.toLocaleString()}</span></div>}
                    {other > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Other Charges</span><span className="font-bold">₱{other.toLocaleString()}</span></div>}
                    <div className="border-t border-gray-100 pt-2 flex justify-between font-bold">
                      <span>Total</span>
                      <span className="text-lg">₱{grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Details */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs font-bold text-gray-400 uppercase">Date Paid</span>
                    <span className="text-sm font-bold text-gray-900">
                      {r.paid_at ? new Date(r.paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs font-bold text-gray-400 uppercase">Time</span>
                    <span className="text-sm font-bold text-gray-900">
                      {r.paid_at ? new Date(r.paid_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs font-bold text-gray-400 uppercase">Payment Method</span>
                    <span className="text-sm font-bold text-gray-900">
                      {getMethodLabel(r.method)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs font-bold text-gray-400 uppercase">Reference No.</span>
                    <span className="text-sm font-bold font-mono text-gray-900">{r.reference_number || '-'}</span>
                  </div>
                  {r.bills_description && (
                    <div className="py-2 border-b border-gray-50">
                      <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Message / Description</span>
                      <p className="text-sm text-gray-700">{r.bills_description}</p>
                    </div>
                  )}
                  {r.receipt_url && (
                    <div className="py-2 border-b border-gray-50">
                      <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Attachment</span>
                      <a href={r.receipt_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 font-bold hover:underline">View File →</a>
                    </div>
                  )}
                  {r.proof_url && (
                    <div className="py-2">
                      <span className="text-xs font-bold text-gray-400 uppercase block mb-2">Payment Proof</span>
                      <img src={r.proof_url} alt="Payment Proof" className="w-full max-h-48 object-cover rounded-xl border border-gray-100" />
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs font-bold text-gray-400 uppercase">Created</span>
                    <span className="text-sm text-gray-600">{r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
