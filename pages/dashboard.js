import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import LandlordDashboard from '../components/LandlordDashboard'
import TenantDashboard from '../components/TenantDashboard'

export default function Dashboard() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Security States
  const [isDuplicate, setIsDuplicate] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session)
        loadProfile(session.user.id)
      } else {
        router.push('/')
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session)
        loadProfile(session.user.id)
      } else {
        router.push('/')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

async function loadProfile(userId, retries = 3) { // Add retry counter
  try {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    
    if (data) {
      setProfile(data)

      // SECURITY CHECK: Check for duplicate Phone Number
      if (data.phone) {
        const { data: duplicates } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', data.phone)
          .neq('id', userId) 
          .eq('is_deleted', false)
        
        if (duplicates && duplicates.length > 0) {
            setIsDuplicate(true)
        }
      }
      setLoading(false) // Only stop loading if we found data
    } else if (retries > 0) {
      // If no data found, wait 500ms and try again
      console.log(`Profile not found, retrying... (${retries} left)`)
      setTimeout(() => loadProfile(userId, retries - 1), 500)
    } else {
      // Out of retries, stop loading (this will likely result in an error state)
      setLoading(false)
      // Optional: Redirect to login or show specific error
    }
  } catch (error) {
    console.error("Error fetching profile:", error)
    setLoading(false)
  }
}

  const handleDeleteAccount = async () => {
    if(!confirm("Are you sure? This will permanently delete this duplicate account.")) return;

    setDeleting(true)
    try {
      // Call our new API route
      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: session.user.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete account')
      }

      // Sign out locally
      await supabase.auth.signOut()
      router.push('/')
      
    } catch (error) {
      alert("Error deleting account: " + error.message)
      setDeleting(false)
    }
  }

  if (loading || !session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-black"></div>
      </div>
    )
  }

  // --- LOCKED VIEW (Restricted Access) ---
  if (isDuplicate) {
    return (
        // REMOVED 'fixed inset-0 z-50' so the Navbar stays visible
        // Added 'flex-1' to take up remaining space
        <div className="min-h-[calc(100vh-64px)] bg-white flex flex-col items-center justify-center p-4">
             <div className="max-w-lg w-full text-center">
                
                {/* UPDATED ICON: X inside Circle (Centered) */}
                <div className="mx-auto mb-6 w-24 h-24 flex items-center justify-center">
                    <svg className="w-24 h-24 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                
                <h1 className="text-3xl font-black text-black mb-4 uppercase tracking-wider">ACCOUNT LOCKED</h1>
                
                <p className="text-lg text-gray-900 font-bold mb-4">
                    Multiple Account Detected
                </p>
                
                <p className="text-gray-500 mb-8 leading-relaxed text-sm max-w-md mx-auto">
                    This phone number is associated with another account. Access to features is disabled for duplicate accounts. Please use your main account.
                </p>

                <div className="flex flex-col gap-4 max-w-xs mx-auto">
                    <button 
                        onClick={handleDeleteAccount}
                        disabled={deleting}
                        className="w-full bg-black text-white font-bold py-3.5 px-8 rounded-xl shadow-lg  transition-all cursor-pointer disabled:opacity-50"
                    >
                        {deleting ? 'Deleting...' : 'Delete Account'}
                    </button>
                    
                </div>
             </div>
        </div>
    )
  }

  // Render the correct dashboard based on role
  if (profile.role === 'landlord') {
    return <LandlordDashboard session={session} profile={profile} />
  }

  return <TenantDashboard session={session} profile={profile} />
}