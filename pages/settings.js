import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'

export default function Settings() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  // Form state
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
      } else {
        router.push('/')
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session)
        loadProfile(session.user.id)
      } else {
        router.push('/')
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [router])

  async function loadProfile(userId) {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    
    if (data) {
      setProfile(data)
      setFullName(data.full_name || '')
      setPhone(data.phone || '')
    }
    setLoading(false)
  }

  async function handleUpdateProfile(e) {
    e.preventDefault()
    setSaving(true)
    setMessage({ type: '', text: '' })

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone: phone
      })
      .eq('id', session.user.id)

    if (error) {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' })
      console.error('Error updating profile:', error)
    } else {
      setMessage({ type: 'success', text: 'Profile updated successfully!' })
      loadProfile(session.user.id)
    }

    setSaving(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    toast.success('Signed out successfully', {
      icon: '✓',
    })
    router.push('/')
  }

  if (!session || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="inline-block animate-spin h-12 w-12 border-b-2 border-black"></div>
      </div>
    )
  }

  return (
    
    <div className="min-h-screen bg-white">
    {/* Header */}
      <div className="bg-white border-2 border-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-black">Settings</h1>
          <p className="text-sm text-black">Manage your account and profile information</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Information Card */}
        <div className="bg-white border-2 border-black overflow-hidden mb-6">
          <div className="px-6 py-4 bg-white border-b border-black">
            <h2 className="text-lg font-semibold text-black">Profile Information</h2>
          </div>
          
          <form onSubmit={handleUpdateProfile} className="p-6">
            {/* Success/Error Message */}
            {message.text && (
              <div className={`mb-4 p-3 ${
                message.type === 'success' 
                  ? 'bg-black text-white border-2 border-black' 
                  : 'bg-white text-black border-2 border-black'
              }`}>
                {message.text}
              </div>
            )}

            {/* Email (Read-only) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-black mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={session.user.email}
                disabled
                className="w-full px-4 py-2 border-2 border-black bg-white text-black cursor-not-allowed"
              />
              <p className="text-xs text-black mt-1">Email cannot be changed</p>
            </div>

            {/* Full Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-black mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-2 border-2 border-black focus:outline-none"
                placeholder="Enter your full name"
              />
            </div>

            {/* Phone */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-black mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 border-2 border-black focus:outline-none"
                placeholder="Enter your phone number"
              />
            </div>

            {/* Role (Read-only) */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-black mb-2">
                Account Type
              </label>
              <div className="flex items-center">
                <span className={`px-3 py-1 text-sm font-medium ${
                  profile.role === 'landlord' 
                    ? 'bg-white text-black' 
                    : 'bg-black text-white'
                }`}>
                  {profile.role === 'landlord' ? '🏢 Landlord' : '🏠 Tenant'}
                </span>
                <span className="ml-3 text-xs text-black">Account type cannot be changed</span>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-black text-white py-2 px-4 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="px-6 py-2 border-2 border-black text-black font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        {/* Account Actions Card */}
        <div className="bg-white border-2 border-black overflow-hidden">
          <div className="px-6 py-4 bg-white border-b border-black">
            <h2 className="text-lg font-semibold text-black">Account Actions</h2>
          </div>
          
          <div className="p-6">
            <div className="space-y-4">
              {/* Sign Out */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-black">Sign Out</div>
                  <div className="text-sm text-black">Sign out of your account</div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="px-4 py-2 bg-black text-white hover:bg-black font-medium"
                >
                  Sign Out
                </button>
              </div>

              {/* Account Info */}
              <div className="pt-4 border-t border-black">
                <div className="text-sm text-black">
                  <div className="mb-2">
                    <span className="font-medium">Account Created:</span>{' '}
                    {new Date(profile.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                  <div>
                    <span className="font-medium">User ID:</span>{' '}
                    <code className="text-xs bg-white px-2 py-1">{session.user.id}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
