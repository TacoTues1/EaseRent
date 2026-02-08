import { useRouter } from 'next/router'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'
import AuthModal from './AuthModal'
import { showToast } from 'nextjs-toast-notify'

export default function Navbar() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState([]) // Store fetched notifications
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNotifDropdown, setShowNotifDropdown] = useState(false) // Toggle for notification dropdown
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showPublicMobileMenu, setShowPublicMobileMenu] = useState(false)
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 })
  const [isDuplicate, setIsDuplicate] = useState(false)
  const disabledClass = isDuplicate ? "opacity-40 pointer-events-none grayscale" : ""

  const navRef = useRef(null)
  const notifRef = useRef(null) // Ref for notification dropdown

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
        loadUnreadCount(result.data.session.user.id)
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        loadProfile(session.user.id)
        loadUnreadCount(session.user.id)
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  // ============================================
  // AUTO-CHECK: Process Scheduled Reminders Queue
  // Runs when ANY user is active, throttled to once per 10 minutes
  // ============================================
  useEffect(() => {
    if (!session) return

    const THROTTLE_KEY = 'lastReminderQueueCheck'
    const THROTTLE_MS = 10 * 60 * 1000 // 10 minutes (more frequent for better UX)

    const runReminderCheck = async () => {
      try {
        const lastCheck = localStorage.getItem(THROTTLE_KEY)
        const now = Date.now()

        // Skip if checked within the throttle period
        if (lastCheck && (now - parseInt(lastCheck)) < THROTTLE_MS) {
          return
        }

        // Update timestamp first to prevent parallel calls
        localStorage.setItem(THROTTLE_KEY, now.toString())

        // Call the scheduled reminders API (runs in background)
        const response = await fetch('/api/process-scheduled-reminders', { method: 'POST' })
        const result = await response.json()

        if (result.success && result.results?.processed > 0) {
          console.log('✅ Scheduled reminders processed:', result.results)
        }
      } catch (err) {
        console.error('Reminder queue check failed:', err)
      }
    }

    // Run check after a short delay (don't block page load)
    const timeout = setTimeout(runReminderCheck, 2000)

    return () => clearTimeout(timeout)
  }, [session])


  // Real-time subscription
  useEffect(() => {
    if (!session) return

    const userId = session.user.id

    const channel = supabase
      .channel('navbar-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient=eq.${userId}`
        },
        (payload) => {
          loadUnreadCount(userId)
          // If dropdown is open, refresh the list to show new item
          if (showNotifDropdown) {
            loadRecentNotifications(userId)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session, showNotifDropdown])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const updateUnderline = () => {
        const activeLink = document.querySelector('.nav-link.active')
        if (activeLink) {
          const parent = activeLink.parentElement
          const parentRect = parent.getBoundingClientRect()
          const linkRect = activeLink.getBoundingClientRect()
          setUnderlineStyle({
            left: linkRect.left - parentRect.left,
            width: linkRect.width
          })
        } else {
          setUnderlineStyle({ left: 0, width: 0, opacity: 0 })
        }
      }

      setTimeout(updateUnderline, 150)
      window.addEventListener('resize', updateUnderline)
      return () => window.removeEventListener('resize', updateUnderline)
    }
  }, [router.pathname, profile])

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      // Close User Dropdown
      if (navRef.current && !navRef.current.contains(event.target)) {
        setShowDropdown(false)
        setShowMobileMenu(false)
        setShowPublicMobileMenu(false)
      }
      // Close Notification Dropdown
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [navRef, notifRef]);

  async function loadProfile(userId, retries = 3) {
    try {
      // 1. Try to fetch the profile
      const { data } = await supabase.from('profiles').select('*, avatar_url').eq('id', userId).maybeSingle()

      if (data) {
        setProfile(data)

        // Check for duplicate phone numbers (your existing logic)
        if (data.phone) {
          const { data: duplicates } = await supabase
            .from('profiles')
            .select('id')
            .eq('phone', data.phone)
            .neq('id', userId)

          if (duplicates && duplicates.length > 0) {
            setIsDuplicate(true)
          }
        }
      } else {
        // 2. PROFILE NOT FOUND (New User from Google?) -> Create it now!

        // Get the user's Google metadata
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          // Extract names from Google data
          const metadata = user.user_metadata || {}
          const fullName = metadata.full_name || metadata.name || ''
          const googleFirstName = metadata.given_name || fullName.split(' ')[0] || 'User'
          const googleLastName = metadata.family_name || fullName.split(' ').slice(1).join(' ') || ''

          // Insert the new profile
          const { error: insertError } = await supabase.from('profiles').insert({
            id: user.id,
            email: user.email,
            first_name: googleFirstName,
            last_name: googleLastName,
            middle_name: 'N/A',
            role: 'tenant', // Default role for Google signups
            birthday: new Date().toISOString().split('T')[0], // Default today
            gender: 'Prefer not to say' // Default gender
          })

          if (!insertError) {
            // Profile created! Load it immediately to update the UI
            loadProfile(userId, 0)
          } else {
            console.error("Error creating Google profile:", insertError)
          }
        } else if (retries > 0) {
          // If user isn't loaded yet, retry a few times
          setTimeout(() => loadProfile(userId, retries - 1), 500)
        }
      }
    }
    catch (err) { console.error("loadProfile error:", err) }
  }

  async function loadUnreadCount(userId) {
    try {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient', userId)
        .eq('read', false)
      setUnreadCount(count || 0)
    } catch (err) { setUnreadCount(0) }
  }

  async function markAllAsRead() {
    if (!session) return
    await supabase.from('notifications').update({ read: true }).eq('recipient', session.user.id).eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    loadUnreadCount(session.user.id)
  }

  async function markAllAsUnread() {
    if (!session) return
    await supabase.from('notifications').update({ read: false }).eq('recipient', session.user.id).eq('read', true)
    setNotifications(prev => prev.map(n => ({ ...n, read: false })))
    loadUnreadCount(session.user.id)
  }

  // Load actual notification items for the dropdown
  async function loadRecentNotifications(userId) {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient', userId)
        .order('created_at', { ascending: false })
        .limit(6) // Limit to 6 for the dropdown

      if (data) setNotifications(data)
    } catch (err) {
      console.error('Error loading notifications:', err)
    }
  }

  // Handle clicking the Bell Icon
  function toggleNotifications() {
    if (!showNotifDropdown) {
      // Opening
      setShowNotifDropdown(true)
      setShowDropdown(false) // Close profile dropdown if open
      if (session) loadRecentNotifications(session.user.id)
    } else {
      // Closing
      setShowNotifDropdown(false)
    }
  }

  // Handle clicking a specific notification in the dropdown (View Details)
  async function handleNotificationClick(notif) {
    setShowNotifDropdown(false)

    // Mark as read locally and in DB
    if (!notif.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', notif.id)
      loadUnreadCount(session.user.id)
    }

    // Navigate
    if (notif.link) {
      router.push(notif.link)
    } else {
      // Default routing logic based on type
      if (notif.type === 'payment' || notif.type === 'payment_confirmed') router.push('/payments')
      else if (notif.type === 'maintenance') router.push('/maintenance')
      else if (notif.type === 'message') router.push('/messages')
      else if (notif.type === 'booking_request' || notif.type === 'booking_approved' || notif.type === 'booking_rejected') router.push('/bookings')
      else if (notif.type === 'application' || notif.type.includes('application_')) router.push('/applications')
      else if (notif.type === 'end_occupancy_request' || notif.type === 'end_request_approved' || notif.type === 'end_request_rejected') router.push('/dashboard')
      else router.push('/notifications')
    }
  }

  // Toggle read/unread status for a notification
  async function toggleNotifReadStatus(e, notif) {
    e.stopPropagation()
    const newStatus = !notif.read
    await supabase.from('notifications').update({ read: newStatus }).eq('id', notif.id)
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: newStatus } : n))
    loadUnreadCount(session.user.id)
  }

  // Delete a notification from dropdown
  async function deleteNotifFromDropdown(e, notifId) {
    e.stopPropagation()
    await supabase.from('notifications').delete().eq('id', notifId)
    setNotifications(prev => prev.filter(n => n.id !== notifId))
    loadUnreadCount(session.user.id)
    showToast.success("Notification deleted", {
      duration: 4000,
      progress: true,
      position: "top-center",
      transition: "bounceIn",
      icon: '',
      sound: true,
    });

  }

  async function handleSignOut() {
    try {
      // 1. Sign out from Supabase
      await supabase.auth.signOut({ scope: 'global' })

      // 2. Clear local state
      setSession(null)
      setProfile(null)

      // 3. FORCE CLEAR LOCAL STORAGE
      // Supabase v2 uses keys like "sb-<project-id>-auth-token"
      // We manually clear anything starting with "sb-" or "supabase" to be safe
      if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
            localStorage.removeItem(key)
          }
          if (key === 'supabase.auth.token') {
            localStorage.removeItem(key)
          }
        })
      }

      showToast.success("Signed out successfully", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });

      router.push('/')
    } catch (error) {
      console.error('Sign out error:', error)
      // Force clear session even if signOut fails
      setSession(null)
      setProfile(null)

      // Apply the same manual cleanup in the catch block
      if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
            localStorage.removeItem(key)
          }
        })
      }

      router.push('/')
    }
  }

  const isActive = (path) => router.pathname === path

  // if (profile?.role === 'admin') {
  //     return null
  // }

  // --- Public Navbar ---
  if (!session) {
    return (
      <>
        <div ref={navRef} className="absolute top-4 left-0 right-0 z-50 px-4 md:px-6 pointer-events-none">
          {/*Logo*/}
          <div className="absolute left-10 top-0 h-16 flex items-center pointer-events-auto z-50">
            <Link href="/" className="flex items-center gap-2 text-lg sm:text-xl font-bold text-black hover:opacity-80 transition-opacity">
              <img src="/home.png" alt="EaseRent" className="w-11 h-11 object-contain" />
              {/* <span className="hidden sm:inline text-3xl">EaseRent</span> */}
            </Link>
          </div>

          {/*Login and Register*/}
          <div className="absolute right-6 top-0 h-16 hidden sm:flex items-center gap-3 pointer-events-auto z-50">
            <button onClick={() => router.push('/login')} className="px-4 py-2 text-md font-semibold bg-gray-100 hover:text-black hover:bg-black/50 rounded-lg transition-all cursor-pointer">Login</button>
            <button onClick={() => router.push('/register')} className="px-6 py-4 text-md font-semibold bg-black text-white hover:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all transform cursor-pointer sm:px-5 sm:py-2">Register</button>
          </div>

          <nav className="max-w-lg mx-auto pointer-events-auto transition-all duration-300">
            <div className="px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">

                <div className="flex-1"></div>
                {/* --- CENTER: Text (Absolute Positioned) --- */}
                {/* Mobile Center Text */}
                <div className="absolute left-1/2 transform -translate-x-1/2 sm:hidden pointer-events-none">
                  <span className="text-lg font-bold text-black">𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝</span>
                </div>

                {/* Desktop Center Welcome Text */}
                <div className="absolute left-1/2 transform -translate-x-1/2 hidden lg:block w-full max-w-4xl text-center">
                  <span className="text-5xl lg:text-3xl font-bold text-gray-800 tracking-tight">
                    Welcome to 𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝
                  </span>
                </div>

                <div className="sm:hidden flex items-center">
                  <button onClick={() => setShowPublicMobileMenu(!showPublicMobileMenu)} className="p-2 rounded-xl text-black hover:bg-gray-100 transition-colors border border-gray-200 pointer-events-auto">
                    <svg className={`w-5 h-5 transition-transform duration-300 ${showPublicMobileMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {showPublicMobileMenu ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </nav>

          {showPublicMobileMenu && (
            <div className="sm:hidden mt-3 max-w-7xl mx-auto bg-white/95 backdrop-blur-md border border-gray-200 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
              <div className="p-4 grid grid-cols-1 gap-2">
                <button onClick={() => router.push('/login')} className="w-full text-left flex items-center px-4 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-all">Login</button>
                <button onClick={() => router.push('/register')} className="w-full text-left flex items-center px-4 py-3 rounded-xl text-sm font-medium bg-black text-white shadow-md hover:bg-gray-900 transition-all">Register</button>
              </div>
            </div>
          )}
        </div>
        <div className="h-24"></div>
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialMode={authMode} />
      </>
    )
  }

  // --- Authenticated Navbar ---
  return (
    <>
      <div ref={navRef} className="absolute top-4 left-0 right-0 z-50 px-4 md:px-6 pointer-events-none">
        <nav className="max-w-6xl mx-auto bg-white/90 backdrop-blur-md border border-gray-200 shadow-xl rounded-full pointer-events-auto transition-all duration-300">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">

              <div className="flex items-center gap-6 lg:gap-10">
                <Link href="/dashboard" className="flex items-center gap-2 font-bold text-black hover:opacity-80 transition-opacity">
                  <img src="/home.png" alt="EaseRent" className="w-8 h-8 object-contain" />
                  <span className="hidden md:inline text-xl">𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝</span>
                </Link>

                <div className="hidden md:flex relative gap-1">
                  <div className="absolute bottom-0 h-0.5 bg-black rounded-full" style={{ left: `${underlineStyle.left}px`, width: `${underlineStyle.width}px`, opacity: underlineStyle.width ? 1 : 0, transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }} />

                  <Link href="/dashboard" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/dashboard') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}>Home</Link>

                  {profile?.role === 'landlord' && (
                    <>
                      {/* <Link href="/applications" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/applications') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-200'} ${disabledClass}`}>Tenants Inquiries</Link> */}
                      <Link href="/bookings" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/bookings') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-200'} ${disabledClass}`}>Tenants Bookings</Link>
                      <Link href="/maintenance" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/maintenance') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-200'} ${disabledClass}`}>Tenants Maintenance</Link>
                    </>
                  )}

                  {profile?.role === 'tenant' && (
                    <>
                      {/* <Link href="/applications" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/applications') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-200'} ${disabledClass}`}>My Inquiries</Link> */}
                      <Link href="/bookings" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/bookings') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-200'} ${disabledClass}`}>My Bookings</Link>
                      <Link href="/maintenance" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/maintenance') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-200'} ${disabledClass}`}>Maintenance</Link>
                    </>
                  )}

                  <Link href="/messages" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/messages') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-200'} ${disabledClass}`}>Messages</Link>
                </div>
              </div>

              <div className="absolute left-1/2 transform -translate-x-1/2 md:hidden pointer-events-none">
                <span className="text-xl font-bold text-black">𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝</span>
              </div>

              <div className="flex items-center gap-3">

                {/* --- DESKTOP NOTIFICATIONS (FACEBOOK STYLE) --- */}
                <div className={`relative hidden md:block ${disabledClass}`} ref={notifRef}>
                  <button
                    onClick={toggleNotifications}
                    className={`relative p-2 rounded-full transition-all cursor-pointer ${showNotifDropdown || isActive('/notifications')
                      ? 'bg-black text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-black'
                      }`}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>

                    {unreadCount > 0 && (
                      <span className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center border-2 border-white shadow-sm">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Notification Dropdown */}
                  {showNotifDropdown && (
                    <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-black text-sm">Notifications</h3>
                        <div className="flex items-center gap-3">
                          {unreadCount > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAllAsRead();
                              }}
                              className="text-[10px] font-bold text-gray-500 hover:text-black cursor-pointer"
                            >
                              Read all
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAllAsUnread();
                            }}
                            className="text-[10px] font-bold text-gray-500 hover:text-black cursor-pointer"
                          >
                            Unread all
                          </button>
                          <div className="w-px h-3 bg-gray-300"></div>
                          <Link href="/notifications" onClick={() => setShowNotifDropdown(false)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">View All</Link>
                        </div>
                      </div>

                      <div className="max-h-[80vh] overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center">
                            <p className="text-sm text-gray-500">No new notifications</p>
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`group px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${!notif.read ? 'bg-blue-50/30' : ''}`}
                            >
                              <div className="flex gap-3">
                                <div className="flex-shrink-0 mt-1">
                                  <div className={`w-2 h-2 rounded-full ${!notif.read ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm ${!notif.read ? 'font-semibold text-black' : 'text-gray-600'}`}>{notif.message}</p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    {new Date(notif.created_at).toLocaleDateString()} • {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                                {/* Action Icons */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => toggleNotifReadStatus(e, notif)}
                                    className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg cursor-pointer"
                                    title={notif.read ? 'Mark as unread' : 'Mark as read'}
                                  >
                                    {notif.read ? (
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    ) : (
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    )}
                                  </button>
                                  <button
                                    onClick={(e) => deleteNotifFromDropdown(e, notif.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                                    title="Delete"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <Link
                        href="/notifications"
                        onClick={() => setShowNotifDropdown(false)}
                        className="block py-2.5 text-center text-xs font-semibold text-gray-500 hover:bg-gray-50 border-t border-gray-100"
                      >
                        See previous notifications
                      </Link>
                    </div>
                  )}
                </div>

                {/* Mobile Menu Button */}
                <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="md:hidden p-2 rounded-xl text-black hover:bg-gray-100 transition-colors border border-gray-200">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-black text-white rounded-md flex items-center justify-center text-xs font-bold">
                      {profile?.first_name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <svg className={`w-5 h-5 transition-transform duration-300 ${showMobileMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {showMobileMenu ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
                    </svg>
                  </div>
                </button>

                {/* Desktop User Dropdown */}
                <div className="hidden md:block relative">
                  <button onClick={() => { setShowDropdown(!showDropdown); setShowNotifDropdown(false) }} className="flex items-center gap-3 pl-2 pr-3 py-1.5 bg-white border border-gray-200 hover:border-black rounded-full shadow-sm hover:shadow transition-all group cursor-pointer">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                    ) : (
                      <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center font-bold text-sm group-hover:bg-gray-800 transition-colors">
                        {profile?.first_name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-700 group-hover:text-black hidden lg:block">{profile?.first_name}</span>
                    <svg className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showDropdown && (
                    <div className="absolute right-0 mt-3 w-64 bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                        <div className="font-bold text-black text-base">{profile?.first_name} {profile?.last_name}</div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{session?.user?.email}</div>
                        <div className="mt-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${profile?.role === 'landlord' ? 'bg-black text-white' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                            {profile?.role === 'landlord' ? 'Landlord' : 'Tenant'}
                          </span>
                        </div>
                      </div>

                      <div className="p-2 space-y-1">
                        {profile?.role === 'landlord' && (
                          <>
                            <Link href="/properties/allProperties" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
                              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> All Properties
                            </Link>
                            <Link href="/schedule" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
                              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Schedule
                            </Link>
                          </>
                        )}
                        <Link href="/payments" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
                          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg> Payments
                        </Link>
                        <div className="h-px bg-gray-100 my-1"></div>
                        <Link href="/settings" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Account Settings
                        </Link>
                        <Link href="/contact" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg> Emergency Contacts
                        </Link>
                        <button onClick={() => { setShowDropdown(false); handleSignOut() }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-xl w-full text-left transition-colors mt-1 cursor-pointer">
                          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg> Log Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Mobile Floating Menu (Detached) - Compact Version */}
        {showMobileMenu && (
          <div className="md:hidden mt-3 max-w-7xl mx-auto bg-white/95 backdrop-blur-md border border-gray-200 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-900 text-sm">{profile?.first_name} {profile?.last_name}</div>
                <div className="text-xs text-gray-500 truncate max-w-[180px]">{session?.user?.email}</div>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full ${profile?.role === 'landlord' ? 'bg-black text-white' : 'bg-gray-200 text-gray-800'}`}>
                {profile?.role === 'landlord' ? 'Landlord' : 'Tenant'}
              </span>
            </div>

            <div className="p-2 grid grid-cols-2 gap-1">
              <Link href="/dashboard" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive('/dashboard') ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Home</Link>

              {profile?.role === 'landlord' && (
                <>
                  <Link href="/properties" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive('/properties/allProperties') ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'} ${disabledClass}`}>All Properties</Link>
                  <Link href="/properties/new" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive('/properties/new') ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'} ${disabledClass}`}>Add Property</Link>
                  <Link href="/applications" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive('/applications') ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'} ${disabledClass}`}>Tenants Inquiries</Link>
                  <Link href="/bookings" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive('/bookings') ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'} ${disabledClass}`}>TenantsBookings</Link>
                  <Link href="/schedule" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive('/schedule') ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'} ${disabledClass}`}>Schedule</Link>
                </>
              )}

              {profile?.role === 'tenant' && (
                <>
                  {/* <Link href="/applications" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive('/applications') ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'} ${disabledClass}`}>My Inquiries</Link> */}
                  <Link href="/maintenance" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive('/maintenance') ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'} ${disabledClass}`}>Maintenance</Link>
                </>
              )}

              <Link href="/messages" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive('/messages') ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'} ${disabledClass}`}>Messages</Link>

              <Link href="/notifications" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive('/notifications') ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'} ${disabledClass}`}>
                Notifications
                {unreadCount > 0 && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isActive('/notifications') ? 'bg-white text-black' : 'bg-red-500 text-white'}`}>{unreadCount}</span>}
              </Link>
            </div>

            <div className="p-2 border-t border-gray-100 bg-gray-50/50 grid grid-cols-2 gap-1">
              <Link href="/payments" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-white rounded-lg transition-all ${disabledClass}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg> Payments
              </Link>
              <Link href="/settings" onClick={() => setShowMobileMenu(false)} className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-white rounded-lg transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Settings
              </Link>
              <button onClick={() => { setShowMobileMenu(false); handleSignOut() }} className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg> Log Out
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="h-24"></div>
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialMode={authMode} />
    </>
  )
}