import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { normalizeImageForUpload } from '../lib/imageCompression'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'

export default function Settings() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [landlordReviewStats, setLandlordReviewStats] = useState({ avg: 0, count: 0 })
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
  const [phoneOtpCooldown, setPhoneOtpCooldown] = useState(0)
  const [verifiedPhone, setVerifiedPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef(null)
  const backupPhone = useRef('')

  // Payment Methods State (Landlord only)
  const [gcashNumber, setGcashNumber] = useState('')
  const [gcashVerified, setGcashVerified] = useState(false)
  const [gcashOtpSent, setGcashOtpSent] = useState(false)
  const [gcashOtp, setGcashOtp] = useState('')
  const [gcashOtpLoading, setGcashOtpLoading] = useState(false)
  const [gcashOtpCooldown, setGcashOtpCooldown] = useState(0)
  const [gcashEditing, setGcashEditing] = useState(false)
  const [gcashQrUrl, setGcashQrUrl] = useState('')
  const [gcashQrUploading, setGcashQrUploading] = useState(false)
  const gcashQrRef = useRef(null)
  const [mayaNumber, setMayaNumber] = useState('')
  const [mayaVerified, setMayaVerified] = useState(false)
  const [mayaOtpSent, setMayaOtpSent] = useState(false)
  const [mayaOtp, setMayaOtp] = useState('')
  const [mayaOtpLoading, setMayaOtpLoading] = useState(false)
  const [mayaOtpCooldown, setMayaOtpCooldown] = useState(0)
  const [mayaEditing, setMayaEditing] = useState(false)
  const [mayaQrUrl, setMayaQrUrl] = useState('')
  const [mayaQrUploading, setMayaQrUploading] = useState(false)
  const mayaQrRef = useRef(null)
  const [savingPaymentMethods, setSavingPaymentMethods] = useState(false)

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [loginRecords, setLoginRecords] = useState([])
  const [loadingLoginRecords, setLoadingLoginRecords] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteOtpSent, setDeleteOtpSent] = useState(false)
  const [deleteOtpCode, setDeleteOtpCode] = useState('')
  const [deleteOtpVerified, setDeleteOtpVerified] = useState(false)
  const [deleteOtpLoading, setDeleteOtpLoading] = useState(false)
  const [deleteOtpCooldown, setDeleteOtpCooldown] = useState(0)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteReasonDetails, setDeleteReasonDetails] = useState('')
  const [deleteFlowStep, setDeleteFlowStep] = useState('reason')

  // Subscription State (Tenant only)
  const [subscriptionPlan, setSubscriptionPlan] = useState(null)
  const [subscriptionPayments, setSubscriptionPayments] = useState([])
  const [loadingSubscription, setLoadingSubscription] = useState(false)
  const [buyingSlot, setBuyingSlot] = useState(false)

  // Notification Preferences State
  const [notifPrefs, setNotifPrefs] = useState({
    email: true,
    sms: true,
    push: true
  })

  // Tab State
  const [activeTab, setActiveTab] = useState('profile') // profile | security | notifications

  const deleteReasonOptions = [
    { value: 'no-longer-needed', label: 'I no longer need my account' },
    { value: 'found-better-alternative', label: 'I found a better alternative' },
    { value: 'privacy-concerns', label: 'I have privacy or security concerns' },
    { value: 'duplicate-account', label: 'I accidentally created a duplicate account' },
    { value: 'other', label: 'Other' }
  ]

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

  // Handle subscription_success / subscription_cancelled redirect from PayMongo
  useEffect(() => {
    const { subscription_success, payment_id, subscription_cancelled } = router.query
    if (subscription_success === 'true' && payment_id) {
      confirmSubscriptionPayment(payment_id)
      router.replace('/settings?tab=subscription', undefined, { shallow: true })
    }
    if (subscription_cancelled === 'true') {
      // Cancel any pending payments when user closes/cancels PayMongo checkout
      cancelPendingPayments()
      router.replace('/settings?tab=subscription', undefined, { shallow: true })
    }
    if (router.query.tab === 'subscription') {
      setActiveTab('subscription')
      loadSubscription()
    }
  }, [router.query])

  useEffect(() => {
    if (phoneOtpCooldown <= 0 && gcashOtpCooldown <= 0 && mayaOtpCooldown <= 0 && deleteOtpCooldown <= 0) return

    const timer = setInterval(() => {
      setPhoneOtpCooldown((prev) => Math.max(prev - 1, 0))
      setGcashOtpCooldown((prev) => Math.max(prev - 1, 0))
      setMayaOtpCooldown((prev) => Math.max(prev - 1, 0))
      setDeleteOtpCooldown((prev) => Math.max(prev - 1, 0))
    }, 1000)

    return () => clearInterval(timer)
  }, [phoneOtpCooldown, gcashOtpCooldown, mayaOtpCooldown, deleteOtpCooldown])

  const formatCooldown = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

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

      if (data.role === 'landlord') {
        await loadLandlordReviewStats(userId)
      } else {
        setLandlordReviewStats({ avg: 0, count: 0 })
      }

      // Load payment methods
      if (data.accepted_payments) {
        const ap = data.accepted_payments
        if (ap.gcash) {
          setGcashNumber(ap.gcash.number || '')
          setGcashVerified(!!ap.gcash.verified)
          setGcashQrUrl(ap.gcash.qr_url || '')
        }
        if (ap.maya) {
          setMayaNumber(ap.maya.number || '')
          setMayaVerified(!!ap.maya.verified)
          setMayaQrUrl(ap.maya.qr_url || '')
        }
      }

      await loadLoginRecords(userId)
    }
    setLoading(false)
  }

  async function loadLandlordReviewStats(landlordId) {
    const { data, error } = await supabase
      .from('landlord_ratings')
      .select('rating')
      .eq('landlord_id', landlordId)

    if (error) {
      console.error('Error loading landlord review stats:', error)
      setLandlordReviewStats({ avg: 0, count: 0 })
      return
    }

    const count = (data || []).length
    const avg = count > 0
      ? (data.reduce((sum, item) => sum + Number(item.rating || 0), 0) / count)
      : 0

    setLandlordReviewStats({ avg, count })
  }

  async function loadLoginRecords(userId) {
    setLoadingLoginRecords(true)

    const { data, error } = await supabase
      .from('user_login_records')
      .select('id, login_at, provider')
      .eq('user_id', userId)
      .order('login_at', { ascending: false })
      .limit(3)

    if (error) {
      console.error('Failed to load login records:', error)
      setLoginRecords([])
    } else {
      setLoginRecords(data || [])
    }

    setLoadingLoginRecords(false)
  }

  function formatLoginTime(value) {
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }

  async function handleAvatarUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast.error('Please select an image file')
      return
    }

    setUploadingAvatar(true)

    try {
      const uploadFile = await normalizeImageForUpload(file)
      const fileExt = uploadFile.name.split('.').pop()
      const fileName = `${session.user.id}/avatar-${Date.now()}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, uploadFile, { upsert: true })

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
      showToast.success('Profile picture updated!', {
        position: "top-center",
      })
    } catch (error) {
      console.error('Error uploading avatar:', error)
      showToast.error(error?.message || 'Failed to upload profile picture')
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
        if (data.waitSeconds) {
          setPhoneOtpCooldown(data.waitSeconds)
        }
        showToast.error(data.error || 'Failed to send verification code')
      } else {
        setOtpSent(true)
        setPhoneOtpCooldown(data.waitSeconds || 300)
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

  // ── Payment Methods (Landlord) ──
  async function handlePaymentOtpSend(type) {
    const phone = type === 'gcash' ? gcashNumber : mayaNumber
    const setOtpLoading = type === 'gcash' ? setGcashOtpLoading : setMayaOtpLoading
    const setOtpSent = type === 'gcash' ? setGcashOtpSent : setMayaOtpSent
    const cooldown = type === 'gcash' ? gcashOtpCooldown : mayaOtpCooldown
    const setCooldown = type === 'gcash' ? setGcashOtpCooldown : setMayaOtpCooldown
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      showToast.error(`Enter a valid ${type === 'gcash' ? 'GCash' : 'Maya'} number`)
      return
    }
    if (cooldown > 0) {
      showToast.error(`Please wait ${formatCooldown(cooldown)} before requesting another code`)
      return
    }
    setOtpLoading(true)
    try {
      const res = await fetch('/api/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', phone })
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.waitSeconds) {
          setCooldown(data.waitSeconds)
        }
        showToast.error(data.error || 'Failed to send code')
        return
      }
      setOtpSent(true)
      setCooldown(data.waitSeconds || 300)
      showToast.success(`Code sent to your ${type === 'gcash' ? 'GCash' : 'Maya'} number!`)
    } catch { showToast.error('Failed to send code') }
    finally { setOtpLoading(false) }
  }

  async function handlePaymentOtpVerify(type) {
    const phone = type === 'gcash' ? gcashNumber : mayaNumber
    const code = type === 'gcash' ? gcashOtp : mayaOtp
    const setOtpLoading = type === 'gcash' ? setGcashOtpLoading : setMayaOtpLoading
    const setVerified = type === 'gcash' ? setGcashVerified : setMayaVerified
    const setOtpSent = type === 'gcash' ? setGcashOtpSent : setMayaOtpSent
    const setOtp = type === 'gcash' ? setGcashOtp : setMayaOtp
    const setEditing = type === 'gcash' ? setGcashEditing : setMayaEditing
    if (!code || code.length < 6) { showToast.error('Enter the 6-digit code'); return }
    setOtpLoading(true)
    try {
      const res = await fetch('/api/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', phone, code })
      })
      const data = await res.json()
      if (!res.ok) { showToast.error(data.error || 'Verification failed'); setOtp(''); return }
      setVerified(true)
      setOtpSent(false)
      setOtp('')
      setEditing(false)
      showToast.success(`${type === 'gcash' ? 'GCash' : 'Maya'} number verified!`)
      // Auto-save
      await savePaymentMethods(type === 'gcash' ? { number: phone, verified: true } : undefined, type === 'maya' ? { number: phone, verified: true } : undefined)
    } catch { showToast.error('Verification failed') }
    finally { setOtpLoading(false) }
  }

  async function handleQrUpload(type, event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { showToast.error('Please select an image'); return }
    const setUploading = type === 'gcash' ? setGcashQrUploading : setMayaQrUploading
    const setQrUrl = type === 'gcash' ? setGcashQrUrl : setMayaQrUrl
    setUploading(true)
    try {
      const uploadFile = await normalizeImageForUpload(file)
      const ext = uploadFile.name.split('.').pop()
      const fileName = `${session.user.id}/${type}-qr-${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('payment-files').upload(fileName, uploadFile, { upsert: true })
      if (uploadErr) throw uploadErr
      const { data: { publicUrl } } = supabase.storage.from('payment-files').getPublicUrl(fileName)
      setQrUrl(publicUrl)
      showToast.success(`${type === 'gcash' ? 'GCash' : 'Maya'} QR code uploaded!`)
      // Auto-save QR URL
      await savePaymentMethods(
        type === 'gcash' ? { number: gcashNumber, verified: gcashVerified, qr_url: publicUrl } : undefined,
        type === 'maya' ? { number: mayaNumber, verified: mayaVerified, qr_url: publicUrl } : undefined
      )
    } catch (err) {
      console.error('QR upload error:', err)
      showToast.error(err?.message || 'Failed to upload QR code')
    } finally { setUploading(false) }
  }

  async function savePaymentMethods(gcashOverride, mayaOverride) {
    setSavingPaymentMethods(true)
    const currentPayments = profile?.accepted_payments || { cash: true }
    const updated = { ...currentPayments, cash: true }
    if (gcashOverride) {
      updated.gcash = { ...(currentPayments.gcash || {}), ...gcashOverride }
    } else if (gcashVerified) {
      updated.gcash = { number: gcashNumber, verified: true, qr_url: gcashQrUrl || currentPayments.gcash?.qr_url || '' }
    }
    if (mayaOverride) {
      updated.maya = { ...(currentPayments.maya || {}), ...mayaOverride }
    } else if (mayaVerified) {
      updated.maya = { number: mayaNumber, verified: true, qr_url: mayaQrUrl || currentPayments.maya?.qr_url || '' }
    }
    const { error } = await supabase.from('profiles').update({ accepted_payments: updated }).eq('id', session.user.id)
    if (error) {
      showToast.error('Failed to save payment methods')
      console.error(error)
    } else {
      setProfile(prev => ({ ...prev, accepted_payments: updated }))
    }
    setSavingPaymentMethods(false)
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

  function resetDeleteOtpState() {
    setDeleteOtpSent(false)
    setDeleteOtpCode('')
    setDeleteOtpVerified(false)
    setDeleteOtpCooldown(0)
  }

  function resetDeleteModalState() {
    resetDeleteOtpState()
    setDeleteReason('')
    setDeleteReasonDetails('')
    setDeleteFlowStep('reason')
  }

  function isDeleteReasonValid() {
    if (!deleteReason) return false
    if (deleteReason === 'other') {
      return deleteReasonDetails.trim().length > 0
    }
    return true
  }

  function getDeleteReasonText() {
    if (!deleteReason) return ''
    if (deleteReason === 'other') return deleteReasonDetails.trim()

    const selectedOption = deleteReasonOptions.find((option) => option.value === deleteReason)
    return selectedOption?.label || ''
  }

  function handleDeleteReasonNext() {
    if (!isDeleteReasonValid()) {
      showToast.error('Please select a reason before continuing')
      return
    }

    resetDeleteOtpState()
    setDeleteFlowStep('otp')
  }

  function handleDeleteReasonBack() {
    if (deletingAccount || deleteOtpLoading) return
    resetDeleteOtpState()
    setDeleteFlowStep('reason')
  }

  function openDeleteAccountModal() {
    resetDeleteModalState()
    setDeleteModalOpen(true)
  }

  function closeDeleteAccountModal() {
    if (deletingAccount || deleteOtpLoading) return
    setDeleteModalOpen(false)
    resetDeleteModalState()
  }

  async function handleSendDeleteOtp() {
    if (!session?.user?.email) {
      showToast.error('No email found for OTP verification')
      return
    }

    if (!isDeleteReasonValid()) {
      setDeleteFlowStep('reason')
      showToast.error('Please select a reason first')
      return
    }

    if (deleteOtpCooldown > 0) {
      showToast.error(`Please wait ${formatCooldown(deleteOtpCooldown)} before requesting another OTP`)
      return
    }

    setDeleteOtpLoading(true)
    try {
      const response = await fetch('/api/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          email: session.user.email
        })
      })

      const data = await response.json()

      if (!response.ok) {
        if (data?.waitSeconds) {
          setDeleteOtpCooldown(Number(data.waitSeconds))
        }
        const waitMatch = String(data?.error || '').match(/wait\s+(\d+)\s+seconds/i)
        if (waitMatch?.[1]) {
          setDeleteOtpCooldown(Number(waitMatch[1]))
        }
        showToast.error(data.error || 'Failed to send OTP')
        return
      }

      setDeleteOtpSent(true)
      setDeleteOtpVerified(false)
      setDeleteOtpCode('')
      setDeleteOtpCooldown(Number(data?.waitSeconds || 120))
      showToast.success('OTP sent to your email')
    } catch (error) {
      console.error('Send delete OTP error:', error)
      showToast.error('Failed to send OTP. Please try again.')
    } finally {
      setDeleteOtpLoading(false)
    }
  }

  async function handleVerifyDeleteOtp() {
    if (!session?.user?.email) {
      showToast.error('No email found for OTP verification')
      return
    }

    const cleanCode = (deleteOtpCode || '').replace(/\D/g, '').slice(0, 6)
    if (cleanCode.length < 6) {
      showToast.error('Please enter the 6-digit OTP code')
      return
    }

    setDeleteOtpLoading(true)
    try {
      const response = await fetch('/api/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          email: session.user.email,
          code: cleanCode
        })
      })

      const data = await response.json()

      if (!response.ok) {
        showToast.error(data.error || 'Invalid OTP')
        return
      }

      setDeleteOtpVerified(true)
      showToast.success('OTP verified. You can now confirm account deletion.')
    } catch (error) {
      console.error('Verify delete OTP error:', error)
      showToast.error('Failed to verify OTP. Please try again.')
    } finally {
      setDeleteOtpLoading(false)
    }
  }

  async function handleDeleteAccount() {
    const deleteReasonText = getDeleteReasonText()

    if (!deleteReasonText) {
      setDeleteFlowStep('reason')
      showToast.error('Please provide your reason for deletion first')
      return
    }

    if (!deleteOtpVerified) {
      showToast.error('Please verify OTP first before deleting your account')
      return
    }

    if (!session?.access_token) {
      showToast.error('Session expired. Please sign in again.')
      return
    }

    setDeletingAccount(true)
    try {
      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: session.access_token,
          userId: session.user.id,
          deleteReason: deleteReasonText
        })
      })

      const data = await response.json()

      if (!response.ok) {
        showToast.error(data.error || 'Unable to delete account')
        return
      }

      showToast.success(data.message || 'Account deleted successfully')
      setDeleteModalOpen(false)
      resetDeleteModalState()

      await supabase.auth.signOut({ scope: 'global' })
      router.push('/')
    } catch (error) {
      console.error('Delete account error:', error)
      showToast.error('Failed to delete account. Please try again.')
    } finally {
      setDeletingAccount(false)
    }
  }

  // ── Subscription Functions (Tenant only) ──
  async function loadSubscription() {
    if (!session?.user?.id) return
    setLoadingSubscription(true)
    try {
      const res = await fetch(`/api/payments/subscriptions?tenant_id=${session.user.id}`)
      const data = await res.json()
      if (data.plan) setSubscriptionPlan(data.plan)

      // Load payment history
      const histRes = await fetch('/api/payments/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'payment-history', tenant_id: session.user.id })
      })
      const histData = await histRes.json()
      if (histData.payments) setSubscriptionPayments(histData.payments)
    } catch (err) {
      console.error('Error loading subscription:', err)
    }
    setLoadingSubscription(false)
  }

  async function handleBuySlot() {
    if (!session?.user?.id) return
    setBuyingSlot(true)
    try {
      const res = await fetch('/api/payments/subscription-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: session.user.id })
      })
      const data = await res.json()
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        showToast.error(data.error || 'Failed to create checkout')
      }
    } catch (err) {
      showToast.error('Failed to create checkout session')
      console.error(err)
    }
    setBuyingSlot(false)
  }

  async function confirmSubscriptionPayment(paymentId) {
    try {
      const res = await fetch('/api/payments/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm-payment',
          payment_id: paymentId,
          payment_method: 'paymongo_qrph'
        })
      })
      const data = await res.json()
      if (data.success) {
        showToast.success(data.message || 'Slot purchased successfully!')
        loadSubscription()
      }
    } catch (err) {
      console.error('Error confirming subscription payment:', err)
    }
  }

  async function cancelPendingPayments() {
    if (!session?.user?.id) return
    try {
      await fetch('/api/payments/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-payment', tenant_id: session.user.id })
      })
      showToast.info('Payment cancelled')
      loadSubscription()
    } catch (err) {
      console.error('Error cancelling pending payments:', err)
    }
  }

  const tabs = [
    {
      id: 'profile', label: 'General', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
      )
    },
    ...(profile?.role === 'landlord' ? [{
      id: 'payments', label: 'Payment Methods', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
      )
    }] : []),
    ...(profile?.role === 'tenant' ? [{
      id: 'subscription', label: 'Subscription', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
      )
    }] : []),
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

  const profileSkeletonFieldIndices = Array.from({ length: 6 }, (_, index) => index)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F4F5] font-sans text-gray-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-8 space-y-2">
            <div className="h-10 w-64 rounded bg-slate-200 skeleton-shimmer" />
            <div className="h-5 w-96 max-w-[90vw] rounded bg-slate-200 skeleton-shimmer" />
          </div>

          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="w-full md:w-64 flex-shrink-0">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-2 space-y-2">
                  <div className="h-11 w-full rounded-xl bg-slate-200 skeleton-shimmer" />
                  <div className="h-11 w-full rounded-xl bg-slate-200 skeleton-shimmer" />
                  <div className="h-11 w-full rounded-xl bg-slate-200 skeleton-shimmer" />
                  <div className="h-11 w-full rounded-xl bg-slate-200 skeleton-shimmer" />
                </div>
              </div>
            </div>

            <div className="flex-1 w-full">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
                <div className="flex items-center justify-between mb-6 gap-3">
                  <div className="h-8 w-48 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-6 w-24 rounded-full bg-slate-200 skeleton-shimmer" />
                </div>

                <div className="flex flex-col sm:flex-row gap-4 sm:items-center mb-8">
                  <div className="h-24 w-24 rounded-full bg-slate-200 skeleton-shimmer" />
                  <div className="space-y-2">
                    <div className="h-5 w-36 rounded bg-slate-200 skeleton-shimmer" />
                    <div className="h-4 w-52 rounded bg-slate-200 skeleton-shimmer" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {profileSkeletonFieldIndices.map((index) => (
                    <div key={`settings-profile-skeleton-${index}`} className="space-y-2">
                      <div className="h-4 w-28 rounded bg-slate-200 skeleton-shimmer" />
                      <div className="h-11 w-full rounded-xl bg-slate-200 skeleton-shimmer" />
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex justify-end">
                  <div className="h-11 w-36 rounded-xl bg-slate-200 skeleton-shimmer" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F5]">
        <div className="h-10 w-10 rounded-full bg-slate-200 skeleton-shimmer" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F3F4F5] font-sans text-gray-900">
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
                    onClick={() => {
                      setActiveTab(tab.id)
                      if (tab.id === 'subscription') loadSubscription()
                    }}
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
                      {profile?.role === 'landlord' && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <svg className="w-4 h-4 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                          <span className="text-sm font-bold text-gray-900">{landlordReviewStats.avg.toFixed(1)}</span>
                          <span className="text-xs text-gray-500">({landlordReviewStats.count} reviews)</span>
                        </div>
                      )}
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
                      Phone Number (Recommended)
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
                              <button type="button" onClick={handleSendVerification} disabled={otpLoading || phoneOtpCooldown > 0} className="flex-1 py-2 bg-black text-white rounded-lg font-bold text-sm hover:opacity-90 cursor-pointer disabled:opacity-60">{otpLoading ? 'Sending...' : (phoneOtpCooldown > 0 ? `Send again in ${formatCooldown(phoneOtpCooldown)}` : 'Send Code')}</button>
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
                              <button type="button" onClick={() => setOtpSent(false)} disabled={phoneOtpCooldown > 0} className="px-4 py-2 text-sm text-gray-500 hover:underline cursor-pointer disabled:opacity-50 disabled:no-underline">{phoneOtpCooldown > 0 ? `Resend in ${formatCooldown(phoneOtpCooldown)}` : 'Resend'}</button>
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

            {/* PAYMENT METHODS TAB (Landlord Only) */}
            {activeTab === 'payments' && profile?.role === 'landlord' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-xl font-bold mb-2">Payment Methods</h2>
                <p className="text-sm text-gray-500 mb-6">Manage your GCash and Maya numbers. Tenants will see these as payment options.</p>

                <div className="space-y-6">
                  {/* GCash Section */}
                  <div className={`p-5 rounded-2xl border-2 transition-all ${gcashVerified && !gcashEditing ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center font-bold text-lg">G</div>
                        <div>
                          <h3 className="font-bold">GCash</h3>
                          <p className="text-xs text-gray-500">Mobile wallet</p>
                        </div>
                      </div>
                      {gcashVerified && !gcashEditing && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">Verified</span>
                          <button type="button" onClick={() => { setGcashEditing(true); setGcashOtpSent(false); setGcashOtp('') }} className="text-xs font-bold text-gray-500 hover:text-black px-3 py-1 rounded-lg border border-gray-200 hover:border-gray-300 transition-all cursor-pointer">Change</button>
                        </div>
                      )}
                    </div>

                    {gcashVerified && !gcashEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-blue-100">
                          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                          <span className="font-bold text-gray-800 tracking-wide">{gcashNumber}</span>
                        </div>
                        {/* QR Code Display/Upload */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">QR Code (Optional)</label>
                          {gcashQrUrl ? (
                            <div className="relative group">
                              <img src={gcashQrUrl} alt="GCash QR" className="w-32 h-32 object-cover rounded-xl border-2 border-blue-100 shadow-sm" />
                              <button type="button" onClick={() => gcashQrRef.current?.click()} className="absolute inset-0 w-32 h-32 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold cursor-pointer">Replace</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => gcashQrRef.current?.click()} disabled={gcashQrUploading} className="w-32 h-32 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-all cursor-pointer disabled:opacity-50">
                              {gcashQrUploading ? <span className="text-xs animate-pulse">Uploading...</span> : <><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><span className="text-[10px] font-bold">Upload QR</span></>}
                            </button>
                          )}
                          <input ref={gcashQrRef} type="file" accept="image/*" onChange={e => handleQrUpload('gcash', e)} className="hidden" />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">GCash Number</label>
                          <input type="tel" value={gcashNumber} onChange={e => setGcashNumber(e.target.value)} placeholder="+63 9XX XXX XXXX" className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-0 transition-all font-medium" />
                        </div>
                        {!gcashOtpSent ? (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => handlePaymentOtpSend('gcash')} disabled={gcashOtpLoading || gcashOtpCooldown > 0} className="flex-1 py-2.5 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-50">{gcashOtpLoading ? 'Sending...' : (gcashOtpCooldown > 0 ? `Send again in ${formatCooldown(gcashOtpCooldown)}` : 'Send Verification Code')}</button>
                            {gcashEditing && <button type="button" onClick={() => setGcashEditing(false)} className="px-4 py-2.5 border border-gray-200 font-bold rounded-xl hover:bg-gray-50 cursor-pointer">Cancel</button>}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500">Enter the 6-digit code sent to {gcashNumber}</p>
                            <input type="text" value={gcashOtp} onChange={e => setGcashOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} className="w-full text-center tracking-widest text-xl font-bold py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 outline-none" placeholder="000000" />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => handlePaymentOtpVerify('gcash')} disabled={gcashOtpLoading} className="flex-1 py-2.5 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 cursor-pointer disabled:opacity-50">{gcashOtpLoading ? 'Verifying...' : 'Confirm'}</button>
                              <button type="button" onClick={() => handlePaymentOtpSend('gcash')} disabled={gcashOtpLoading || gcashOtpCooldown > 0} className="px-3 py-2.5 text-sm text-gray-500 hover:underline cursor-pointer disabled:opacity-50 disabled:no-underline">{gcashOtpCooldown > 0 ? `Resend in ${formatCooldown(gcashOtpCooldown)}` : 'Resend'}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Maya Section */}
                  <div className={`p-5 rounded-2xl border-2 transition-all ${mayaVerified && !mayaEditing ? 'border-green-200 bg-green-50/30' : 'border-gray-100'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-600 text-white rounded-xl flex items-center justify-center font-bold text-lg">M</div>
                        <div>
                          <h3 className="font-bold">Maya</h3>
                          <p className="text-xs text-gray-500">Digital payment</p>
                        </div>
                      </div>
                      {mayaVerified && !mayaEditing && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">Verified</span>
                          <button type="button" onClick={() => { setMayaEditing(true); setMayaOtpSent(false); setMayaOtp('') }} className="text-xs font-bold text-gray-500 hover:text-black px-3 py-1 rounded-lg border border-gray-200 hover:border-gray-300 transition-all cursor-pointer">Change</button>
                        </div>
                      )}
                    </div>

                    {mayaVerified && !mayaEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-green-100">
                          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                          <span className="font-bold text-gray-800 tracking-wide">{mayaNumber}</span>
                        </div>
                        {/* QR Code Display/Upload */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">QR Code (Optional)</label>
                          {mayaQrUrl ? (
                            <div className="relative group">
                              <img src={mayaQrUrl} alt="Maya QR" className="w-32 h-32 object-cover rounded-xl border-2 border-green-100 shadow-sm" />
                              <button type="button" onClick={() => mayaQrRef.current?.click()} className="absolute inset-0 w-32 h-32 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold cursor-pointer">Replace</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => mayaQrRef.current?.click()} disabled={mayaQrUploading} className="w-32 h-32 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-green-300 hover:text-green-500 transition-all cursor-pointer disabled:opacity-50">
                              {mayaQrUploading ? <span className="text-xs animate-pulse">Uploading...</span> : <><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><span className="text-[10px] font-bold">Upload QR</span></>}
                            </button>
                          )}
                          <input ref={mayaQrRef} type="file" accept="image/*" onChange={e => handleQrUpload('maya', e)} className="hidden" />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Maya Number</label>
                          <input type="tel" value={mayaNumber} onChange={e => setMayaNumber(e.target.value)} placeholder="+63 9XX XXX XXXX" className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-green-500 focus:ring-0 transition-all font-medium" />
                        </div>
                        {!mayaOtpSent ? (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => handlePaymentOtpSend('maya')} disabled={mayaOtpLoading || mayaOtpCooldown > 0} className="flex-1 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors cursor-pointer disabled:opacity-50">{mayaOtpLoading ? 'Sending...' : (mayaOtpCooldown > 0 ? `Send again in ${formatCooldown(mayaOtpCooldown)}` : 'Send Verification Code')}</button>
                            {mayaEditing && <button type="button" onClick={() => setMayaEditing(false)} className="px-4 py-2.5 border border-gray-200 font-bold rounded-xl hover:bg-gray-50 cursor-pointer">Cancel</button>}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500">Enter the 6-digit code sent to {mayaNumber}</p>
                            <input type="text" value={mayaOtp} onChange={e => setMayaOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} className="w-full text-center tracking-widest text-xl font-bold py-2.5 border-2 border-gray-200 rounded-xl focus:border-green-500 outline-none" placeholder="000000" />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => handlePaymentOtpVerify('maya')} disabled={mayaOtpLoading} className="flex-1 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 cursor-pointer disabled:opacity-50">{mayaOtpLoading ? 'Verifying...' : 'Confirm'}</button>
                              <button type="button" onClick={() => handlePaymentOtpSend('maya')} disabled={mayaOtpLoading || mayaOtpCooldown > 0} className="px-3 py-2.5 text-sm text-gray-500 hover:underline cursor-pointer disabled:opacity-50 disabled:no-underline">{mayaOtpCooldown > 0 ? `Resend in ${formatCooldown(mayaOtpCooldown)}` : 'Resend'}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cash - always enabled */}
                  <div className="p-4 rounded-2xl border-2 border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-900 text-white rounded-xl flex items-center justify-center font-bold text-lg">₱</div>
                      <div>
                        <h3 className="font-bold">Cash</h3>
                        <p className="text-xs text-gray-500">Always accepted — cannot be disabled</p>
                      </div>
                      <span className="ml-auto text-xs font-bold text-gray-600 bg-gray-200 px-3 py-1 rounded-full">Default</span>
                    </div>
                  </div>
                </div>
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
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="submit" disabled={passwordLoading || !newPassword || !currentPassword} className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer">
                        {passwordLoading ? 'Updating...' : 'Update Password'}
                      </button>

                      {(profile?.role === 'tenant' || profile?.role === 'landlord') && (
                        <button
                          type="button"
                          onClick={openDeleteAccountModal}
                          className="px-6 py-3 rounded-xl border border-red-300 text-red-600 font-bold hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          Delete Account
                        </button>
                      )}
                    </div>
                  </div>
                </form>

                <div className="mt-8 border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-bold uppercase text-gray-500 mb-1">Login Records</h3>
                  <p className="text-xs text-gray-400 mb-3">Showing your 3 latest sign-ins.</p>

                  {loadingLoginRecords ? (
                    <p className="text-sm text-gray-500">Loading login records...</p>
                  ) : loginRecords.length === 0 ? (
                    <p className="text-sm text-gray-500">No login records yet.</p>
                  ) : (
                    <div className="space-y-2 max-w-md">
                      {loginRecords.map((record) => (
                        <div key={record.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                          <span className="text-sm font-medium text-gray-700">{formatLoginTime(record.login_at)}</span>
                          <span className="text-xs font-bold uppercase text-gray-500">{record.provider || 'password'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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

            {/* SUBSCRIPTION TAB (Tenant Only) */}
            {activeTab === 'subscription' && profile?.role === 'tenant' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-bold">Family Member Subscription</h2>
                    <p className="text-sm text-gray-500 mt-1">Manage your family member slots. Your subscription is permanent and carries over across properties.</p>
                  </div>
                  <button onClick={loadSubscription} className="p-2 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer" title="Refresh">
                    <svg className={`w-5 h-5 text-gray-500 ${loadingSubscription ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
                </div>

                {loadingSubscription ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-black"></div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Current Plan Card */}
                    <div className={`p-6 rounded-2xl border-2 transition-all ${
                      subscriptionPlan?.paid_slots > 0
                        ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50'
                        : 'border-gray-100 bg-gradient-to-br from-gray-50 to-slate-50'
                    }`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          {/* <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${
                            subscriptionPlan?.paid_slots > 0
                              ? 'bg-emerald-500 text-white'
                              : 'bg-gray-200 text-gray-500'
                          }`}>
                            
                          </div> */}
                          <div>
                            <h3 className="font-bold text-lg">{subscriptionPlan?.paid_slots > 0 ? 'Paid Plan' : 'Free Plan'}</h3>
                            <p className="text-sm text-gray-500">
                              {subscriptionPlan?.paid_slots > 0
                                ? `${subscriptionPlan.paid_slots} extra slot(s) purchased`
                                : '1 free family member slot included'
                              }
                            </p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${
                          subscriptionPlan?.paid_slots > 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {subscriptionPlan?.type || 'free'}
                        </span>
                      </div>

                      {/* Slot Usage */}
                      <div className="grid grid-cols-3 gap-4 mt-4">
                        <div className="text-center p-3 bg-white/60 rounded-xl">
                          <p className="text-2xl font-black">{subscriptionPlan?.total_slots || 1}</p>
                          <p className="text-xs font-bold text-gray-500 mt-1">Total Slots</p>
                        </div>
                        <div className="text-center p-3 bg-white/60 rounded-xl">
                          <p className="text-2xl font-black text-blue-600">{subscriptionPlan?.used_slots || 0}</p>
                          <p className="text-xs font-bold text-gray-500 mt-1">Used</p>
                        </div>
                        <div className="text-center p-3 bg-white/60 rounded-xl">
                          <p className="text-2xl font-black text-emerald-600">{subscriptionPlan?.available_slots ?? (subscriptionPlan?.total_slots || 1)}</p>
                          <p className="text-xs font-bold text-gray-500 mt-1">Available</p>
                        </div>
                      </div>

                      {/* Slot Progress Bar */}
                      <div className="mt-4">
                        <div className="flex justify-between text-xs font-bold text-gray-500 mb-1">
                          <span>{subscriptionPlan?.used_slots || 0} / {subscriptionPlan?.total_slots || 1} slots used</span>
                          <span>Max: {subscriptionPlan?.max_slots || 4}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full transition-all duration-500 ${
                              (subscriptionPlan?.used_slots || 0) >= (subscriptionPlan?.total_slots || 1)
                                ? 'bg-red-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(((subscriptionPlan?.used_slots || 0) / (subscriptionPlan?.max_slots || 4)) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Buy Slot Button */}
                    {(subscriptionPlan?.total_slots || 1) < (subscriptionPlan?.max_slots || 4) && (
                      <div className="p-5 rounded-2xl border-2 border-dashed border-gray-200 hover:border-black transition-all">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold">Need more slots?</h4>
                            <p className="text-sm text-gray-500 mt-0.5">
                              Purchase an additional family member slot for <span className="font-bold text-black">₱{subscriptionPlan?.slot_price || 1}</span>
                            </p>
                          </div>
                          <button
                            onClick={handleBuySlot}
                            disabled={buyingSlot}
                            className="px-6 py-3 bg-black text-white font-bold rounded-xl hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
                          >
                            {buyingSlot ? (
                              <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div> Processing...</>
                            ) : (
                              <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg> Buy Slot</>
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-3">Payment via QR PH • Permanent • Carries over to new properties</p>
                      </div>
                    )}

                    {(subscriptionPlan?.total_slots || 1) >= (subscriptionPlan?.max_slots || 4) && (
                      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium flex items-center gap-2">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                        Maximum 4 family member slots reached.
                      </div>
                    )}

                    {/* Payment History — only show completed payments */}
                    {subscriptionPayments.filter(p => p.status === 'paid').length > 0 && (
                      <div>
                        <h3 className="font-bold text-sm uppercase text-gray-500 mb-3">Purchase History</h3>
                        <div className="space-y-2">
                          {subscriptionPayments.filter(p => p.status === 'paid').map(payment => (
                            <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm bg-emerald-100 text-emerald-600">
                                  ✓
                                </div>
                                <div>
                                  <p className="font-bold text-sm">+1 Family Slot</p>
                                  <p className="text-xs text-gray-500">{new Date(payment.paid_at || payment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold">₱{parseFloat(payment.amount).toFixed(2)}</p>
                                <p className="text-xs font-bold text-emerald-600">Paid</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {deleteModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-black text-gray-900">Delete Account?</h3>
              <p className="text-sm text-gray-500 mt-1">Flow: select reason, verify OTP, then confirm deletion.</p>
            </div>

            <div className="p-6 space-y-4 text-sm text-gray-700">
              <p>- Your account and related data will be permanently removed.</p>
              <p>- Tenants can delete only when there are no active property occupancies.</p>
              <p>- Landlords can delete only when there are no active tenants or occupied properties.</p>

              {deleteFlowStep === 'reason' ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <p className="font-bold text-gray-800">Step 1: Select your reason</p>
                  <p className="text-xs text-gray-600">Tell us why you want to delete your account.</p>

                  <div className="space-y-2">
                    {deleteReasonOptions.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${deleteReason === option.value ? 'border-black bg-white' : 'border-gray-200 bg-white/70 hover:border-gray-300'}`}
                      >
                        <input
                          type="radio"
                          name="delete-reason"
                          value={option.value}
                          checked={deleteReason === option.value}
                          onChange={(e) => setDeleteReason(e.target.value)}
                          className="h-4 w-4 accent-black"
                        />
                        <span className="text-sm font-medium text-gray-800">{option.label}</span>
                      </label>
                    ))}
                  </div>

                  {deleteReason === 'other' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Please specify your reason</label>
                      <textarea
                        value={deleteReasonDetails}
                        onChange={(e) => setDeleteReasonDetails(e.target.value)}
                        rows={3}
                        placeholder="Type your reason here"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-black"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <p className="font-bold text-gray-800">Step 2: Verify OTP</p>
                  <p className="text-xs text-gray-600">Reason: <span className="font-semibold text-gray-800">{getDeleteReasonText()}</span></p>
                  <p className="text-xs text-gray-600">OTP will be sent to: <span className="font-semibold text-gray-800">{session?.user?.email || 'your email'}</span></p>
                  <p className="text-xs text-gray-600">Resend is available every 2 minutes. Each OTP expires in 5 minutes or when a new OTP is requested.</p>

                  <button
                    type="button"
                    onClick={handleSendDeleteOtp}
                    disabled={deleteOtpLoading || deleteOtpCooldown > 0}
                    className="px-4 py-2 rounded-lg bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {deleteOtpLoading ? 'Sending...' : (deleteOtpSent ? (deleteOtpCooldown > 0 ? `Resend OTP in ${formatCooldown(deleteOtpCooldown)}` : 'Resend OTP') : 'Send OTP')}
                  </button>

                  {deleteOtpSent && (
                    <>
                      <input
                        type="text"
                        value={deleteOtpCode}
                        onChange={(e) => setDeleteOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Enter 6-digit OTP"
                        maxLength={6}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-center tracking-widest font-bold focus:outline-none focus:border-black"
                      />

                      <button
                        type="button"
                        onClick={handleVerifyDeleteOtp}
                        disabled={deleteOtpLoading || deleteOtpVerified}
                        className="px-4 py-2 rounded-lg border border-black text-black font-bold text-sm hover:bg-black hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {deleteOtpVerified ? 'OTP Verified' : (deleteOtpLoading ? 'Verifying...' : 'Verify OTP')}
                      </button>
                    </>
                  )}

                  {deleteOtpVerified && (
                    <p className="text-xs font-bold text-green-700">OTP verified. You can now confirm account deletion.</p>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 pt-0 flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteAccountModal}
                disabled={deletingAccount || deleteOtpLoading}
                className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60"
              >
                Cancel
              </button>
              {deleteFlowStep === 'reason' ? (
                <button
                  type="button"
                  onClick={handleDeleteReasonNext}
                  disabled={!isDeleteReasonValid()}
                  className="px-5 py-2.5 rounded-xl bg-black text-white font-bold hover:bg-gray-800 transition-colors cursor-pointer disabled:opacity-60"
                >
                  Next
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleDeleteReasonBack}
                    disabled={deletingAccount || deleteOtpLoading}
                    className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount || !deleteOtpVerified}
                    className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {deletingAccount ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}