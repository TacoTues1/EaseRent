import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'

export default function Settings() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const lastUserId = useRef(null)
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [verifiedPhone, setVerifiedPhone] = useState('')  // Track the phone number that was verified

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        const userId = result.data.session.user.id
        
        // Only load profile if it hasn't been loaded for this user yet
        if (lastUserId.current !== userId) {
          lastUserId.current = userId
          loadProfile(userId)
        } else {
          // If we already have the user loaded, stop loading state
          setLoading(false)
        }
      } else {
        router.push('/')
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session)
        const userId = session.user.id
        
        // Only reload profile if the user ID has actually changed
        if (lastUserId.current !== userId) {
          lastUserId.current = userId
          loadProfile(userId)
        }
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
      // Ensure date format is YYYY-MM-DD in case DB returns a timestamp
      setBirthday(data.birthday ? data.birthday.split('T')[0] : '') 
      setGender(data.gender || '')
      
      // Track verified phone from profile
      if (data.phone_verified && data.phone) {
        setVerifiedPhone(data.phone)
      }
    }
    setLoading(false)
  }

  // Check if the input phone number matches the verified phone
  const isPhoneVerified = () => {
    // Normalize both phones for comparison
    const normalizePhone = (p) => p?.replace(/\D/g, '') || ''
    const currentInput = normalizePhone(phone)
    const verified = normalizePhone(verifiedPhone)
    
    return verified.length > 0 && currentInput === verified
  }

  async function handleSendVerification() {
    if (!phone) {
      showToast.error("Please enter a phone number first", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });

      return
    }

    setOtpLoading(true)
    
    try {
      const response = await fetch('/api/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', phone })
      })

      const data = await response.json()

      if (!response.ok) {
        showToast.error(data.error || 'Failed to send verification code', {
          duration: 4000,
          progress: true,
          position: "top-center",
          transition: "bounceIn",
          icon: '',
          sound: true,
        });
      } else {
        setOtpSent(true)
        showToast.success('Verification code sent to your phone!', {
          duration: 4000,
          progress: true,
          position: "top-center",
          transition: "bounceIn",
          icon: '',
          sound: true,
        });
      }
    } catch (error) {
      showToast.error('Failed to send verification code', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      console.error(error)
    }
    
    setOtpLoading(false)
  }

  async function handleVerifyOtp() {
    if (!otp || otp.length < 6) {
      showToast.error('Please enter the 6-digit code', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      return
    }

    setOtpLoading(true)
    
    try {
      const response = await fetch('/api/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'verify', 
          phone, 
          code: otp,
          userId: session.user.id
        })
      })

      const data = await response.json()

      if (!response.ok) {
        showToast.error(data.error || 'Verification failed', {
          duration: 4000,
          progress: true,
          position: "top-center",
          transition: "bounceIn",
          icon: '',
          sound: true,
        });
        if (data.attemptsRemaining !== undefined) {
          showToast.error(`${data.attemptsRemaining} attempts remaining`, {
            duration: 4000,
            progress: true,
            position: "top-center",
            transition: "bounceIn",
            icon: '',
            sound: true,
          });

        }
      } else {
        showToast.success('Phone verified successfully!', {
          duration: 4000,
          progress: true,
          position: "top-center",
          transition: "bounceIn",
          icon: '',
          sound: true,
        });
        setVerifying(false)
        setOtpSent(false)
        setOtp('')
        setVerifiedPhone(data.phone) // Update verified phone
        setPhone(data.phone) // Update phone to normalized format
        
        // Reload profile to get updated data
        loadProfile(session.user.id)
      }
    } catch (error) {
      showToast.error('Verification failed', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      console.error(error)
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
        phone: phone, 
        // Send null instead of empty string to prevent Postgres invalid input syntax for date
        birthday: birthday || null, 
        gender: gender || null
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
    try {
      // Sign out with global scope to clear session from all tabs/windows
      await supabase.auth.signOut({ scope: 'global' })
      // Clear any cached data
      if (typeof window !== 'undefined') {
        localStorage.removeItem('supabase.auth.token')
      }
      showToast.success('Signed out successfully', {
        icon: '✓',
        style: {
          border: '1px solid black',
          padding: '16px',
          color: 'black',
        },
      })
      router.push('/')
    } catch (error) {
      console.error('Sign out error:', error)
      router.push('/')
    }
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
      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Information Card */}
        <div className="bg-white overflow-hidden mb-8 rounded-xl">
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
                  placeholder="Firstname"
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
                  placeholder="Lastname"
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
                placeholder="Middlename"
              />
            </div>
            <div className="flex gap-4 mb-6">
                <div className="w-1/2">
                  <label htmlFor="birthday" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Birthday
                  </label>
                  <input
                    id="birthday"
                    name="birthday"
                    type="date"
                    required
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    className="appearance-none relative block w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-1 font-medium transition-all"
                  />
                </div>
                <div className="w-1/2">
                  <label htmlFor="gender" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Gender
                  </label>
                  <div className="relative">
                    <select
                      id="gender"
                      name="gender"
                      required
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="appearance-none relative block w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-1 font-medium transition-all bg-white"
                    >
                      <option value="" disabled>Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-700">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                      </svg>
                    </div>
                  </div>
                </div>
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
                  disabled={isPhoneVerified()} 
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
                      ? 'border-black bg-gray-50 text-gray-500 cursor-not-allowed' 
                      : 'border-black bg-white text-black focus:ring-2 focus:ring-black focus:ring-offset-1'
                  }`}
                  placeholder="Number"
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
                
                {isPhoneVerified() && !verifying && !otpSent && (
                  <button
                    type="button"
                    onClick={() => {
                      setVerifiedPhone('') // Clear verified status to allow editing
                      setVerifying(true)
                    }}
                    className="px-6 py-3 bg-white text-black text-sm font-bold border-2 border-black rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    Change
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
                          onClick={() => {
                            setVerifying(false)
                            // Revert to the original profile state if we cancel
                            if (profile?.phone && profile?.phone_verified) {
                              setVerifiedPhone(profile.phone)
                              setPhone(profile.phone)
                            }
                          }}
                          className="px-4 py-2 bg-white text-black text-sm font-bold border-2 border-black rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-black mb-3">
                        Enter the 6-digit code sent to your phone, that valid only for 10 minutes.
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
            <div className="mb-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                Account Type
              </label>
              <div className="flex flex-col gap-2">
                <span className={`w-fit px-2 py-1 text-sm font-bold border-2 border-black rounded-full inline-flex items-center gap-2 ${
                  profile?.role === 'landlord' 
                    ? 'bg-black text-white' 
                    : 'bg-white text-black'
                }`}>
                  {profile?.role === 'landlord' ? 'Landlord Account' : 'Tenant Account'}
                </span>
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
      </div>
    </div>
  )
}