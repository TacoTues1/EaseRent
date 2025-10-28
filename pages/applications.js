import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { createNotification, NotificationTemplates } from '../lib/notifications'

export default function ApplicationsPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, pending, accepted, rejected

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
      .single()
    
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
            tenant_profile:profiles(full_name, phone)
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

      const { data, error } = await query

      if (error) {
        console.error('Error loading applications:', error)
      } else {
        setApplications(data || [])
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
        await createNotification({
          recipient: application.tenant,
          actor: session.user.id,
          type: template.type,
          message: template.message,
          link: '/applications'
        })
      }

      loadApplications()
    } else {
      alert('Failed to update application status')
    }
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">
            {profile.role === 'landlord' ? 'Tenant Applications' : 'My Applications'}
          </h1>
          <p className="text-sm text-gray-600">
            {profile.role === 'landlord' 
              ? 'Review and manage tenant applications for your properties' 
              : 'Track the status of your rental applications'}
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-lg shadow mb-6 p-2 flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition ${
              filter === 'all' 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            All Applications
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition ${
              filter === 'pending' 
                ? 'bg-yellow-500 text-white' 
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('accepted')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition ${
              filter === 'accepted' 
                ? 'bg-green-600 text-white' 
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Accepted
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition ${
              filter === 'rejected' 
                ? 'bg-red-600 text-white' 
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Rejected
          </button>
        </div>

        {/* Applications List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading applications...</p>
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-600 mb-2">
                {filter === 'all' 
                  ? 'No applications yet' 
                  : `No ${filter} applications`}
              </p>
              <p className="text-sm text-gray-400">
                {profile.role === 'landlord' 
                  ? 'Applications from tenants will appear here' 
                  : 'Apply to properties to see them here'}
              </p>
            </div>
          ) : (
            applications.map(app => (
              <div key={app.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      {app.property?.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      {app.property?.address}, {app.property?.city}
                    </p>
                    {profile.role === 'landlord' && app.tenant_profile && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-900">
                          Applicant: {app.tenant_profile.full_name}
                        </p>
                        {app.tenant_profile.email && (
                          <p className="text-sm text-gray-600">
                            Email: {app.tenant_profile.email}
                          </p>
                        )}
                        {app.tenant_profile.phone && (
                          <p className="text-sm text-gray-600">
                            Phone: {app.tenant_profile.phone}
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-2xl font-bold text-blue-600 mb-3">
                      ₱{Number(app.property?.price).toLocaleString()}/month
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    app.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    app.status === 'accepted' ? 'bg-green-100 text-green-700' :
                    app.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                  </span>
                </div>

                {app.message && (
                  <div className="mb-4 p-3 bg-gray-50 rounded">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      {profile.role === 'landlord' ? 'Message from applicant:' : 'Your message:'}
                    </p>
                    <p className="text-sm text-gray-600">{app.message}</p>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <p className="text-xs text-gray-400">
                    Applied: {new Date(app.submitted_at).toLocaleDateString()}
                  </p>

                  {profile.role === 'landlord' && app.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateApplicationStatus(app.id, 'accepted')}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => updateApplicationStatus(app.id, 'rejected')}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
                      >
                        Reject
                      </button>
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
