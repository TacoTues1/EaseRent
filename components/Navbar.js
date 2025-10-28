import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import AuthModal from './AuthModal'

export default function Navbar() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('signin') // 'signin' or 'signup'
  const [showDropdown, setShowDropdown] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)

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
        // Profile doesn't exist (e.g., Google sign-in user), create one
        const { data: { user } } = await supabase.auth.getUser()
        
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
          console.error('Error creating profile:', insertError)
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
    router.push('/')
  }

  const isActive = (path) => router.pathname === path

  if (!session) {
    return (
      <>
        <nav className="bg-white border-b-2 border-black">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <Link href="/" className="text-xl font-bold text-black">
                  EaseRent
                </Link>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    setAuthMode('signin')
                    setShowAuthModal(true)
                  }}
                  className="px-4 py-2 text-black border border-black font-medium"
                >
                  Login
                </button>
                <button 
                  onClick={() => {
                    setAuthMode('signup')
                    setShowAuthModal(true)
                  }}
                  className="px-4 py-2 bg-black text-white border border-black"
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
    <nav className="bg-white border-b-2 border-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-xl font-bold text-black">
              EaseRent
            </Link>
            <div className="hidden md:flex gap-6">
              <Link 
                href="/dashboard" 
                className={`${isActive('/dashboard') ? 'text-black font-bold border-b-2 border-black' : 'text-black'}`}
              >
                Dashboard
              </Link>
              {profile?.role === 'landlord' && (
                <>
                  <Link 
                    href="/properties/new" 
                    className={`${isActive('/properties/new') ? 'text-black font-bold border-b-2 border-black' : 'text-black'}`}
                  >
                    Add Property
                  </Link>
                  <Link 
                    href="/applications" 
                    className={`${isActive('/applications') ? 'text-black font-bold border-b-2 border-black' : 'text-black'}`}
                  >
                    Applications
                  </Link>
                </>
              )}
              {profile?.role === 'tenant' && (
                <>
                  <Link 
                    href="/applications" 
                    className={`${isActive('/applications') ? 'text-black font-bold border-b-2 border-black' : 'text-black'}`}
                  >
                    My Applications
                  </Link>
                  <Link 
                    href="/maintenance" 
                    className={`${isActive('/maintenance') ? 'text-black font-bold border-b-2 border-black' : 'text-black'}`}
                  >
                    Maintenance
                  </Link>
                </>
              )}
              <Link 
                href="/payments" 
                className={`${isActive('/payments') ? 'text-black font-bold border-b-2 border-black' : 'text-black'}`}
              >
                Payments
              </Link>
              <Link 
                href="/messages" 
                className={`${isActive('/messages') ? 'text-black font-bold border-b-2 border-black' : 'text-black'}`}
              >
                Messages
              </Link>
              <Link 
                href="/notifications" 
                className={`relative ${isActive('/notifications') ? 'text-black font-bold border-b-2 border-black' : 'text-black'}`}
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
          
          <div className="flex items-center gap-3">
            {/* Mobile menu button - shows user avatar on mobile */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden flex items-center gap-2 p-2 border border-black"
            >
              <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-semibold">
                {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showMobileMenu ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                )}
              </svg>
            </button>

            {/* Desktop User Profile Dropdown */}
            <div className="hidden md:block relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-3 px-3 py-2 border border-black"
            >
              <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-semibold">
                {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="text-left hidden md:block">
                <div className="font-medium text-black text-sm">{profile?.full_name || 'User'}</div>
                <div className="text-black text-xs capitalize">{profile?.role || 'tenant'}</div>
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
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowDropdown(false)}
                />
                
                {/* Dropdown Content */}
                <div className="absolute right-0 mt-2 w-56 bg-white border-2 border-black py-2 z-20">
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
        <div className="md:hidden border-t-2 border-black bg-white">
          {/* User Info Section */}
          <div className="px-4 py-4 border-b-2 border-black bg-white">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-black text-white flex items-center justify-center font-semibold text-lg">
                {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
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
      )}
    </nav>
  )
}
