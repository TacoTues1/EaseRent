import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Lottie from "lottie-react"
import loadingAnimation from "../assets/loading.json"

export default function Settings() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const lastUserId = useRef(null)

  // Profile State
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
  const [verifiedPhone, setVerifiedPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef(null)
  const backupPhone = useRef('')

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Notification Preferences State
  const [notifPrefs, setNotifPrefs] = useState({
    email: true,
    sms: true,
    push: true
  })

  // Tab State
  const [activeTab, setActiveTab] = useState('profile') // profile | security | notifications

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        const userId = result.data.session.user.id

        if (lastUserId.current !== userId) {
          lastUserId.current = userId
          loadProfile(userId)
        } else {
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
      .select('*, avatar_url')
      .eq('id', userId)
      .maybeSingle()

    if (data) {
      setProfile(data)
      setFirstName(data.first_name || '')
      setMiddleName(data.middle_name || '')
      setLastName(data.last_name || '')
      setPhone(data.phone || '')
      // Ensure date format is YYYY-MM-DD
      setBirthday(data.birthday ? data.birthday.split('T')[0] : '')
      setGender(data.gender || '')
      setAvatarUrl(data.avatar_url || '')

      if (data.phone_verified && data.phone) {
        setVerifiedPhone(data.phone)
      }

      if (data.notification_preferences) {
        setNotifPrefs({
          email: data.notification_preferences.email ?? true,
          sms: data.notification_preferences.sms ?? true,
          push: data.notification_preferences.push ?? true
        })
      }
    }
    setLoading(false)
  }

  async function handleAvatarUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast.error('Please select an image file')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast.error('Image must be less than 2MB')
      return
    }

    setUploadingAvatar(true)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${session.user.id}/avatar-${Date.now()}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id)

      if (updateError) throw updateError

      setAvatarUrl(publicUrl)
      showToast.success('Profile picture updated!')
    } catch (error) {
      console.error('Error uploading avatar:', error)
      showToast.error('Failed to upload profile picture')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const isPhoneVerified = () => {
    const normalizePhone = (p) => p?.replace(/\D/g, '') || ''
    const currentInput = normalizePhone(phone)
    const verified = normalizePhone(verifiedPhone)
    return verified.length > 0 && currentInput === verified
  }

  async function handleSendVerification() {
    if (!phone) {
      showToast.error("Please enter a phone number first")
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
        showToast.error(data.error || 'Failed to send verification code')
      } else {
        setOtpSent(true)
        showToast.success('Verification code sent to your phone!')
      }
    } catch (error) {
      showToast.error('Failed to send verification code')
      console.error(error)
    }

    setOtpLoading(false)
  }

  async function handleVerifyOtp() {
    if (!otp || otp.length < 6) {
      showToast.error('Please enter the 6-digit code')
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
        showToast.error(data.error || 'Verification failed')
        if (data.attemptsRemaining !== undefined) {
          showToast.error(`${data.attemptsRemaining} attempts remaining`)
        }
      } else {
        showToast.success('Phone verified successfully!')
        setVerifying(false)
        setOtpSent(false)
        setOtp('')
        setVerifiedPhone(data.phone)
        setPhone(data.phone)
        loadProfile(session.user.id)
      }
    } catch (error) {
      showToast.error('Verification failed')
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
        birthday: birthday || null,
        gender: gender || null
      })
      .eq('id', session.user.id)

    if (error) {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' })
      console.error('Error updating profile:', error)
    } else {
      showToast.success('Profile updated successfully!')
      loadProfile(session.user.id)
    }

    setSaving(false)
  }

  async function handlePasswordChange(e) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      showToast.error("New passwords do not match")
      return
    }

    if (!currentPassword) {
      showToast.error("Please enter your current password")
      return
    }

    if (newPassword.length < 6) {
      showToast.error("Password must be at least 6 characters")
      return
    }

    setPasswordLoading(true)

    // Verify current password by signing in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    })

    if (signInError) {
      showToast.error("Incorrect current password")
      setPasswordLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (error) {
      showToast.error("Failed to update password: " + error.message)
    } else {
      showToast.success("Password updated successfully!")
      setNewPassword('')
      setConfirmPassword('')
      setCurrentPassword('')
    }
    setPasswordLoading(false)
  }

  async function handleNotificationPreferenceChange(key) {
    const newPrefs = { ...notifPrefs, [key]: !notifPrefs[key] }
    setNotifPrefs(newPrefs)

    const { error } = await supabase
      .from('profiles')
      .update({ notification_preferences: newPrefs })
      .eq('id', session.user.id)

    if (error) {
      console.error('Error updating preferences:', error)
      showToast.error("Failed to save preference")
      setNotifPrefs({ ...notifPrefs, [key]: notifPrefs[key] })
    }
  }

  async function handleSignOut() {
    try {
      await supabase.auth.signOut({ scope: 'global' })
      if (typeof window !== 'undefined') {
        localStorage.removeItem('supabase.auth.token')
      }
      showToast.success('Signed out successfully')
      router.push('/')
    } catch (error) {
      console.error('Sign out error:', error)
      router.push('/')
    }
  }

  const tabs = [
    {
      id: 'profile', label: 'General', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
      )
    },
    {
      id: 'security', label: 'Security', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
      )
    },
    {
      id: 'notifications', label: 'Notifications', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
      )
    }
  ]

  if (!session || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <div className="flex flex-col items-center">
          <Lottie animationData={loadingAnimation} loop={true} className="w-64 h-64" />
          <p className="text-gray-500 font-medium text-lg mt-4">Loading Settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight mb-2">Account Settings</h1>
          <p className="text-gray-500">Manage your profile updates, security, and notification preferences.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 items-start">

          {/* Sidebar Navigation */}
          <div className="w-full md:w-64 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden sticky top-8">
              <div className="p-2 space-y-1">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-xl transition-all duration-200 cursor-pointer ${activeTab === tab.id
                      ? 'bg-black text-white shadow-md'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                      }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100 p-2 mt-2">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 w-full relative min-h-[500px]">
            {/* PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">General Profile</h2>
                  <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${profile?.role === 'landlord' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {profile?.role === 'landlord' ? 'Landlord' : profile?.role === 'tenant' ? 'Tenant' : 'Admin'}
                  </span>
                </div>

                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  {/* Avatar Upload */}
                  <div className="flex items-center gap-6 pb-6 border-b border-gray-50">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg ring-2 ring-gray-100">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gray-100 flex items-center justify-center text-3xl font-bold text-gray-400">
                            {(firstName?.[0] || session.user.email?.[0] || '?').toUpperCase()}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-0 right-0 p-2 bg-black text-white rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{firstName || 'User'} {lastName}</h3>
                      <p className="text-sm text-gray-500">{session.user.email}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-2">First Name</label>
                      <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black focus:ring-0 transition-all font-medium" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Last Name</label>
                      <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black focus:ring-0 transition-all font-medium" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Middle Name</label>
                      <input type="text" value={middleName === 'N/A' ? '' : middleName} onChange={(e) => setMiddleName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black focus:ring-0 transition-all font-medium" placeholder="Optional" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Date of Birth</label>
                      <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black focus:ring-0 transition-all font-medium" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Gender</label>
                      <div className="relative">
                        <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black focus:ring-0 transition-all font-medium appearance-none">
                          <option value="" disabled>Select Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                          <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Phone Section Styled */}
                  <div className="pt-4 border-t border-gray-50">
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-2 flex justify-between">
                      Phone Number
                      {isPhoneVerified() && <span className="text-green-600 flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> Verified</span>}
                    </label>
                    <div className="flex gap-2">
                      <input type="tel" value={phone} disabled={isPhoneVerified()} onChange={(e) => { setPhone(e.target.value); if (verifying) setVerifying(false); }} className={`flex-1 px-4 py-3 border rounded-xl font-medium outline-none transition-all ${isPhoneVerified() ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-transparent focus:bg-white focus:border-black'}`} placeholder="+63 900 000 0000" />
                      {!isPhoneVerified() && !verifying && !otpSent && (
                        <button type="button" onClick={() => setVerifying(true)} className="px-6 py-3 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-colors cursor-pointer">Verify</button>
                      )}
                      {isPhoneVerified() && (
                        <button type="button" onClick={() => {
                          backupPhone.current = verifiedPhone;
                          setVerifiedPhone('');
                          setVerifying(true);
                        }} className="px-6 py-3 border border-gray-200 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">Change</button>
                      )}
                    </div>

                    {/* OTP UI (Simplified) */}
                    {(verifying || otpSent) && !isPhoneVerified() && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100 animation-in fade-in slide-in-from-top-2">
                        {!otpSent ? (
                          <div className="flex flex-col gap-3">
                            <p className="text-sm text-gray-600">We'll send a code to <strong>{phone}</strong></p>
                            <div className="flex gap-2">
                              <button type="button" onClick={handleSendVerification} disabled={otpLoading} className="flex-1 py-2 bg-black text-white rounded-lg font-bold text-sm hover:opacity-90 cursor-pointer">{otpLoading ? 'Sending...' : 'Send Code'}</button>
                              <button type="button" onClick={() => {
                                setVerifying(false)
                                if (backupPhone.current) {
                                  setVerifiedPhone(backupPhone.current)
                                  setPhone(backupPhone.current)
                                } else if (profile?.phone && profile?.phone_verified) {
                                  setVerifiedPhone(profile.phone)
                                  setPhone(profile.phone)
                                } else if (verifiedPhone) {
                                  // Fallback to current state if other refs fail
                                  setPhone(verifiedPhone)
                                }
                              }} className="px-4 py-2 border border-gray-300 rounded-lg font-bold text-sm cursor-pointer">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3">
                            <p className="text-sm text-gray-600">Enter the 6-digit code sent to your phone.</p>
                            <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} className="w-full text-center tracking-widest text-xl font-bold py-2 border-2 border-gray-200 rounded-lg focus:border-black outline-none" placeholder="000000" />
                            <div className="flex gap-2">
                              <button type="button" onClick={handleVerifyOtp} disabled={otpLoading} className="flex-1 py-2 bg-black text-white rounded-lg font-bold text-sm hover:opacity-90 cursor-pointer">{otpLoading ? 'Verifying...' : 'Confirm'}</button>
                              <button type="button" onClick={() => setOtpSent(false)} className="px-4 py-2 text-sm text-gray-500 hover:underline cursor-pointer">Resend</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-6 border-t border-gray-50">
                    <button type="submit" disabled={saving} className="bg-black text-white px-8 py-3 rounded-xl font-bold hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 cursor-pointer">
                      {saving ? 'Saving Changes...' : 'Save Profile'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* SECURITY TAB */}
            {activeTab === 'security' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-xl font-bold mb-6">Password & Security</h2>
                <form onSubmit={handlePasswordChange} className="max-w-md">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Current Password</label>
                      <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black focus:ring-0 transition-all font-medium" placeholder="••••••••" required />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-2">New Password</label>
                      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black focus:ring-0 transition-all font-medium" placeholder="••••••••" minLength={6} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Confirm Password</label>
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black focus:ring-0 transition-all font-medium" placeholder="••••••••" minLength={6} />
                    </div>
                  </div>
                  <div className="mt-6">
                    <button type="submit" disabled={passwordLoading || !newPassword || !currentPassword} className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer">
                      {passwordLoading ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* NOTIFICATIONS TAB */}
            {activeTab === 'notifications' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-xl font-bold mb-6">Notification Preferences</h2>
                <div className="space-y-4">
                  {[
                    { id: 'email', label: 'Email Notifications', desc: 'Receive updates, bills, and receipts via email.', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                    { id: 'sms', label: 'SMS Notifications', desc: 'Get urgent alerts and reminders via text message.', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
                    { id: 'push', label: 'In-App Notifications', desc: 'See real-time alerts within the dashboard bell icon.', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' }
                  ].map(item => (
                    <div key={item.id} className="flex items-center justify-between p-5 border border-gray-100 rounded-2xl hover:border-gray-200 hover:shadow-sm transition-all bg-gray-50/50">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-full ${notifPrefs[item.id] ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'}`}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{item.label}</p>
                          <p className="text-sm text-gray-500">{item.desc}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleNotificationPreferenceChange(item.id)}
                        className={`w-14 h-8 rounded-full transition-colors relative cursor-pointer ${notifPrefs[item.id] ? 'bg-black' : 'bg-gray-200'}`}
                      >
                        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all shadow-sm ${notifPrefs[item.id] ? 'left-7' : 'left-1'}`}></div>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}