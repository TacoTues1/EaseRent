import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { createNotification, NotificationTemplates } from '../lib/notifications'
import toast, { Toaster } from 'react-hot-toast'

export default function MaintenancePage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [requests, setRequests] = useState([])
  const [properties, setProperties] = useState([])
  const [occupiedProperty, setOccupiedProperty] = useState(null) // Tenant's assigned property
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [responseText, setResponseText] = useState('')
  
  const [formData, setFormData] = useState({
    property_id: '',
    title: '',
    description: '',
    priority: 'normal'
  })

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
      } else {
        router.push('/auth')
      }
    })
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    
    if (data) setProfile(data)
  }

  useEffect(() => {
    if (session && profile) {
      loadRequests()
      loadProperties()
    }
  }, [session, profile])

  async function loadRequests() {
    let query = supabase
      .from('maintenance_requests')
      .select('*, properties(title, landlord), tenant_profile:profiles!maintenance_requests_tenant_fkey(full_name)')
      .order('created_at', { ascending: false })

    // If tenant, show only their requests
    // If landlord, show requests for their properties
    if (profile?.role === 'tenant') {
      query = query.eq('tenant', session.user.id)
    } else if (profile?.role === 'landlord') {
      // Get landlord's properties first
      const { data: myProps } = await supabase
        .from('properties')
        .select('id')
        .eq('landlord', session.user.id)
      
      if (myProps && myProps.length > 0) {
        const propIds = myProps.map(p => p.id)
        query = query.in('property_id', propIds)
      } else {
        setRequests([])
        setLoading(false)
        return
      }
    }
    
    const { data } = await query
    setRequests(data || [])
    setLoading(false)
  }

  async function loadProperties() {
    if (profile?.role === 'tenant') {
      // First check for actively occupied property (assigned by landlord)
      const { data: occupancy } = await supabase
        .from('tenant_occupancies')
        .select('property_id, property:properties(id, title)')
        .eq('tenant_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (occupancy && occupancy.property) {
        // Tenant has an assigned/occupied property - use only this
        setOccupiedProperty(occupancy.property)
        setProperties([occupancy.property])
        // Auto-select this property in the form
        setFormData(prev => ({ ...prev, property_id: occupancy.property.id }))
      } else {
        // Fallback: Load properties where tenant has an ACCEPTED application
        const { data: acceptedApps } = await supabase
          .from('applications')
          .select('property_id, property:properties(id, title)')
          .eq('tenant', session.user.id)
          .eq('status', 'accepted')
        
        // Extract property info from accepted applications
        const approvedProperties = acceptedApps?.map(app => app.property).filter(Boolean) || []
        setProperties(approvedProperties)
        setOccupiedProperty(null)
      }
    } else if (profile?.role === 'landlord') {
      // Load landlord's own properties
      const { data } = await supabase
        .from('properties')
        .select('id, title')
        .eq('landlord', session.user.id)
      
      setProperties(data || [])
    }
  }

  async function updateRequestStatus(requestId, newStatus) {
    const { error } = await supabase
      .from('maintenance_requests')
      .update({ 
        status: newStatus,
        resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null
      })
      .eq('id', requestId)

    if (!error) {
      loadRequests()
      
      // Send notification to tenant
      const request = requests.find(r => r.id === requestId)
      if (request && request.tenant) {
        const template = NotificationTemplates.maintenanceStatusUpdate(
          request.title,
          newStatus
        )
        await createNotification({
          recipient: request.tenant,
          actor: session.user.id,
          type: template.type,
          message: template.message,
          link: '/maintenance'
        })
      }
    }
  }

  async function addResponse(requestId) {
    if (!responseText.trim()) return

    // For now, we'll add this as a comment/note in a future update
    // Update the request status to in_progress when landlord responds
    await updateRequestStatus(requestId, 'in_progress')
    
    // Send notification to tenant with the response
    const request = requests.find(r => r.id === requestId)
    if (request && request.tenant) {
      await createNotification({
        recipient: request.tenant,
        actor: session.user.id,
        type: 'maintenance',
        message: `Landlord responded to "${request.title}": ${responseText}`,
        link: '/maintenance'
      })
    }

    setResponseText('')
    setSelectedRequest(null)
    toast.success('Response sent to tenant!')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const { data: insertData, error } = await supabase.from('maintenance_requests').insert({
      ...formData,
      tenant: session.user.id,
      status: 'open'
    }).select('*, properties(title, landlord)')

    if (!error && insertData && insertData[0]) {
      // Send notification to landlord
      const property = insertData[0].properties
      if (property && property.landlord) {
        const template = NotificationTemplates.newMaintenanceRequest(
          property.title,
          profile?.full_name || 'A tenant'
        )
        await createNotification({
          recipient: property.landlord,
          actor: session.user.id,
          type: template.type,
          message: template.message
        })
      }

      setFormData({ property_id: '', title: '', description: '', priority: 'normal' })
      setShowForm(false)
      loadRequests()
    }
  }

  if (!session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen bg-white p-3 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">
              {profile?.role === 'landlord' ? 'Maintenance Requests' : 'My Maintenance Requests'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600">
              {profile?.role === 'landlord' 
                ? 'Manage maintenance requests from your tenants' 
                : 'Submit and track your maintenance requests'}
            </p>
          </div>
          {profile?.role === 'tenant' && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="w-full sm:w-auto px-4 py-2 bg-black text-white hover:bg-gray-800 rounded"
            >
              {showForm ? 'Cancel' : '+ New Request'}
            </button>
          )}
        </div>

        {showForm && (
          <div className="bg-white border-2 border-black p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Submit Maintenance Request</h2>
            {properties.length === 0 ? (
              <div className="p-6 text-center bg-white border-2 border-black">
                <svg className="mx-auto h-12 w-12 text-yellow-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-black mb-2">No Approved Applications</h3>
                <p className="text-sm text-yellow-700 mb-3">
                  You can only submit maintenance requests for properties where your application has been accepted.
                </p>
                <button
                  onClick={() => router.push('/applications')}
                  className="px-4 py-2 bg-black text-white hover:bg-black"
                >
                  View My Applications
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Property</label>
                  {/* Show occupied property as fixed (auto-selected) */}
                  <div className="w-full border-2 border-green-500 bg-green-50 px-3 py-2 flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <span className="font-medium">{occupiedProperty?.title || properties[0]?.title}</span>
                    <span className="sm:ml-auto text-xs text-green-600 bg-green-100 px-2 py-1 rounded">Your Current Home</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <input
                    type="text"
                    required
                    className="w-full border-2 px-3 py-2"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    rows="4"
                    required
                    className="w-full border-2 px-3 py-2"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Priority</label>
                  <select
                    className="w-full border-2 px-3 py-2"
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <button type="submit" className="px-6 py-2 bg-black text-white">
                  Submit Request
                </button>
              </form>
            )}
          </div>
        )}

        <div className="bg-white -black">
          {loading ? (
            <p className="p-6 text-black">Loading...</p>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-black mb-2">
                {profile?.role === 'landlord' 
                  ? 'No maintenance requests yet' 
                  : 'No maintenance requests yet.'}
              </p>
              <p className="text-sm text-black">
                {profile?.role === 'landlord' 
                  ? 'Requests from your tenants will appear here' 
                  : 'Submit a request if you need maintenance'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {requests.map(req => (
                <div key={req.id} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold">{req.title}</h3>
                      <p className="text-sm text-black">{req.properties?.title}</p>
                      {profile?.role === 'landlord' && req.tenant_profile && (
                        <p className="text-sm text-black">
                          Tenant: {req.tenant_profile.full_name}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 text-xs font-semibold ${
                        req.status === 'open' ? 'bg-white text-yellow-700' :
                        req.status === 'in_progress' ? 'bg-white text-black' :
                        req.status === 'resolved' ? 'bg-black text-white' :
                        'bg-white text-black'
                      }`}>
                        {req.status.replace('_', ' ')}
                      </span>
                      <span className={`px-2 py-1 text-xs font-semibold ${
                        req.priority === 'high' ? 'bg-white text-black' :
                        req.priority === 'low' ? 'bg-white text-black' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {req.priority}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-black mb-3">{req.description}</p>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-black">
                      Created: {new Date(req.created_at).toLocaleDateString()}
                      {req.resolved_at && ` • Resolved: ${new Date(req.resolved_at).toLocaleDateString()}`}
                    </p>
                    
                    {profile?.role === 'landlord' && (
                      <div className="flex gap-2">
                        {req.status !== 'resolved' && (
                          <>
                            {req.status === 'open' && (
                              <button
                                onClick={() => updateRequestStatus(req.id, 'in_progress')}
                                className="px-3 py-1 text-xs bg-black text-white hover:bg-black"
                              >
                                Start Working
                              </button>
                            )}
                            {req.status === 'in_progress' && (
                              <button
                                onClick={() => updateRequestStatus(req.id, 'resolved')}
                                className="px-3 py-1 text-xs bg-black text-white"
                              >
                                Mark Resolved
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedRequest(req.id)}
                              className="px-3 py-1 text-xs bg-black text-white hover:bg-black"
                            >
                              Send Response
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Response Form for Landlord */}
                  {profile?.role === 'landlord' && selectedRequest === req.id && (
                    <div className="mt-4 p-4 bg-white border-2 border-black">
                      <label className="block text-sm font-medium mb-2">
                        Send response to tenant:
                      </label>
                      <textarea
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        placeholder="Type your response..."
                        className="w-full border-2 px-3 py-2 mb-2"
                        rows="3"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => addResponse(req.id)}
                          className="px-4 py-2 bg-black text-white hover:bg-black text-sm"
                        >
                          Send Response
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRequest(null)
                            setResponseText('')
                          }}
                          className="px-4 py-2 bg-white text-black text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
