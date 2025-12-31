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
  const [occupiedProperty, setOccupiedProperty] = useState(null) 
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [responseText, setResponseText] = useState('')
  
  // File Upload State
  const [proofFile, setProofFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  const [formData, setFormData] = useState({
    property_id: '',
    title: '',
    description: '',
    priority: 'normal'
  })

  // Status mapping for badges
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    scheduled: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-orange-100 text-orange-800',
    completed: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800'
  }

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
      .select('*, properties(title, landlord), tenant_profile:profiles!maintenance_requests_tenant_fkey(first_name, middle_name, last_name)')
      .order('created_at', { ascending: false })

    if (profile?.role === 'tenant') {
      query = query.eq('tenant', session.user.id)
    } else if (profile?.role === 'landlord') {
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
      const { data: occupancy } = await supabase
        .from('tenant_occupancies')
        .select('property_id, property:properties(id, title)')
        .eq('tenant_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (occupancy && occupancy.property) {
        setOccupiedProperty(occupancy.property)
        setProperties([occupancy.property])
        setFormData(prev => ({ ...prev, property_id: occupancy.property.id }))
      } else {
        const { data: acceptedApps } = await supabase
          .from('applications')
          .select('property_id, property:properties(id, title)')
          .eq('tenant', session.user.id)
          .eq('status', 'accepted')
        
        const approvedProperties = acceptedApps?.map(app => app.property).filter(Boolean) || []
        setProperties(approvedProperties)
        setOccupiedProperty(null)
      }
    } else if (profile?.role === 'landlord') {
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
        resolved_at: newStatus === 'completed' ? new Date().toISOString() : null
      })
      .eq('id', requestId)

    if (!error) {
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`)
      loadRequests()
      
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
    } else {
      toast.error('Failed to update status')
    }
  }

  async function addResponse(requestId) {
    if (!responseText.trim()) return

    await updateRequestStatus(requestId, 'in_progress')
    
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

  // --- File Upload Logic ---
  async function uploadProofFile() {
    if (!proofFile) return null

    const fileExt = proofFile.name.split('.').pop()
    const fileName = `${Math.random()}.${fileExt}`
    const filePath = `${session.user.id}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('maintenance-uploads')
      .upload(filePath, proofFile)

    if (uploadError) {
      throw uploadError
    }

    const { data } = supabase.storage
      .from('maintenance-uploads')
      .getPublicUrl(filePath)

    return data.publicUrl
  }

  async function handleSubmit(e) {
    e.preventDefault()
    
    // Validation: Require Proof
    if (!proofFile) {
        toast.error('You must attach a picture or video as proof.')
        return
    }

    setUploading(true)
    const toastId = toast.loading('Uploading proof...')

    try {
        const attachmentUrl = await uploadProofFile()

        const { data: insertData, error } = await supabase.from('maintenance_requests').insert({
          ...formData,
          tenant: session.user.id,
          status: 'pending', // Default status is now Pending
          attachment_url: attachmentUrl // Save the file URL
        }).select('*, properties(title, landlord)')
    
        if (error) throw error
    
        if (insertData && insertData[0]) {
          const property = insertData[0].properties
          if (property && property.landlord) {
            const template = NotificationTemplates.newMaintenanceRequest(
              property.title,
              profile?.first_name ? `${profile.first_name} ${profile.last_name}` : 'A tenant'
            )
            await createNotification({
              recipient: property.landlord,
              actor: session.user.id,
              type: template.type,
              message: template.message
            })
          }
    
          setFormData({ property_id: '', title: '', description: '', priority: 'normal' })
          setProofFile(null) // Reset file
          setShowForm(false)
          loadRequests()
          toast.success('Request submitted successfully!', { id: toastId })
        }
    } catch (error) {
        console.error(error)
        toast.error('Error submitting request: ' + error.message, { id: toastId })
    } finally {
        setUploading(false)
    }
  }

  if (!session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-sans text-black">
      <Toaster position="top-center" />
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase">
              {profile?.role === 'landlord' ? 'Maintenance Board' : 'My Maintenance'}
            </h1>
            <p className="text-sm text-gray-500 font-medium mt-1">
              {profile?.role === 'landlord' 
                ? 'Manage and track requests from your properties.' 
                : 'Report issues and track resolution status.'}
            </p>
          </div>
          {profile?.role === 'tenant' && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="w-full sm:w-auto px-6 py-3 bg-black text-white hover:bg-gray-800 rounded-xl font-bold text-sm shadow-lg cursor-pointer"
            >
              {showForm ? 'Cancel Request' : '+ New Request'}
            </button>
          )}
        </div>

        {/* Request Form */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 mb-8 animate-in slide-in-from-top-4">
            <h2 className="text-lg font-bold mb-6 border-b border-gray-100 pb-2">Submit Maintenance Request</h2>
            {properties.length === 0 ? (
              <div className="p-8 text-center bg-yellow-50 rounded-xl border border-yellow-100">
                <svg className="mx-auto h-12 w-12 text-yellow-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-bold text-yellow-800 mb-2">No Active Lease</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  You can only submit requests for properties you are currently renting.
                </p>
                <button onClick={() => router.push('/applications')} className="px-6 py-2 bg-black text-white rounded-lg font-bold text-sm cursor-pointer">View Applications</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Property Selector */}
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Property</label>
                  <div className="w-full border bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="bg-green-100 p-1.5 rounded-full">
                        <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    </div>
                    <span className="font-bold text-sm">{occupiedProperty?.title || properties[0]?.title}</span>
                    <span className="ml-auto text-[10px] uppercase font-bold text-green-700 bg-green-100 px-2 py-1 rounded">Current Home</span>
                  </div>
                </div>

                {/* Title & Priority */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Issue Title</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Leaking faucet in kitchen"
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Priority</label>
                      <select
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black outline-none bg-white cursor-pointer"
                        value={formData.priority}
                        onChange={e => setFormData({ ...formData, priority: e.target.value })}
                      >
                        <option value="low">Low (Cosmetic)</option>
                        <option value="normal">Normal (Functional)</option>
                        <option value="high">High (Urgent)</option>
                      </select>
                    </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Description</label>
                  <textarea
                    rows="4"
                    required
                    placeholder="Describe the issue in detail..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black focus:border-transparent outline-none resize-none"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                {/* File Upload (Required) */}
                <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">
                        Proof (Photo or Video) <span className="text-red-500">*Required</span>
                    </label>
                    <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${proofFile ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-black'}`}>
                        <input 
                            type="file" 
                            accept="image/*,video/*"
                            id="proof-upload"
                            className="hidden"
                            onChange={(e) => setProofFile(e.target.files[0])}
                        />
                        <label htmlFor="proof-upload" className="cursor-pointer w-full h-full block">
                            {proofFile ? (
                                <div className="flex items-center justify-center gap-2 text-green-700 font-bold">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    {proofFile.name}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-1 text-gray-500">
                                    <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    <span className="text-sm font-bold">Click to upload photo or video</span>
                                    <span className="text-xs">Max 50MB</span>
                                </div>
                            )}
                        </label>
                    </div>
                </div>

                <div className="flex justify-end pt-2">
                    <button 
                        type="submit" 
                        disabled={uploading}
                        className="px-8 py-3 bg-black text-white rounded-xl font-bold text-sm hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                    >
                        {uploading ? 'Uploading Proof & Submitting...' : 'Submit Request'}
                    </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Requests List */}
        <div className="space-y-6">
          {loading ? (
            <div className="text-center py-20"><div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-black"></div></div>
          ) : requests.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
              <p className="text-gray-900 font-bold mb-1">
                {profile?.role === 'landlord' ? 'All caught up!' : 'No requests yet.'}
              </p>
              <p className="text-sm text-gray-500">
                {profile?.role === 'landlord' ? 'No open maintenance requests.' : 'Submit a request above if something needs fixing.'}
              </p>
            </div>
          ) : (
            requests.map(req => (
              <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                {/* Header Strip */}
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 text-[10px] uppercase font-bold rounded-full tracking-wider ${
                            statusColors[req.status] || 'bg-gray-100 text-gray-800'
                        }`}>
                            {req.status?.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">#{req.id.substring(0, 8)}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-500">
                        {new Date(req.created_at).toLocaleDateString()} at {new Date(req.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                </div>

                <div className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Main Content */}
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-1">{req.title}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mb-4">
                         <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                            {req.properties?.title}
                         </span>
                         {profile?.role === 'landlord' && req.tenant_profile && (
                            <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                {req.tenant_profile.first_name} {req.tenant_profile.last_name}
                            </span>
                         )}
                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            req.priority === 'high' ? 'bg-red-50 text-red-700 border-red-100' :
                            req.priority === 'low' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                            'bg-gray-50 text-gray-700 border-gray-200'
                         }`}>
                            {req.priority} Priority
                         </span>
                      </div>
                      
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-sm text-gray-700 leading-relaxed mb-4">
                        {req.description}
                      </div>

                      {/* Landlord Actions */}
                      {profile?.role === 'landlord' && (
                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                            {req.status !== 'closed' && (
                                <>
                                    {req.status === 'pending' && (
                                        <>
                                            <button onClick={() => updateRequestStatus(req.id, 'scheduled')} className="px-4 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100">Mark Scheduled</button>
                                            <button onClick={() => updateRequestStatus(req.id, 'in_progress')} className="px-4 py-2 bg-orange-50 text-orange-700 text-xs font-bold rounded-lg hover:bg-orange-100">Start Working</button>
                                        </>
                                    )}
                                    {req.status === 'scheduled' && (
                                        <button onClick={() => updateRequestStatus(req.id, 'in_progress')} className="px-4 py-2 bg-orange-50 text-orange-700 text-xs font-bold rounded-lg hover:bg-orange-100">Start Working</button>
                                    )}
                                    {req.status === 'in_progress' && (
                                        <button onClick={() => updateRequestStatus(req.id, 'completed')} className="px-4 py-2 bg-green-50 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100">Mark Completed</button>
                                    )}
                                    {(req.status === 'completed' || req.status === 'resolved') && (
                                        <button onClick={() => updateRequestStatus(req.id, 'closed')} className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200">Archive/Close</button>
                                    )}
                                    
                                    <button 
                                        onClick={() => setSelectedRequest(selectedRequest === req.id ? null : req.id)}
                                        className="ml-auto px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50"
                                    >
                                        {selectedRequest === req.id ? 'Cancel Reply' : 'Reply'}
                                    </button>
                                </>
                            )}
                        </div>
                      )}
                    </div>

                    {/* Proof Media Preview */}
                    {req.attachment_url && (
                        <div className="w-full md:w-64 flex-shrink-0">
                            <p className="text-xs font-bold uppercase text-gray-400 mb-2">Proof of Issue</p>
                            <a href={req.attachment_url} target="_blank" rel="noreferrer" className="block group relative overflow-hidden rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                                {req.attachment_url.match(/\.(mp4|webm|ogg)$/i) ? (
                                    <video src={req.attachment_url} className="w-full h-40 object-cover bg-black" controls />
                                ) : (
                                    <img src={req.attachment_url} alt="Proof" className="w-full h-40 object-cover transform group-hover:scale-105 transition-transform" />
                                )}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none"></div>
                                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                    Click to Open
                                </div>
                            </a>
                        </div>
                    )}
                  </div>

                  {/* Reply Section */}
                  {profile?.role === 'landlord' && selectedRequest === req.id && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 animate-in fade-in slide-in-from-top-2">
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Send response to tenant</label>
                      <div className="flex gap-2">
                        <input
                            type="text"
                            value={responseText}
                            onChange={(e) => setResponseText(e.target.value)}
                            placeholder="e.g. The plumber will arrive tomorrow at 2 PM..."
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black"
                        />
                        <button
                          onClick={() => addResponse(req.id)}
                          className="px-4 py-2 bg-black text-white rounded-lg text-xs font-bold"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}