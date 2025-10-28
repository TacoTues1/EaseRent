import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'

export default function PaymentsPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [payments, setPayments] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [userRole, setUserRole] = useState(null)

  const [formData, setFormData] = useState({
    property_id: '',
    amount: '',
    method: 'bank_transfer',
    tenant: ''
  })

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
      .single()
    
    setUserRole(data?.role || 'tenant')
  }

  useEffect(() => {
    if (session && userRole) {
      loadPayments()
      if (userRole === 'landlord') loadProperties()
    }
  }, [session, userRole])

  async function loadPayments() {
    let query = supabase
      .from('payments')
      .select('*, properties(title), profiles!payments_tenant_fkey(full_name)')
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

  async function loadProperties() {
    const { data } = await supabase
      .from('properties')
      .select('id, title')
      .eq('landlord', session.user.id)
    
    setProperties(data || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const { error } = await supabase.from('payments').insert({
      ...formData,
      landlord: session.user.id,
      status: 'recorded'
    })

    if (!error) {
      setFormData({ property_id: '', amount: '', method: 'bank_transfer', tenant: '' })
      setShowForm(false)
      loadPayments()
    }
  }

  if (!session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  const totalIncome = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Payments</h1>
          {userRole === 'landlord' && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              {showForm ? 'Cancel' : 'Record Payment'}
            </button>
          )}
        </div>

        {userRole === 'landlord' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Total Income</div>
              <div className="text-3xl font-bold text-green-600">₱{totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Total Payments</div>
              <div className="text-3xl font-bold text-blue-600">{payments.length}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Avg Payment</div>
              <div className="text-3xl font-bold text-purple-600">
                ₱{payments.length > 0 ? (totalIncome / payments.length).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </div>
            </div>
          </div>
        )}

        {showForm && userRole === 'landlord' && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Record New Payment</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Property</label>
                <select
                  required
                  className="w-full border rounded px-3 py-2"
                  value={formData.property_id}
                  onChange={e => setFormData({ ...formData, property_id: e.target.value })}
                >
                  <option value="">Select a property</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Amount</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    className="w-full border rounded px-3 py-2"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Payment Method</label>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={formData.method}
                    onChange={e => setFormData({ ...formData, method: e.target.value })}
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="stripe">Stripe</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Tenant ID (optional)</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  placeholder="Tenant UUID"
                  value={formData.tenant}
                  onChange={e => setFormData({ ...formData, tenant: e.target.value })}
                />
              </div>

              <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded">
                Record Payment
              </button>
            </form>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <p className="p-6 text-gray-500">Loading...</p>
          ) : payments.length === 0 ? (
            <p className="p-6 text-gray-500">No payment records yet.</p>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Property</th>
                  {userRole === 'landlord' && (
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Tenant</th>
                  )}
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Amount</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Method</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map(payment => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-sm">{payment.properties?.title || 'N/A'}</td>
                    {userRole === 'landlord' && (
                      <td className="px-4 py-3 text-sm">{payment.profiles?.full_name || 'N/A'}</td>
                    )}
                    <td className="px-4 py-3 text-sm font-semibold">₱{parseFloat(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm">{payment.method}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-700">
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(payment.paid_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
