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
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')

  // Verification State
  const [verifying, setVerifying] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)

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
      setFirstName(data.first_name || '')
      setMiddleName(data.middle_name || '')
      setLastName(data.last_name || '')
      setPhone(data.phone || '')
    }
    setLoading(false)
  }

  // Check if the input phone number matches the verified auth phone
  const isPhoneVerified = () => {
    // Check if session phone exists, is confirmed, and matches current input
    // We strip spaces/dashes for comparison just in case
    const currentInput = phone.replace(/\D/g, '')
    const authPhone = session?.user?.phone?.replace(/\D/g, '') || ''
    
    return session?.user?.phone_confirmed_at && currentInput === authPhone && currentInput.length > 0
  }

  async function handleSendVerification() {
    if (!phone) {
      toast.error('Please enter a phone number first')
      return
    }

    setOtpLoading(true)
    // This sends the SMS via Supabase Auth
    const { error } = await supabase.auth.updateUser({ phone: phone })

    if (error) {
      toast.error(error.message)
      setVerifying(false)
    } else {
      setOtpSent(true)
      toast.success('Verification code sent to your phone!')
    }
    setOtpLoading(false)
  }

  async function handleVerifyOtp() {
    if (!otp || otp.length < 6) {
      toast.error('Please enter the 6-digit code')
      return
    }

    setOtpLoading(true)
    // Verify the code
    const { data, error } = await supabase.auth.verifyOtp({
      phone: phone,
      token: otp,
      type: 'phone_change'
    })

    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Phone verified successfully!')
      setVerifying(false)
      setOtpSent(false)
      setOtp('')
      
      // Update the profile immediately to match the verified auth user
      await supabase
        .from('profiles')
        .update({ phone: phone })
        .eq('id', session.user.id)
        
      // Refresh session to update the "Verified" UI status
      const { data: { session: newSession } } = await supabase.auth.refreshSession()
      if (newSession) setSession(newSession)
    }
    setOtpLoading(false)
  }

  async function handleUpdateProfile(e) {
    e.preventDefault()
    setSaving(true)
    setMessage({ type: '', text: '' })

    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        middle_name: middleName || 'N/A',
        last_name: lastName,
        phone: phone // This updates the profile display, but doesn't verify it alone
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
      style: {
        border: '1px solid black',
        padding: '16px',
        color: 'black',
      },
    })
    router.push('/')
  }

  if (!session || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="inline-block animate-spin h-8 w-8 border-b-2 border-black"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white  border-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-black tracking-tight">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your account and profile information</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Information Card */}
        <div className="bg-white border-2 border-black overflow-hidden mb-8 rounded-xl">
          <div className="px-6 py-4 bg-white border-b-2 border-black">
            <h2 className="text-lg font-bold text-black uppercase tracking-wider">Profile Information</h2>
          </div>
          
          <form onSubmit={handleUpdateProfile} className="p-6">
            {/* Success/Error Message */}
            {message.text && (
              <div className={`mb-6 p-4 text-sm font-bold border-2 border-black ${
                message.type === 'success' 
                  ? 'bg-black text-white' 
                  : 'bg-white text-black'
              }`}>
                {message.text}
              </div>
            )}

            {/* Email (Read-only) */}
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={session.user.email}
                disabled
                className="w-full px-4 py-3 border-2 border-gray-200 bg-gray-50 text-gray-500 font-medium cursor-not-allowed rounded-lg"
              />
              <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wide">Email cannot be changed</p>
            </div>

            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-1 font-medium transition-all"
                  placeholder="Juan"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Last Name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-1 font-medium transition-all"
                  placeholder="Dela Cruz"
                />
              </div>
            </div>

            {/* Middle Name */}
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                Middle Name <span className="text-gray-400 font-normal normal-case">(Optional)</span>
              </label>
              <input
                type="text"
                value={middleName === 'N/A' ? '' : middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-1 font-medium transition-all"
                placeholder="Santos"
              />
            </div>

            {/* Phone Verification Section */}
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex justify-between items-center">
                Phone Number
                {isPhoneVerified() && (
                  <span className="flex items-center gap-1 text-[10px] font-bold bg-black text-white px-2 py-0.5 rounded-full border border-black">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    VERIFIED
                  </span>
                )}
              </label>
              
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value)
                    // If user changes phone, hide verification UI until they request again
                    if (verifying || otpSent) {
                      setVerifying(false)
                      setOtpSent(false)
                    }
                  }}
                  className={`flex-1 px-4 py-3 border-2 rounded-lg font-medium outline-none transition-all ${
                    isPhoneVerified() 
                      ? 'border-black bg-white text-black' 
                      : 'border-black bg-white text-black focus:ring-2 focus:ring-black focus:ring-offset-1'
                  }`}
                  placeholder="+63 912 345 6789"
                />
                
                {!isPhoneVerified() && !verifying && !otpSent && (
                  <button
                    type="button"
                    onClick={() => setVerifying(true)}
                    className="px-6 py-3 bg-black text-white text-sm font-bold border-2 border-black rounded-lg cursor-pointer"
                  >
                    Verify
                  </button>
                )}
              </div>

              {/* OTP Input Area */}
              {(verifying || otpSent) && !isPhoneVerified() && (
                <div className="mt-4 p-5 bg-white border-2 border-black rounded-xl">
                  {!otpSent ? (
                    <div>
                      <p className="text-sm font-bold text-black mb-1">Verify your number</p>
                      <p className="text-xs text-gray-500 mb-4">
                        We will send a code to <strong>{phone}</strong>. Standard SMS rates may apply.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSendVerification}
                          disabled={otpLoading}
                          className="flex-1 px-4 py-2 bg-black text-white text-sm font-bold border-2 border-black rounded-lg hover:bg-white hover:text-black transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {otpLoading ? 'Sending...' : 'Send Code'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setVerifying(false)}
                          className="px-4 py-2 bg-white text-black text-sm font-bold border-2 border-black rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-black mb-3">
                        Enter the 6-digit code sent to your phone.
                      </p>
                      <div className="flex gap-2 mb-3">
                        <input
                          type="text"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          placeholder="123456"
                          maxLength={6}
                          className="w-full px-4 py-2 border-2 border-black text-center tracking-[0.5em] font-bold text-lg rounded-lg outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleVerifyOtp}
                          disabled={otpLoading}
                          className="flex-1 px-4 py-2 bg-black text-white text-sm font-bold border-2 border-black rounded-lg hover:bg-white hover:text-black transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {otpLoading ? 'Verifying...' : 'Confirm Code'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false)
                            setOtp('')
                          }}
                          className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-black underline cursor-pointer"
                        >
                          Resend
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Role (Read-only) */}
            <div className="mb-8">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                Account Type
              </label>
              <div className="flex items-center gap-3">
                <span className={`px-4 py-2 text-sm font-bold border-2 border-black rounded-full inline-flex items-center gap-2 ${
                  profile?.role === 'landlord' 
                    ? 'bg-black text-white' 
                    : 'bg-white text-black'
                }`}>
                  {profile?.role === 'landlord' ? '🏢 Landlord Account' : '🏠 Tenant Account'}
                </span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Read Only</span>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-3 pt-2 border-t-2 border-gray-100">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-black text-white py-3 px-6 rounded-xl hover:shadow-lg font-bold cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="px-6 py-3 border-2 border-transparent text-gray-500 font-bold hover:text-black cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        {/* Account Actions Card */}
        <div className="bg-white border-2 border-black overflow-hidden rounded-xl shadow-md">
          <div className="px-6 py-4 bg-white border-b-2 border-black">
            <h2 className="text-lg font-bold text-black uppercase tracking-wider">Account Actions</h2>
          </div>
          
          <div className="p-6">
            <div className="space-y-6">
              {/* Sign Out */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-black">Sign Out</div>
                  <div className="text-xs text-gray-500 mt-0.5">Securely log out of your account on this device</div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="px-6 py-2 border-2 border-black bg-white text-black hover:bg-black hover:text-white font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </div>

              {/* Account Info */}
              <div className="pt-6 border-t border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-gray-400 font-mono">
                  <div>
                    <span className="font-bold uppercase tracking-wider text-gray-300 mr-2">Joined</span>
                    {profile?.created_at && new Date(profile.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                  <div>
                    <span className="font-bold uppercase tracking-wider text-gray-300 mr-2">ID</span>
                    {session.user.id}
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