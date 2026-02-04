
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { showToast } from 'nextjs-toast-notify'
import Head from 'next/head'
import { useRouter } from 'next/router'

export default function TestBilling() {
    const [tenants, setTenants] = useState([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState(null)
    const router = useRouter()

    useEffect(() => {
        loadTenants()
    }, [])

    async function loadTenants() {
        setLoading(true)
        // Fetch active occupancies with tenant and property details
        const { data, error } = await supabase
            .from('tenant_occupancies')
            .select(`
        id,
        tenant_id,
        start_date,
        contract_end_date,
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, email, phone),
        property:properties(id, title, price)
      `)
            .eq('status', 'active')

        if (error) {
            console.error('Error loading tenants:', error)
            showToast.error('Failed to load tenants')
        } else {
            setTenants(data || [])
        }
        setLoading(false)
    }

    async function sendTestBill(tenantId) {
        setProcessingId(tenantId)
        try {
            const res = await fetch(`/api/test-rent-reminder?tenantId=${tenantId}`)
            const data = await res.json()

            if (res.ok) {
                showToast.success('Bill sent successfully!')
                alert(`Success!\n\n${JSON.stringify(data.results, null, 2)}`)
            } else {
                showToast.error(data.error || 'Failed to send bill')
                alert(`Error: ${data.error}`)
            }
        } catch (err) {
            console.error('Test bill error:', err)
            showToast.error('An error occurred')
        } finally {
            setProcessingId(null)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <Head>
                <title>Test Billing | EaseRent</title>
            </Head>

            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-black text-gray-900">Billing Test Console</h1>
                    <button
                        onClick={() => router.push('/')}
                        className="text-sm font-bold text-gray-600 hover:text-black"
                    >
                        ← Back to Home
                    </button>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="font-bold text-lg text-gray-900">Active Tenants</h2>
                        <p className="text-sm text-gray-500">Select a tenant to send a test "House Rent" bill.</p>
                    </div>

                    {loading ? (
                        <div className="p-12 text-center text-gray-500">Loading tenants...</div>
                    ) : tenants.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">No active tenants found. Assign a tenant first.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4">Tenant</th>
                                        <th className="px-6 py-4">Property</th>
                                        <th className="px-6 py-4">Rent</th>
                                        <th className="px-6 py-4">Contract</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {tenants.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900">{item.tenant?.first_name} {item.tenant?.last_name}</div>
                                                <div className="text-xs text-gray-500">{item.tenant?.email}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-900">{item.property?.title}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-mono text-gray-700">₱{Number(item.property?.price).toLocaleString()}</span>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-500">
                                                {new Date(item.start_date).toLocaleDateString()} - <br />
                                                {new Date(item.contract_end_date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => sendTestBill(item.tenant_id)}
                                                    disabled={processingId === item.tenant_id}
                                                    className="bg-black text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
                                                >
                                                    {processingId === item.tenant_id ? 'Sending...' : 'Send Test Bill'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="mt-8 p-6 bg-blue-50 rounded-2xl border border-blue-100 text-sm text-blue-800">
                    <h3 className="font-bold mb-2">How this works:</h3>
                    <ul className="list-disc pl-5 space-y-1 text-blue-700">
                        <li>This tool triggers the <code>/api/test-rent-reminder</code> endpoint.</li>
                        <li>It creates a <strong>Pending Payment Request</strong> for the current month.</li>
                        <li>It sends an <strong>Email</strong>, <strong>SMS</strong> (if phone verified), and <strong>In-App Notification</strong>.</li>
                        <li>The user sees the bill in their Tenant Dashboard under "Payments".</li>
                        <li><strong>Note:</strong> In production, this is automated to run 3 days before due date. This tool is for testing only.</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
