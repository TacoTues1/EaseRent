import { useState } from 'react'
import Navbar from '../components/Navbar'
import { toast, Toaster } from 'react-hot-toast'

export default function TestNotifications() {
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [loading, setLoading] = useState(false)
    const [logs, setLogs] = useState([])

    const runTest = async (type) => {
        if (!email && !phone) {
            toast.error('Please enter Email or Phone')
            return
        }
        setLoading(true)
        setLogs(prev => [`Starting ${type} test...`, ...prev])

        try {
            const res = await fetch('/api/test-notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, phone, type })
            })
            const data = await res.json()

            if (data.results) {
                data.results.forEach(r => {
                    setLogs(prev => [`${r.success ? '✅' : '❌'} ${r.name}: ${r.success ? 'Sent' : r.error}`, ...prev])
                })
            }
            toast.success(`Test ${type} completed`)
        } catch (err) {
            console.error(err)
            setLogs(prev => [`❌ Error: ${err.message}`, ...prev])
            toast.error('Test failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <Navbar />
            <Toaster position="top-right" />
            <div className="max-w-4xl mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold mb-8">Test Notifications</h1>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                    <h2 className="text-xl font-semibold mb-4">Configuration</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Target Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                placeholder="test@example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Target Phone (E.164)</label>
                            <input
                                type="text"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                placeholder="+639..."
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4">
                        <button
                            onClick={() => runTest('email')}
                            disabled={loading || !email}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-sm hover:shadow-md cursor-pointer"
                        >
                            Test All Emails
                        </button>
                        <button
                            onClick={() => runTest('sms')}
                            disabled={loading || !phone}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-sm hover:shadow-md cursor-pointer"
                        >
                            Test All SMS
                        </button>
                        <button
                            onClick={() => runTest('all')}
                            disabled={loading || (!email && !phone)}
                            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-sm hover:shadow-md cursor-pointer"
                        >
                            Test Everything
                        </button>
                        <button
                            onClick={() => setLogs([])}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 ml-auto transition-all cursor-pointer"
                        >
                            Clear Logs
                        </button>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-xl font-semibold mb-4">Execution Log</h2>
                    <div className="bg-gray-900 text-green-400 p-4 rounded-lg h-96 overflow-y-auto font-mono text-sm leading-relaxed scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
                        {logs.length === 0 ? (
                            <span className="text-gray-500">// Waiting to start...</span>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} className="border-b border-gray-800 last:border-0 pb-1 mb-1 break-words">{log}</div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
