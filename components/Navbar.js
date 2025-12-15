import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
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
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 })

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
        }
      }
      
      // Small delay to ensure DOM is ready
      setTimeout(updateUnderline, 150)
      
      // Update on window resize
      window.addEventListener('resize', updateUnderline)
      return () => window.removeEventListener('resize', updateUnderline)
    }
  }, [router.pathname, profile])

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
        // Profile doesn't exist, try to get user from auth
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError) {
          // User doesn't exist in auth either (orphaned session)
          console.error('Auth error - signing out:', authError)
          await supabase.auth.signOut()
          return
        }
        
        if (!user) {
          // No user found, sign out
          await supabase.auth.signOut()
          return
        }
        
        // User exists in auth but not in profiles, create profile
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            full_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User',
            role: 'tenant' // Default role for new users
          })
          .select()
          .single()
        
        if (insertError) {
          // Ignore duplicate key errors (profile was created elsewhere, e.g., by AuthModal)
          if (insertError.code === '23505') {
            // Profile exists now, fetch it
            const { data: existingProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .maybeSingle()
            
            if (existingProfile) {
              setProfile(existingProfile)
            }
          } else if (insertError.code === '23503') {
            // Foreign key violation - user doesn't exist in auth.users
            console.error('User not found in auth.users - signing out')
            await supabase.auth.signOut()
          } else {
            console.error('Error creating profile:', insertError)
          }
        } else if (newProfile) {
          setProfile(newProfile)
        }
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
      
      if (error) {
        console.error('Error loading notifications:', error)
        return
      }
      
      setUnreadCount(count || 0)
    } catch (err) {
      console.error('Network error loading notifications:', err)
      setUnreadCount(0)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    toast.success('Signed out successfully', {
      icon: '✓',
    })
    router.push('/')
  }

  const isActive = (path) => router.pathname === path

  if (!session) {
    return (
      <>
        <nav className="sticky top-0 z-50 bg-white border-b-2 border-black">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Link href="/" className="flex items-center gap-2 text-lg sm:text-xl font-bold text-black">
                  <img src="/home.png" alt="EaseRent" className="w-6 h-6 sm:w-7 sm:h-7" />
                  EaseRent
                </Link>
              </div>
              <div className="absolute left-1/2 transform -translate-x-1/2 hidden lg:block">
                <span className="text-lg xl:text-xl font-bold text-black">Welcome to EaseRent</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-4">
                <button 
                  onClick={() => {
                    setAuthMode('signin')
                    setShowAuthModal(true)
                  }}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base text-black border border-black font-medium cursor-pointer"
                >
                  Login
                </button>
                <button 
                  onClick={() => {
                    setAuthMode('signup')
                    setShowAuthModal(true)
                  }}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base bg-black text-white border border-black cursor-pointer"
                >
                  Register
                </button>
              </div>
            </div>
          </div>
        </nav>
        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => setShowAuthModal(false)} 
          initialMode={authMode}
        />
      </>
    )
  }

  return (
    <nav className="sticky top-0 z-50 bg-white border-b-2 border-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 text-lg sm:text-xl font-bold text-black">
              <img src="/home.png" alt="EaseRent" className="w-6 h-6 sm:w-7 sm:h-7" />
              EaseRent
            </Link>
            <div className="hidden md:flex gap-4 lg:gap-6 relative">
              {/* Sliding underline indicator */}
              <div 
                className="absolute bottom-0 h-0.5 bg-black"
                style={{ 
                  left: `${underlineStyle.left}px`, 
                  width: `${underlineStyle.width}px`,
                  transition: 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1), width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              />
              
              <Link 
                href="/dashboard" 
                className={`nav-link pb-1 transition-colors duration-200 text-sm lg:text-base ${isActive('/dashboard') ? 'active text-black font-semibold' : 'text-black hover:text-gray-600'}`}
              >
                Dashboard
              </Link>
              {profile?.role === 'landlord' && (
                <>
                  <Link 
                    href="/properties/new" 
                    className={`nav-link pb-1 transition-colors duration-200 text-sm lg:text-base ${isActive('/properties/new') ? 'active text-black font-semibold' : 'text-black hover:text-gray-600'}`}
                  >
                    Add Property
                  </Link>
                  <Link 
                    href="/applications" 
                    className={`nav-link pb-1 transition-colors duration-200 text-sm lg:text-base ${isActive('/applications') ? 'active text-black font-semibold' : 'text-black hover:text-gray-600'}`}
                  >
                    Applications
                  </Link>
                  <Link 
                    href="/bookings" 
                    className={`nav-link pb-1 transition-colors duration-200 text-sm lg:text-base ${isActive('/bookings') ? 'active text-black font-semibold' : 'text-black hover:text-gray-600'}`}
                  >
                    Bookings
                  </Link>
                  <Link 
                    href="/schedule" 
                    className={`nav-link pb-1 transition-colors duration-200 text-sm lg:text-base ${isActive('/schedule') ? 'active text-black font-semibold' : 'text-black hover:text-gray-600'}`}
                  >
                    Schedule
                  </Link>
                </>
              )}
              {profile?.role === 'tenant' && (
                <>
                  <Link 
                    href="/applications" 
                    className={`nav-link pb-1 transition-colors duration-200 text-sm lg:text-base ${isActive('/applications') ? 'active text-black font-semibold' : 'text-black hover:text-gray-600'}`}
                  >
                    My Applications
                  </Link>
                  <Link 
                    href="/maintenance" 
                    className={`nav-link pb-1 transition-colors duration-200 text-sm lg:text-base ${isActive('/maintenance') ? 'active text-black font-semibold' : 'text-black hover:text-gray-600'}`}
                  >
                    Maintenance
                  </Link>
                </>
              )}
              <Link 
                href="/payments" 
                className={`nav-link pb-1 transition-colors duration-200 text-sm lg:text-base ${isActive('/payments') ? 'active text-black font-semibold' : 'text-black hover:text-gray-600'}`}
              >
                Payments
              </Link>
              <Link 
                href="/messages" 
                className={`nav-link pb-1 transition-colors duration-200 text-sm lg:text-base ${isActive('/messages') ? 'active text-black font-semibold' : 'text-black hover:text-gray-600'}`}
              >
                Messages
              </Link>
              <Link 
                href="/notifications" 
                className={`nav-link relative pb-1 transition-colors duration-200 text-sm lg:text-base ${isActive('/notifications') ? 'active text-black font-semibold' : 'text-black hover:text-gray-600'}`}
              >
                Notifications
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-black text-white text-xs w-5 h-5 flex items-center justify-center border border-black">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mobile AI Chat Button */}
            <Link 
              href="/ai-chat"
              className="md:hidden p-1.5 text-black hover:bg-gray-100 rounded-full transition-colors"
              title="AI Chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden flex items-center gap-2 p-1.5 sm:p-2 border border-black"
            >
              <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-semibold">
                {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="md:hidden">
                <div className="font-medium text-black text-sm">{profile?.full_name?.split(' ')[0] || 'User'}</div>
              </div>
              <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showMobileMenu ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                )}
              </svg>
            </button>

            {/* Desktop AI Chat Button */}
            {/* <div className="hidden md:flex items-center">
              <Link 
                href="/ai-chat"
                className="p-2 text-black hover:bg-gray-100 rounded-full transition-colors"
                title="AI Chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </Link>
            </div> */}

            {/* Desktop User Profile Dropdown */}
            <div className="hidden md:block relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-3 px-3 py-2 border border-black"
              >
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-semibold">
                    {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-black text-sm">{profile?.full_name || 'User'}</div>
                    <div className="text-black text-xs capitalize">{profile?.role || 'tenant'}</div>
                  </div>
                </div>
                <svg 
                  className={`w-4 h-4 text-black ${showDropdown ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowDropdown(false)}
                />
                
                {/* Dropdown Content */}
                <div className="absolute right-0 mt-2 w-56 bg-white border-2 border-black py-2 z-50">
                  {/* User Info */}
                  <div className="px-4 py-3 border-b-2 border-black">
                    <div className="font-medium text-black">{profile?.full_name || 'User'}</div>
                    <div className="text-sm text-black">{session?.user?.email}</div>
                    <div className="mt-1">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium border border-black ${
                        profile?.role === 'landlord' 
                          ? 'bg-black text-white' 
                          : 'bg-white text-black'
                      }`}>
                        {profile?.role === 'landlord' ? 'Landlord' : 'Tenant'}
                      </span>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="py-1">
                    <Link
                      href="/settings"
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-black"
                    >
                      <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Settings
                    </Link>
                    
                    <button
                      onClick={() => {
                        setShowDropdown(false)
                        handleSignOut()
                      }}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-black w-full text-left"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/20 z-40 md:hidden" 
            onClick={() => setShowMobileMenu(false)}
          />
          
          {/* Mobile Menu Content */}
          <div className="absolute left-0 right-0 top-16 md:hidden border-t-2 border-black bg-white z-50 max-h-[calc(100vh-4rem)] overflow-y-auto">
            {/* User Info Section */}
            <div className="px-4 py-4 border-b-2 border-black bg-white">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-black text-white flex items-center justify-center font-semibold text-lg">
                {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>2
                <div className="font-medium text-black">{profile?.full_name || 'User'}</div>
                <div className="text-sm text-black">{session?.user?.email}</div>
              </div>
            </div>
            <div>
              <span className={`inline-block px-3 py-1 text-xs font-medium border border-black ${
                profile?.role === 'landlord' 
                  ? 'bg-black text-white' 
                  : 'bg-white text-black'
              }`}>
                {profile?.role === 'landlord' ? 'Landlord' : 'Tenant'}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="px-4 py-3 space-y-1">
            <Link 
              href="/dashboard" 
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 ${isActive('/dashboard') ? 'bg-black text-white font-medium' : 'text-black border border-black'}`}
            >
              Dashboard
            </Link>
            {profile?.role === 'landlord' && (
              <>
                <Link 
                  href="/properties/new" 
                  onClick={() => setShowMobileMenu(false)}
                  className={`block px-3 py-2 ${isActive('/properties/new') ? 'bg-black text-white font-medium' : 'text-black border border-black'}`}
                >
                  Add Property
                </Link>
                <Link 
                  href="/applications" 
                  onClick={() => setShowMobileMenu(false)}
                  className={`block px-3 py-2 ${isActive('/applications') ? 'bg-black text-white font-medium' : 'text-black border border-black'}`}
                >
                  Applications
                </Link>
                <Link 
                  href="/bookings" 
                  onClick={() => setShowMobileMenu(false)}
                  className={`block px-3 py-2 ${isActive('/bookings') ? 'bg-black text-white font-medium' : 'text-black border border-black'}`}
                >
                  Bookings
                </Link>
                <Link 
                  href="/schedule" 
                  onClick={() => setShowMobileMenu(false)}
                  className={`block px-3 py-2 ${isActive('/schedule') ? 'bg-black text-white font-medium' : 'text-black border border-black'}`}
                >
                  Schedule
                </Link>
              </>
            )}
            {profile?.role === 'tenant' && (
              <>
                <Link 
                  href="/applications" 
                  onClick={() => setShowMobileMenu(false)}
                  className={`block px-3 py-2 ${isActive('/applications') ? 'bg-black text-white font-medium' : 'text-black border border-black'}`}
                >
                  My Applications
                </Link>
                <Link 
                  href="/maintenance" 
                  onClick={() => setShowMobileMenu(false)}
                  className={`block px-3 py-2 ${isActive('/maintenance') ? 'bg-black text-white font-medium' : 'text-black border border-black'}`}
                >
                  Maintenance
                </Link>
              </>
            )}
            <Link 
              href="/payments" 
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 ${isActive('/payments') ? 'bg-black text-white font-medium' : 'text-black border border-black'}`}
            >
              Payments
            </Link>
            <Link 
              href="/messages" 
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 ${isActive('/messages') ? 'bg-black text-white font-medium' : 'text-black border border-black'}`}
            >
              Messages
            </Link>
            <Link 
              href="/notifications" 
              onClick={() => setShowMobileMenu(false)}
              className={`block px-3 py-2 ${isActive('/notifications') ? 'bg-black text-white font-medium' : 'text-black border border-black'}`}
            >
              <div className="flex items-center justify-between">
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span className="bg-black text-white text-xs w-5 h-5 flex items-center justify-center border border-black">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
            </Link>
          </div>

          {/* Settings & Sign Out */}
          <div className="px-4 py-3 border-t-2 border-black space-y-1">
            <Link
              href="/settings"
              onClick={() => setShowMobileMenu(false)}
              className="flex items-center gap-3 px-3 py-2 text-black border border-black"
            >
              <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              className="flex items-center gap-3 px-3 py-2 text-black border border-black w-full text-left"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
        </>
      )}
    </nav>
  )
}
