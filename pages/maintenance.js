import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { createNotification, NotificationTemplates } from '../lib/notifications'
import { showToast } from 'nextjs-toast-notify'

export default function MaintenancePage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [requests, setRequests] = useState([])
  const [properties, setProperties] = useState([])
  const [occupiedProperty, setOccupiedProperty] = useState(null) 
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [responseText, setResponseText] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [requestToCancel, setRequestToCancel] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchId, setSearchId] = useState('')
  const [proofFiles, setProofFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [requestToSchedule, setRequestToSchedule] = useState(null)
  const [scheduleDate, setScheduleDate] = useState('')
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
      fetch('/api/notify', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    type: 'maintenance_status',
    recordId: requestId,
    actorId: session.user.id
  })
})
      showToast.success(`Status updated to ${newStatus.replace('_', ' ')}`, {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
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
      showToast.error("Failed to update status", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

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
    showToast.success("Response sent to tenant!", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

  }

  // --- File Upload Logic (Multiple Files) ---
  async function uploadProofFiles() {
    if (proofFiles.length === 0) return []

    const uploadPromises = proofFiles.map(async (file) => {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `${session.user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('maintenance-uploads')
        .upload(filePath, file)

      if (uploadError) {
        throw uploadError
      }

      const { data } = supabase.storage
        .from('maintenance-uploads')
        .getPublicUrl(filePath)

      return data.publicUrl
    })

    return Promise.all(uploadPromises)
  }

  function handleFileSelect(e) {
    const newFiles = Array.from(e.target.files)
    const maxFiles = 10
    const maxSize = 50 * 1024 * 1024 // 50MB per file

    // Filter valid files
    const validFiles = newFiles.filter(file => {
      if (file.size > maxSize) {
        showToast.warning(`${file.name} exceeds 50MB limit`, {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

        return false
      }
      return true
    })

    // Check total count
    if (proofFiles.length + validFiles.length > maxFiles) {
      showToast.error(`Maximum ${maxFiles} files allowed`, {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      return
    }

    setProofFiles(prev => [...prev, ...validFiles])
  }

  function removeFile(index) {
    setProofFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    
    // Validation: Require at least one proof file
    if (proofFiles.length === 0) {
        showToast.error("You must attach at least one picture or video as proof.", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

        return
    }

    setUploading(true)
    const toastId = showToast.info("Uploading files", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

    try {
        const attachmentUrls = await uploadProofFiles()

        const { data: insertData, error } = await supabase.from('maintenance_requests').insert({
          ...formData,
          tenant: session.user.id,
          status: 'pending',
          attachment_urls: attachmentUrls // Save array of file URLs
        }).select('*, properties(title, landlord)')
    
        if (error) throw error
        if (insertData && insertData[0]) {
          fetch('/api/notify', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    type: 'maintenance_new',
    recordId: insertData[0].id,
    actorId: session.user.id
  })
})
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
          setProofFiles([]) // Reset files
          setShowModal(false)
          loadRequests()
          showToast.success("Request submitted successfully! "+ { id: toastId }, {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

        }
    } catch (error) {
        console.error(error)
        showToast.error('Error submitting request: ' + error.message, { id: toastId }, {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
    } finally {
        setUploading(false)
    }
  }

  if (!session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  // Filter requests based on status and search
  const filteredRequests = requests.filter(req => {
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter
    const matchesSearch = searchId === '' || req.id.toLowerCase().includes(searchId.toLowerCase())
    return matchesStatus && matchesSearch
  })

  function promptCancel(request) {
    setRequestToCancel(request)
    setShowCancelModal(true)
  }

  async function confirmCancel() {
    if (!requestToCancel) return

    // Reuse your existing status update function
    await updateRequestStatus(requestToCancel.id, 'cancelled')

    setShowCancelModal(false)
    setRequestToCancel(null)
  }
  function openStartWorkModal(request) {
    setRequestToSchedule(request)
    setScheduleDate('') // Reset date
    setShowScheduleModal(true)
  }

  async function confirmStartWork() {
    if (!requestToSchedule || !scheduleDate) return

    const { error } = await supabase
      .from('maintenance_requests')
      .update({ 
        status: 'in_progress',
        scheduled_date: new Date(scheduleDate).toISOString()
      })
      .eq('id', requestToSchedule.id)

    if (!error) {
      showToast.success("Work started & date set!", { duration: 4000, transition: "bounceIn" });
      
      // Notify Tenant
      const formattedDate = new Date(scheduleDate).toLocaleString();
      await createNotification({
        recipient: requestToSchedule.tenant,
        actor: session.user.id,
        type: 'maintenance',
        message: `Work on "${requestToSchedule.title}" is scheduled to start on ${formattedDate}.`,
        link: '/maintenance'
      })

      loadRequests()
      setShowScheduleModal(false)
      setRequestToSchedule(null)
    } else {
      showToast.error("Failed to update request");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-sans text-black">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
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
              onClick={() => setShowModal(true)}
              className="w-full sm:w-auto px-6 py-3 bg-black text-white hover:bg-gray-800 rounded-xl font-bold text-sm shadow-lg cursor-pointer"
            >
              + New Request
            </button>
          )}
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-col sm:flex-row gap-3">
          {/* Search by ID */}
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by Request ID..."
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
            />
          </div>
          
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* New Request Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
                <h2 className="text-lg font-bold">New Maintenance Request</h2>
                <button 
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6">
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

                    {/* File Upload (Required - Multiple Files) */}
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">
                            Proof (Photos or Videos) <span className="text-red-500">*At least 1 required</span>
                            <span className="text-gray-400 ml-2">({proofFiles.length}/10 files)</span>
                        </label>
                        <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${proofFiles.length > 0 ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-black'}`}>
                            <input 
                                type="file" 
                                accept="image/*,video/*"
                                id="proof-upload"
                                className="hidden"
                                multiple
                                onChange={handleFileSelect}
                            />
                            <label htmlFor="proof-upload" className="cursor-pointer w-full h-full block">
                                <div className="flex flex-col items-center gap-1 text-gray-500">
                                    <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    <span className="text-sm font-bold">Click to add photos or videos</span>
                                    <span className="text-xs">Max 10 files, 50MB each</span>
                                </div>
                            </label>
                        </div>
                        
                        {/* File Previews */}
                        {proofFiles.length > 0 && (
                            <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                {proofFiles.map((file, index) => (
                                    <div key={index} className="relative group">
                                        <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                                            {file.type.startsWith('video/') ? (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </div>
                                            ) : (
                                                <img 
                                                    src={URL.createObjectURL(file)} 
                                                    alt={`Preview ${index + 1}`}
                                                    className="w-full h-full object-cover"
                                                />
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeFile(index)}
                                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button 
                            type="button"
                            onClick={() => setShowModal(false)}
                            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={uploading}
                            className="px-8 py-3 bg-black text-white rounded-xl font-bold text-sm hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg cursor-pointer"
                        >
                            {uploading ? 'Submitting...' : 'Submit Request'}
                        </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Requests List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-20"><div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-black"></div></div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
              <p className="text-gray-900 font-bold mb-1">
                {requests.length === 0 
                  ? (profile?.role === 'landlord' ? 'All caught up!' : 'No requests yet.')
                  : 'No matching requests found.'}
              </p>
              <p className="text-sm text-gray-500">
                {requests.length === 0 
                  ? (profile?.role === 'landlord' ? 'No open maintenance requests.' : 'Click "+ New Request" to submit one.')
                  : 'Try adjusting your search or filter.'}
              </p>
            </div>
          ) : (
            filteredRequests.map(req => (
              <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                {/* Header Strip with ID and Status */}
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400">ID:</span>
                          <span className="text-xs font-mono font-bold text-black bg-gray-200 px-2 py-1 rounded">{req.id.substring(0, 8).toUpperCase()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400">Status:</span>
                          <span className={`px-3 py-1 text-[10px] uppercase font-bold rounded-full tracking-wider ${
                              statusColors[req.status] || 'bg-gray-100 text-gray-800'
                          }`}>
                              {req.status?.replace('_', ' ')}
                          </span>
                        </div>
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
                      {req.scheduled_date && (
  <div className="mt-2 mb-3 inline-flex items-center gap-2 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100">
    <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    <span className="text-xs font-bold text-orange-800">
      Work starts: {new Date(req.scheduled_date).toLocaleString()}
    </span>
  </div>
)}
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-sm text-gray-700 leading-relaxed mb-4">
                        {req.description}
                      </div>
                     {profile?.role === 'tenant' && !['completed', 'closed', 'cancelled'].includes(req.status) && !req.scheduled_date && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                      <button 
                        onClick={() => promptCancel(req)}
                        className="px-4 py-2 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        Cancel Request
                      </button>
                    </div>
                  )}
                      

                      {/* Landlord Actions */}
                      {profile?.role === 'landlord' && (
                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                            {req.status !== 'closed' && (
                                <>
                                    {req.status === 'pending' && (
                                        <>
                                            <button onClick={() => updateRequestStatus(req.id, 'scheduled')} className="px-4 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100">Mark Scheduled</button>
<button 
  onClick={() => openStartWorkModal(req)} 
  className="px-4 py-2 bg-orange-50 text-orange-700 text-xs font-bold rounded-lg hover:bg-orange-100"
>
  Start Working
</button>                                        </>
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
                                    {!['completed', 'closed', 'cancelled'].includes(req.status) && (
  <button 
    onClick={() => promptCancel(req)} 
    className="px-4 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-lg hover:bg-red-100"
  >
    Cancel/Reject
  </button>
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

                    {/* Proof Media Preview (Multiple) */}
                    {req.attachment_urls && req.attachment_urls.length > 0 && (
                        <div className="w-full md:w-72 flex-shrink-0">
                            <p className="text-xs font-bold uppercase text-gray-400 mb-2">Proof of Issue ({req.attachment_urls.length} file{req.attachment_urls.length > 1 ? 's' : ''})</p>
                            <div className="grid grid-cols-2 gap-2">
                                {req.attachment_urls.map((url, index) => (
                                    <a key={index} href={url} target="_blank" rel="noreferrer" className="block group relative overflow-hidden rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all">
                                        {url.match(/\.(mp4|webm|ogg|mov)$/i) ? (
                                            <div className="w-full h-20 bg-gray-900 flex items-center justify-center">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                        ) : (
                                            <img src={url} alt={`Proof ${index + 1}`} className="w-full h-20 object-cover transform group-hover:scale-105 transition-transform" />
                                        )}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none"></div>
                                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[8px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                                            {index + 1}
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Backward compatibility for old single attachment_url */}
                    {req.attachment_url && !req.attachment_urls && (
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

                  {/* --- CANCEL WARNING MODAL --- */}
      {showCancelModal && requestToCancel && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-200">
            
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Maintenance Request?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Are you sure you want to cancel the request: <br/>
              <span className="font-semibold text-gray-900">"{requestToCancel.title}"</span>?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
              >
                No, Keep it
              </button>
              <button
                onClick={confirmCancel}
                className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-100 cursor-pointer"
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- START WORK DATE MODAL --- */}
      {showScheduleModal && requestToSchedule && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Set Start Date</h3>
            <p className="text-sm text-gray-500 mb-4">
              When will the maintenance work begin for <span className="font-semibold">"{requestToSchedule.title}"</span>?
            </p>

            <div className="mb-6">
              <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Select Date & Time</label>
              <input 
                type="datetime-local"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmStartWork}
                disabled={!scheduleDate}
                className="flex-1 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm & Notify
              </button>
            </div>
          </div>
        </div>
      )}

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