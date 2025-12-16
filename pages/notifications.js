import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'

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
      
      // Subscribe to real-time notifications
      const channel = supabase
        .channel('notifications-page')
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
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient=eq.${session.user.id}`
          },
          (payload) => {
            setNotifications(prev =>
              prev.map(n => n.id === payload.new.id ? payload.new : n)
            )
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient=eq.${session.user.id}`
          },
          (payload) => {
            setNotifications(prev => prev.filter(n => n.id !== payload.old.id))
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
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
    if (notif.link) {
      router.push(notif.link)
    } else {
      // Default navigation based on type
      if (notif.type === 'payment' || notif.type === 'payment_confirmed') {
        router.push('/payments')
      } else if (notif.type === 'maintenance') {
        router.push('/maintenance')
      } else if (notif.type === 'end_occupancy_request' || notif.type === 'end_request_approved' || notif.type === 'end_request_rejected') {
        router.push('/dashboard')
      } else if (notif.type === 'application' || notif.type.includes('application_')) {
        router.push('/applications')
      } else if (notif.type === 'message') {
        router.push('/messages')
      } else if (notif.type === 'booking_request' || notif.type === 'booking_approved' || notif.type === 'booking_rejected') {
        router.push('/bookings')
      } else {
        // Fallback to applications for any unknown type
        router.push('/applications')
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
      toast.success('Notification deleted successfully', {
        icon: '✓',
      })
    } else {
      toast.error('Failed to delete notification', {
        icon: '✕',
      })
    }
    
    setDeleteConfirm(null)
  }

  function cancelDelete() {
    setDeleteConfirm(null)
  }

  if (!session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-black">
                You have {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 text-sm text-black"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="bg-white divide-y">
          {loading ? (
            <p className="p-6 text-black">Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-black mb-2">No notifications yet</p>
              <p className="text-sm text-black">We'll notify you when something important happens</p>
            </div>
          ) : (
            notifications.map(notif => (
              <div
                key={notif.id}
                className={`p-4 cursor-pointer ${
                  !notif.read ? 'bg-white' : ''
                }`}
                onClick={() => handleNotificationClick(notif)}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs uppercase font-semibold ${
                        notif.type === 'payment' ? 'text-white' :
                        notif.type === 'maintenance' ? 'text-orange-600' :
                        notif.type === 'application' ? 'text-black' :
                        notif.type === 'message' ? 'text-purple-600' :
                        'text-black'
                      }`}>
                        {notif.type || 'General'}
                      </span>
                      {!notif.read && (
                        <span className="w-2 h-2 bg-black"></span>
                      )}
                    </div>
                    <p className="text-black mb-1">{notif.message}</p>
                    <p className="text-xs text-black">
                      {new Date(notif.created_at).toLocaleString()}
                    </p>
                    <p className="text-xs text-black mt-1 hover:underline">
                      Click to view →
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteNotification(notif.id, e)}
                    className="flex-shrink-0 p-2 text-black-colors cursor-pointer"
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
          <div className="bg-white border-2 border-black max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-black mb-2 ">Delete Notification</h3>
            <p className="text-black mb-6">
              Are you sure you want to delete this notification? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 border-2 border-black text-black bg-white hover:bg-gray-100 font-medium cursor-pointer rounded-full"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 font-medium cursor-pointer rounded-full"
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
