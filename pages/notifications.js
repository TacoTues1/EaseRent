import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'

export default function NotificationsPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { id: notificationId }

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
      } else {
        router.push('/auth')
      }
    })
  }, [])

  useEffect(() => {
    if (session) {
      loadNotifications()
      subscribeToNotifications()
    }
  }, [session])

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    
    setNotifications(data || [])
    setLoading(false)
  }

  function subscribeToNotifications() {
    // Subscribe to real-time notifications
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient=eq.${session.user.id}`
        },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  async function markAsRead(id) {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
    
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
  }

  function handleNotificationClick(notif) {
    // Mark as read
    if (!notif.read) {
      markAsRead(notif.id)
    }

    // Navigate based on notification type
    if (notif.type === 'payment' && notif.link) {
      router.push(notif.link)
    } else if (notif.type === 'maintenance' && notif.link) {
      router.push(notif.link)
    } else if (notif.type === 'application' && notif.link) {
      router.push(notif.link)
    } else if (notif.type === 'message' && notif.link) {
      router.push(notif.link)
    } else {
      // Default navigation based on type
      if (notif.type === 'payment') {
        router.push('/payments')
      } else if (notif.type === 'maintenance') {
        router.push('/maintenance')
      } else if (notif.type === 'application') {
        router.push('/applications')
      } else if (notif.type === 'message') {
        router.push('/messages')
      }
    }
  }

  async function markAllAsRead() {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient', session.user.id)
      .eq('read', false)
    
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function deleteNotification(id, e) {
    e.stopPropagation() // Prevent triggering the notification click
    
    // Show confirmation modal
    setDeleteConfirm({ id })
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', deleteConfirm.id)
    
    if (!error) {
      setNotifications(prev => prev.filter(n => n.id !== deleteConfirm.id))
    }
    
    setDeleteConfirm(null)
  }

  function cancelDelete() {
    setDeleteConfirm(null)
  }

  if (!session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-600">
                You have {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg shadow divide-y">
          {loading ? (
            <p className="p-6 text-gray-500">Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500 mb-2">No notifications yet</p>
              <p className="text-sm text-gray-400">We'll notify you when something important happens</p>
            </div>
          ) : (
            notifications.map(notif => (
              <div
                key={notif.id}
                className={`p-4 hover:bg-gray-50 transition cursor-pointer ${
                  !notif.read ? 'bg-blue-50' : ''
                }`}
                onClick={() => handleNotificationClick(notif)}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs uppercase font-semibold ${
                        notif.type === 'payment' ? 'text-green-600' :
                        notif.type === 'maintenance' ? 'text-orange-600' :
                        notif.type === 'application' ? 'text-blue-600' :
                        notif.type === 'message' ? 'text-purple-600' :
                        'text-gray-600'
                      }`}>
                        {notif.type || 'General'}
                      </span>
                      {!notif.read && (
                        <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                      )}
                    </div>
                    <p className="text-gray-900 mb-1">{notif.message}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(notif.created_at).toLocaleString()}
                    </p>
                    <p className="text-xs text-blue-600 mt-1 hover:underline">
                      Click to view →
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteNotification(notif.id, e)}
                    className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete notification"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0  backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Notification</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this notification? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium"
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
