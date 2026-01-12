import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'

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

  useEffect(() => {
    if (session) {
      loadNotifications()
    }
  }, [session])

  async function markAsRead(id) {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
    
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
  }

  async function markAsUnread(id, e) {
    e.stopPropagation()
    await supabase
      .from('notifications')
      .update({ read: false })
      .eq('id', id)
    
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: false } : n)
    )
    showToast.success("Marked as unread", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

  }

  async function toggleReadStatus(id, currentStatus, e) {
    e.stopPropagation()
    const newStatus = !currentStatus
    await supabase
      .from('notifications')
      .update({ read: newStatus })
      .eq('id', id)
    
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: newStatus } : n)
    )
    showToast.success(newStatus ? 'Marked as read' : 'Marked as unread', {
      duration: 4000,
      progress: true,
      position: "top-center",
      transition: "bounceIn",
      icon: '',
      sound: true,
    })
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
      showToast.success("Notification deleted", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

    } else {
      showToast.error("Failed to delete", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
    }
    
    setDeleteConfirm(null)
  }

  function cancelDelete() {
    setDeleteConfirm(null)
  }

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="inline-block animate-spin h-8 w-8 border-b-2 border-black"></div>
    </div>
  )

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-black tracking-tight">Notifications</h1>
            <p className="text-sm text-gray-500 mt-1">
              You have {unreadCount} unread {unreadCount === 1 ? 'update' : 'updates'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs font-bold text-black border-b border-black cursor-pointer pb-0.5"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex flex-col gap-3">
          {loading ? (
            <div className="flex justify-center py-10">
               <div className="inline-block animate-spin h-6 w-6 border-b-2 border-black"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed border-gray-100 rounded-xl">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              </div>
              <p className="text-black font-medium">No notifications yet</p>
              <p className="text-sm text-gray-400 mt-1">We'll notify you when important updates arrive</p>
            </div>
          ) : (
            notifications.map(notif => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`group relative p-5 rounded-xl border transition-all cursor-pointer ${
                  !notif.read 
                    ? 'bg-white border-black shadow-sm' 
                    : 'bg-gray-50 border-transparent hover:bg-white hover:border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {!notif.read && (
                        <span className="w-2 h-2 rounded-full bg-black flex-shrink-0"></span>
                      )}
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                        !notif.read ? 'border-black text-black' : 'border-gray-300 text-gray-500'
                      }`}>
                        {notif.type?.replace(/_/g, ' ') || 'General'}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(notif.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} • {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    <p className={`text-sm mb-1 ${!notif.read ? 'font-bold text-black' : 'font-medium text-gray-600'}`}>
                      {notif.message}
                    </p>
                  </div>

                  {/* Action Icons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => toggleReadStatus(notif.id, notif.read, e)}
                      className={`p-2 rounded-lg transition-colors cursor-pointer ${
                        notif.read 
                          ? 'text-gray-400 hover:text-black hover:bg-gray-100' 
                          : 'text-green-500 hover:text-green-600 hover:bg-green-50'
                      }`}
                      title={notif.read ? 'Mark as unread' : 'Mark as read'}
                    >
                      {notif.read ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                    <button
                      onClick={(e) => deleteNotification(notif.id, e)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-black mb-2">Delete Notification?</h3>
            <p className="text-sm text-gray-500 mb-6">
              This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2.5 bg-black text-white text-sm font-bold rounded-lg cursor-pointer active:scale-95 transition-transform"
              >
                Delete
              </button>
              <button
                onClick={cancelDelete}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-black text-sm font-bold rounded-lg cursor-pointer hover:bg-gray-200 active:scale-95 transition-transform"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}