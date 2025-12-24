import { useRouter } from 'next/router'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'
import AuthModal from './AuthModal'
import toast from 'react-hot-toast'

export default function Navbar() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('signin') // 'signin' or 'signup'
  const [showDropdown, setShowDropdown] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showPublicMobileMenu, setShowPublicMobileMenu] = useState(false) // New state for public mobile menu
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 })
  const navRef = useRef(null)

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

  // Subscribe to real-time notification changes for badge auto-update
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
        () => {
          loadUnreadCount(userId)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session])

  // Update underline position on route change
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
      if (navRef.current && !navRef.current.contains(event.target)) {
        setShowDropdown(false)
        setShowMobileMenu(false)
        setShowPublicMobileMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [navRef]);

  async function loadProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error)
        return
      }
      
      if (data) {
        setProfile(data)
      } else {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
          await supabase.auth.signOut()
          return
        }
        
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            first_name: user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'User',
            middle_name: user?.user_metadata?.middle_name || 'N/A',
            last_name: user?.user_metadata?.last_name || '',
            role: 'tenant'
          })
          .select()
          .single()
        
        if (newProfile) setProfile(newProfile)
      }
    } catch (err) {
      console.error('Network error loading profile:', err)
    }
  }

  async function loadUnreadCount(userId) {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient', userId)
        .eq('read', false)
      
      if (error) return
      setUnreadCount(count || 0)
    } catch (err) {
      setUnreadCount(0)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    toast.success('Signed out successfully')
    router.push('/')
  }

  const isActive = (path) => router.pathname === path

  // --- Public Navbar ---
  if (!session) {
    return (
      <>
        {/* Floating Container */}
        <div ref={navRef} className="fixed top-4 left-0 right-0 z-50 px-4 md:px-6 pointer-events-none">
          <nav className="max-w-7xl mx-auto bg-white/90 backdrop-blur-md border border-gray-200 shadow-xl rounded-2xl pointer-events-auto transition-all duration-300">
            <div className="px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <div className="flex items-center">
                  <Link href="/" className="flex items-center gap-2 text-lg sm:text-xl font-bold text-black hover:opacity-80 transition-opacity">
                    <img src="/home.png" alt="EaseRent" className="w-8 h-8 object-contain" />
                    <span className="hidden sm:inline">EaseRent</span>
                  </Link>
                </div>
                
                {/* Mobile Centered Title */}
                <div className="absolute left-1/2 transform -translate-x-1/2 sm:hidden pointer-events-none">
                  <span className="text-lg font-bold text-black">EaseRent</span>
                </div>
                
                {/* Desktop Welcome Message */}
                <div className="absolute left-1/2 transform -translate-x-1/2 hidden lg:block">
                  <span className="text-lg font-bold text-gray-800 tracking-tight">Welcome to EaseRent</span>
                </div>

                {/* Desktop Buttons */}
                <div className="hidden sm:flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setAuthMode('signin')
                      setShowAuthModal(true)
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-700 hover:text-black hover:bg-gray-100 rounded-lg transition-all cursor-pointer sm:px-4 sm:py-2 sm:text-sm"
                  >
                    Login
                  </button>
                  <button 
                    onClick={() => {
                      setAuthMode('signup')
                      setShowAuthModal(true)
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-black text-white hover:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer sm:px-5 sm:py-2 sm:text-sm"
                  >
                    Register
                  </button>
                </div>

                {/* Mobile Menu Button */}
                <div className="sm:hidden flex items-center">
                  <button
                    onClick={() => setShowPublicMobileMenu(!showPublicMobileMenu)}
                    className="p-2 rounded-xl text-black hover:bg-gray-100 transition-colors border border-gray-200 pointer-events-auto"
                  >
                    <svg className={`w-5 h-5 transition-transform duration-300 ${showPublicMobileMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {showPublicMobileMenu ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      )}
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </nav>

          {/* Mobile Floating Menu (Public) */}
          {showPublicMobileMenu && (
            <div className="sm:hidden mt-3 max-w-7xl mx-auto bg-white/95 backdrop-blur-md border border-gray-200 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
              <div className="p-4 grid grid-cols-1 gap-2">
                <button 
                  onClick={() => {
                    setAuthMode('signin')
                    setShowAuthModal(true)
                    setShowPublicMobileMenu(false)
                  }}
                  className="w-full text-left flex items-center px-4 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-all"
                >
                  <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                  Login
                </button>
                <button 
                  onClick={() => {
                    setAuthMode('signup')
                    setShowAuthModal(true)
                    setShowPublicMobileMenu(false)
                  }}
                  className="w-full text-left flex items-center px-4 py-3 rounded-xl text-sm font-medium bg-black text-white shadow-md hover:bg-gray-900 transition-all"
                >
                  <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                  Register
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="h-24"></div> {/* Spacer for fixed navbar */}
        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => setShowAuthModal(false)} 
          initialMode={authMode}
        />
      </>
    )
  }

  // --- Authenticated Navbar ---
  return (
    <>
      <div ref={navRef} className="fixed top-4 left-0 right-0 z-50 px-4 md:px-6 pointer-events-none">
        <nav className="max-w-7xl mx-auto bg-white/90 backdrop-blur-md border border-gray-200 shadow-xl rounded-2xl pointer-events-auto transition-all duration-300">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              
              {/* Logo & Desktop Nav */}
              <div className="flex items-center gap-6 lg:gap-10">
                <Link href="/dashboard" className="flex items-center gap-2 font-bold text-black hover:opacity-80 transition-opacity">
                  <img src="/home.png" alt="EaseRent" className="w-8 h-8 object-contain" />
                  <span className="hidden md:inline text-xl">EaseRent</span>
                </Link>

                <div className="hidden md:flex relative gap-1">
                  {/* Sliding Underline */}
                  <div 
                    className="absolute bottom-0 h-0.5 bg-black rounded-full"
                    style={{ 
                      left: `${underlineStyle.left}px`, 
                      width: `${underlineStyle.width}px`,
                      opacity: underlineStyle.width ? 1 : 0,
                      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  />
                  
                  {/* Nav Links */}
                  <Link href="/dashboard" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/dashboard') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-50'}`}>
                    Dashboard
                  </Link>
                  
                  {profile?.role === 'landlord' && (
                    <>
                      <Link href="/applications" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/applications') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-50'}`}>
                        Applications
                      </Link>
                      <Link href="/bookings" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/bookings') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-50'}`}>
                        Bookings
                      </Link>
                      {/* Schedule moved to dropdown */}
                    </>
                  )}

                  {profile?.role === 'tenant' && (
                    <>
                      <Link href="/applications" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/applications') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-50'}`}>
                        My Applications
                      </Link>
                      <Link href="/maintenance" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/maintenance') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-50'}`}>
                        Maintenance
                      </Link>
                    </>
                  )}

                  {/* Payments moved to dropdown */}
                  <Link href="/messages" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive('/messages') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-50'}`}>
                    Messages
                  </Link>
                  <Link href="/notifications" className={`nav-link px-3 py-2 text-sm font-medium rounded-md transition-colors relative flex items-center ${isActive('/notifications') ? 'active text-black' : 'text-gray-600 hover:text-black hover:bg-gray-50'}`}>
                    Notifications
                    {unreadCount > 0 && (
                      <span className="ml-2 bg-black text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Link>
                </div>
              </div>

              {/* Mobile Centered Title */}
              <div className="absolute left-1/2 transform -translate-x-1/2 md:hidden pointer-events-none">
                <span className="text-xl font-bold text-black">EaseRent</span>
              </div>

              {/* Right Side Actions */}
              <div className="flex items-center gap-3">
                
                {/* Mobile Menu Button */}
                <button
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="md:hidden p-2 rounded-xl text-black hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-black text-white rounded-md flex items-center justify-center text-xs font-bold">
                      {profile?.first_name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <svg className={`w-5 h-5 transition-transform duration-300 ${showMobileMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {showMobileMenu ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      )}
                    </svg>
                  </div>
                </button>

                {/* Desktop Dropdown */}
                <div className="hidden md:block relative">
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="flex items-center gap-3 pl-2 pr-3 py-1.5 bg-white border border-gray-200 hover:border-black rounded-full shadow-sm hover:shadow transition-all group cursor-pointer"
                  >
                    <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center font-bold text-sm group-hover:bg-gray-800 transition-colors">
                      {profile?.first_name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <span className="text-sm font-medium text-gray-700 group-hover:text-black hidden lg:block">
                      {profile?.first_name}
                    </span>
                    <svg 
                      className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${showDropdown ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Desktop Dropdown Menu */}
                  {showDropdown && (
                    <div className="absolute right-0 mt-3 w-64 bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                        <div className="font-bold text-black text-base">{profile?.first_name} {profile?.last_name}</div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{session?.user?.email}</div>
                        <div className="mt-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${
                            profile?.role === 'landlord' 
                              ? 'bg-black text-white' 
                              : 'bg-blue-50 text-blue-700 border border-blue-100'
                          }`}>
                            {profile?.role === 'landlord' ? 'Landlord' : 'Tenant'}
                          </span>
                        </div>
                      </div>

                      <div className="p-2 space-y-1">
                        {profile?.role === 'landlord' && (
                          <Link
                            href="/schedule"
                            onClick={() => setShowDropdown(false)}
                            className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                          >
                            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Schedule
                          </Link>
                        )}
                        
                        <Link
                          href="/payments"
                          onClick={() => setShowDropdown(false)}
                          className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                          Payments
                        </Link>

                        <div className="h-px bg-gray-100 my-1"></div>

                        <Link
                          href="/settings"
                          onClick={() => setShowDropdown(false)}
                          className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Account Settings
                        </Link>
                        
                        <button
                          onClick={() => {
                            setShowDropdown(false)
                            handleSignOut()
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-xl w-full text-left transition-colors mt-1 cursor-pointer"
                        >
                          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Log Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Mobile Floating Menu (Detached) */}
        {showMobileMenu && (
          <div className="md:hidden mt-3 max-w-7xl mx-auto bg-white/95 backdrop-blur-md border border-gray-200 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
            {/* Mobile User Header */}
            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
               <div>
                  <div className="font-bold text-gray-900 text-lg">{profile?.first_name} {profile?.last_name}</div>
                  <div className="text-sm text-gray-500">{session?.user?.email}</div>
               </div>
               <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wide rounded-full ${
                  profile?.role === 'landlord' ? 'bg-black text-white' : 'bg-gray-200 text-gray-800'
               }`}>
                  {profile?.role === 'landlord' ? 'Landlord' : 'Tenant'}
               </span>
            </div>

            {/* Mobile Links Grid */}
            <div className="p-4 grid grid-cols-1 gap-2">
              <Link 
                href="/dashboard" 
                onClick={() => setShowMobileMenu(false)}
                className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive('/dashboard') ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Dashboard
              </Link>

              {profile?.role === 'landlord' && (
                <>
                  <Link href="/properties/new" onClick={() => setShowMobileMenu(false)} className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive('/properties/new') ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}>
                    Add Property
                  </Link>
                  <Link href="/applications" onClick={() => setShowMobileMenu(false)} className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive('/applications') ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}>
                    Applications
                  </Link>
                  <Link href="/bookings" onClick={() => setShowMobileMenu(false)} className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive('/bookings') ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}>
                    Bookings
                  </Link>
                  {/* Schedule moved to bottom actions */}
                </>
              )}

              {profile?.role === 'tenant' && (
                <>
                  <Link href="/applications" onClick={() => setShowMobileMenu(false)} className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive('/applications') ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}>
                    My Applications
                  </Link>
                  <Link href="/maintenance" onClick={() => setShowMobileMenu(false)} className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive('/maintenance') ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}>
                    Maintenance
                  </Link>
                </>
              )}

              {/* Payments moved to bottom actions */}
              <Link href="/messages" onClick={() => setShowMobileMenu(false)} className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive('/messages') ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}>
                Messages
              </Link>
              <Link href="/notifications" onClick={() => setShowMobileMenu(false)} className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive('/notifications') ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}>
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${isActive('/notifications') ? 'bg-white text-black' : 'bg-black text-white'}`}>
                    {unreadCount}
                  </span>
                )}
              </Link>
            </div>

            {/* Mobile Footer Actions */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-2">
              {profile?.role === 'landlord' && (
                <Link
                  href="/schedule"
                  onClick={() => setShowMobileMenu(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Schedule
                </Link>
              )}
              
              <Link
                href="/payments"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-white hover:shadow-sm rounded-xl transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Payments
              </Link>

              <div className="h-px bg-gray-200/50 my-1 mx-4"></div>

              <Link
                href="/settings"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-white hover:shadow-sm rounded-xl transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </Link>
              
              <button
                onClick={() => {
                  setShowMobileMenu(false)
                  handleSignOut()
                }}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl w-full text-left transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Spacer to prevent content from being hidden behind the fixed nav */}
      <div className="h-24"></div>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
        initialMode={authMode}
      />
    </>
  )
}