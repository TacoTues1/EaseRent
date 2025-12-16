import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'

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

  useEffect(() => {
    if (session && userRole) {
      loadPayments()
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

  if (!session) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-black">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-3 sm:p-6">   
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Payment History</h1>
            <p className="text-sm text-gray-500 mt-1">View all completed payment records</p>
          </div>
          <Link 
            href="/payments"
            className="px-4 py-2 bg-black text-white font-medium rounded hover:bg-gray-800"
          >
            Back to Bills
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="bg-white border-2 border-black p-4 sm:p-6">
            <div className="text-xs sm:text-sm text-black mb-1">
              {userRole === 'landlord' ? 'Total Income' : 'Total Paid'}
            </div>
            <div className="text-xl sm:text-3xl font-bold text-black">
              ₱{totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white border-2 border-black p-4 sm:p-6">
            <div className="text-xs sm:text-sm text-black mb-1">Total Payments</div>
            <div className="text-xl sm:text-3xl font-bold text-black">{payments.length}</div>
          </div>
          <div className="bg-white border-2 border-black p-4 sm:p-6">
            <div className="text-xs sm:text-sm text-black mb-1">Avg Payment</div>
            <div className="text-xl sm:text-3xl font-bold text-black">
              ₱{payments.length > 0 ? (totalIncome / payments.length).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </div>
          </div>
        </div>

        {/* Payment History Table */}
        <div className="bg-white border-2 border-black overflow-hidden">
          <div className="px-6 py-4 border-b border-black bg-white">
            <h2 className="text-lg font-semibold text-black">All Payments</h2>
          </div>
          
          {loading ? (
            <p className="p-6 text-black">Loading...</p>
          ) : payments.length === 0 ? (
            <div className="p-6">
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="text-lg font-medium text-black mb-2">No payment records yet</h3>
                <p className="text-gray-500 text-sm">
                  {userRole === 'landlord' 
                    ? "Payment records will appear here when tenants make payments."
                    : "Your payment history will appear here once you make payments."}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden divide-y">
                {payments.map(payment => {
                  const rent = parseFloat(payment.amount) || 0
                  const water = parseFloat(payment.water_bill) || 0
                  const electrical = parseFloat(payment.electrical_bill) || 0
                  const other = parseFloat(payment.other_bills) || 0
                  const totalBills = water + electrical + other
                  const grandTotal = rent + totalBills

                  return (
                    <div key={payment.id} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium text-sm">{payment.properties?.title || 'N/A'}</div>
                          {userRole === 'landlord' && (
                            <div className="text-xs text-gray-500">{payment.profiles?.first_name} {payment.profiles?.last_name || 'N/A'}</div>
                          )}
                        </div>
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                          Paid
                        </span>
                      </div>
                      
                      <div className="text-lg font-bold text-green-600 mb-2">
                        ₱{grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      
                      <div className="text-xs text-gray-500 space-y-0.5 mb-2">
                        <div>Rent: ₱{rent.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                        {water > 0 && <div>Water: ₱{water.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>}
                        {electrical > 0 && <div>Electric: ₱{electrical.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>}
                        {other > 0 && <div>Other: ₱{other.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>}
                      </div>
                      
                      <div className="flex justify-between text-xs text-gray-500">
                        <span className="capitalize">{payment.method?.replace('_', ' ') || 'N/A'}</span>
                        <span>{new Date(payment.paid_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">Property</th>
                      {userRole === 'landlord' && (
                        <th className="px-4 py-3 text-left text-sm font-medium text-black">Tenant</th>
                      )}
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">Rent</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">Bills</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">Total</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">Method</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {payments.map(payment => {
                      const rent = parseFloat(payment.amount) || 0
                      const water = parseFloat(payment.water_bill) || 0
                      const electrical = parseFloat(payment.electrical_bill) || 0
                      const other = parseFloat(payment.other_bills) || 0
                      const totalBills = water + electrical + other
                      const grandTotal = rent + totalBills

                      return (
                        <tr key={payment.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{payment.properties?.title || 'N/A'}</td>
                          {userRole === 'landlord' && (
                            <td className="px-4 py-3 text-sm">{payment.profiles?.first_name} {payment.profiles?.last_name || 'N/A'}</td>
                          )}
                          <td className="px-4 py-3 text-sm font-medium">
                            ₱{rent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {totalBills > 0 ? (
                              <div className="space-y-1">
                                {water > 0 && (
                                  <div className="text-xs text-gray-600">
                                    Water: ₱{water.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                )}
                                {electrical > 0 && (
                                  <div className="text-xs text-gray-600">
                                    Electric: ₱{electrical.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                )}
                                {other > 0 && (
                                  <div className="text-xs text-gray-600">
                                    Other: ₱{other.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                )}
                                {payment.bills_description && (
                                  <div className="text-xs text-gray-500 italic mt-1">
                                    {payment.bills_description}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">No bills</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-green-600">
                            ₱{grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-sm capitalize">{payment.method?.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                              {payment.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                            {new Date(payment.paid_at).toLocaleDateString()}
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
