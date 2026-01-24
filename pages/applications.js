import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { createNotification, NotificationTemplates } from '../lib/notifications'
import { showToast } from 'nextjs-toast-notify'

export default function ApplicationsPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, pending, accepted, rejected
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [applicationToDelete, setApplicationToDelete] = useState(null)
  const [availableTimeSlots, setAvailableTimeSlots] = useState([])
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('')
  const [expandedApplications, setExpandedApplications] = useState({})

  const toggleApplicationDetails = (appId) => {
    setExpandedApplications(prev => ({
      ...prev,
      [appId]: !prev[appId]
    }))
  }

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
      } else {
        router.push('/')
      }
    })
  }, [router])

  useEffect(() => {
    if (session && profile) {
      loadApplications()
    }
  }, [session, profile, filter])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    
    if (data) setProfile(data)
  }

  async function loadApplications() {
    setLoading(true)

    if (profile?.role === 'landlord') {
      // Get applications for landlord's properties
      const { data: myProperties } = await supabase
        .from('properties')
        .select('id')
        .eq('landlord', session.user.id)

      if (myProperties && myProperties.length > 0) {
        const propertyIds = myProperties.map(p => p.id)
        
        let query = supabase
          .from('applications')
          .select(`
            *,
            property:properties(title, address, city, price),
            tenant_profile:profiles(first_name, middle_name, last_name, phone)
          `)
          .in('property_id', propertyIds)
          .order('submitted_at', { ascending: false })

        if (filter !== 'all') {
          query = query.eq('status', filter)
        }

        const { data, error } = await query

        if (error) {
          console.error('Error loading applications:', error)
        } else {
          setApplications(data || [])
        }
      } else {
        setApplications([])
      }
    } else if (profile?.role === 'tenant') {
      // Get tenant's own applications
      let query = supabase
        .from('applications')
        .select(`
          *,
          property:properties(title, address, city, price, landlord),
          landlord_profile:properties(landlord)
        `)
        .eq('tenant', session.user.id)
        .order('submitted_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data: appsData, error } = await query

      if (error) {
        console.error('Error loading applications:', error)
        setApplications([])
      } else {
        setApplications(appsData || [])
      }
    }

    setLoading(false)
  }
  async function updateApplicationStatus(applicationId, newStatus) {
    const { error } = await supabase
      .from('applications')
      .update({ status: newStatus })
      .eq('id', applicationId)

    if (!error) {
      // Send notification to tenant
      const application = applications.find(a => a.id === applicationId)
      if (application && application.tenant) {
        const template = NotificationTemplates.applicationStatusUpdate(
          application.property?.title || 'the property',
          newStatus
        )

        if (newStatus === 'accepted') {
        fetch('/api/notify', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            type: 'assign_user',
            recordId: applicationId,
            actorId: session.user.id
          })
        })
      }

        await createNotification({
          recipient: application.tenant,
          actor: session.user.id,
          type: template.type,
          message: template.message,
          link: '/applications'
        })
      }

      showToast.success(`Application ${newStatus}`, {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      loadApplications()
    } else {
      showToast.error('Failed to update application status', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
    }
  }

  async function deleteApplication(applicationId) {
    setApplicationToDelete(applicationId)
    setShowDeleteModal(true)
  }

  async function confirmDelete() {
    if (!applicationToDelete) return

    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('id', applicationToDelete)

    if (!error) {
      setShowDeleteModal(false)
      setApplicationToDelete(null)
      showToast.success('Application deleted successfully', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      loadApplications()
    } else {
      console.error('Error deleting application:', error)
      showToast.error('Failed to delete application', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
    }
  }

  function cancelDelete() {
    setShowDeleteModal(false)
    setApplicationToDelete(null)
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#FAFAFA] p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
             <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
               {profile.role === 'landlord' ? 'Tenant Applications' : 'My Applications'}
             </h1>
             <p className="text-gray-500 text-sm mt-1">
               {profile.role === 'landlord' 
                ? 'Review and manage tenant applications for your properties.' 
                : 'Track the status of your rental applications.'}
             </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white border-2 border-black mb-8 p-1.5 rounded-xl inline-flex flex-wrap gap-2 w-full md:w-auto">
           {['all', 'pending', 'accepted', 'rejected'].map((tab) => (
             <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg cursor-pointer transition-all uppercase tracking-wide ${
                  filter === tab 
                    ? 'bg-black text-white' 
                    : 'bg-transparent text-gray-500 hover:text-black'
                }`}
             >
                {tab}
             </button>
           ))}
        </div>

        {/* Applications List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-20">
              <p className="text-gray-400 text-sm">Loading applications...</p>
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
               <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
               </div>
               <h3 className="text-gray-900 font-bold mb-1">No applications found</h3>
               <p className="text-gray-500 text-sm">
                  {filter === 'all' 
                    ? 'There are no applications to show right now.' 
                    : `No applications with status "${filter}".`}
               </p>
            </div>
          ) : (
            applications.map(app => {
              const isExpanded = expandedApplications[app.id]
              
              return (
                <div key={app.id} className="bg-white border border-gray-100 p-5 md:p-6 rounded-2xl shadow-sm transition-all">
                  {/* Card Header */}
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-bold text-gray-900">
                          {app.property?.title}
                        </h3>
                        <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full border ${
                          app.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                          app.status === 'accepted' ? 'bg-green-50 text-green-700 border-green-100' :
                          app.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' :
                          'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                          {app.status}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-500 mb-3">
                        {app.property?.address}, {app.property?.city}
                      </p>
                      
                      <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
                        <span className="text-black">₱{Number(app.property?.price).toLocaleString()}/monthly</span>
                        <span>•</span>
                        <span>Applied {new Date(app.submitted_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                         <button
                           onClick={() => toggleApplicationDetails(app.id)}
                           className="px-4 py-2 bg-gray-50 text-black border border-gray-200 text-xs font-bold rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                         >
                           {isExpanded ? 'Hide Details' : 'View Details'}
                         </button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-gray-50 grid grid-cols-1 md:grid-cols-2 gap-6">
                       
                       {/* Left: Message & Info */}
                       <div className="space-y-4">
                          {/* Applicant Info (Landlord View) */}
                          {profile.role === 'landlord' && app.tenant_profile && (
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Inquiries contact</h4>
                              <p className="text-sm font-bold text-gray-900">{app.tenant_profile.first_name} {app.tenant_profile.last_name}</p>
                              <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                                {app.tenant_profile.email && <p>{app.tenant_profile.email}</p>}
                                {app.tenant_profile.phone && <p>{app.tenant_profile.phone}</p>}
                              </div>
                            </div>
                          )}

                          {/* Message */}
                          {app.message && (
                            <div className="bg-white p-4 rounded-xl border border-gray-100">
                               <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                                 {profile.role === 'landlord' ? 'Message' : 'Your Note'}
                               </h4>
                               <p className="text-sm text-gray-600 leading-relaxed">{app.message}</p>
                            </div>
                          )}
                       </div>

                       {/* Right: Actions & Status */}
                       <div className="space-y-4">
                          {/* Action Buttons */}
                          <div className="flex flex-col gap-2">
                             {/* Landlord Actions */}
                             {profile.role === 'landlord' && app.status === 'pending' && (
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    onClick={() => updateApplicationStatus(app.id, 'accepted')}
                                    className="px-4 py-3 bg-green-600 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-green-700 transition-colors"
                                  >
                                    Accept Application
                                  </button>
                                  <button
                                    onClick={() => updateApplicationStatus(app.id, 'rejected')}
                                    className="px-4 py-3 bg-red-600 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-red-700 transition-colors"
                                  >
                                    Reject Application
                                  </button>
                                </div>
                             )}

                             {/* Delete Button */}
                                <button
                                  onClick={() => deleteApplication(app.id)}
                                  className="w-full px-4 py-3 text-red-600 bg-red-50 hover:bg-red-100 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                                >
                                  Delete Application
                                </button>
                          </div>
                       </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6 text-center">
             <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
             </div>
             <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Application?</h3>
             <p className="text-sm text-gray-500 mb-6">Are you sure you want to delete this application? This action cannot be undone.</p>
             
             <div className="flex gap-3">
               <button
                 onClick={cancelDelete}
                 className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl cursor-pointer hover:bg-gray-50"
               >
                 Cancel
               </button>
               <button
                 onClick={confirmDelete}
                 className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl cursor-pointer hover:bg-red-700 shadow-lg shadow-red-100"
               >
                 Delete
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  )
}