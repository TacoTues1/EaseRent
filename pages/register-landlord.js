import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { showToast } from 'nextjs-toast-notify'

const STEPS = [
    { label: 'Business Info', icon: '1' },
    { label: 'Personal', icon: '2' },
    { label: 'Account', icon: '3' },
    { label: 'Payments', icon: '4' },
    { label: 'Verify Email', icon: '5' },
]

// Defined OUTSIDE the component so React doesn't remount on every re-render
const FormInput = ({ label, id, ...props }) => (
    <div className="group">
        <label htmlFor={id} className="block text-xs font-bold text-gray-700 mb-0.5 ml-1 group-focus-within:text-gray-900 transition-colors">{label}</label>
        <input id={id} {...props} className="appearance-none relative block w-full px-3 py-2.5 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all duration-300 hover:border-gray-400 focus:shadow-lg" />
    </div>
)

export default function RegisterLandlord() {
    const router = useRouter()
    const [step, setStep] = useState(0)
    const [mounted, setMounted] = useState(false)
    const [loading, setLoading] = useState(false)
    const isVerifyingRef = useRef(false)

    // Step 1
    const [businessName, setBusinessName] = useState('')
    const [firstName, setFirstName] = useState('')
    const [middleName, setMiddleName] = useState('')
    const [lastName, setLastName] = useState('')
    const [termsAccepted, setTermsAccepted] = useState(false)

    // Step 2
    const [birthday, setBirthday] = useState('')
    const [gender, setGender] = useState('')

    // Step 3
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)

    // Step 4 - Payment Methods
    const [gcashEnabled, setGcashEnabled] = useState(false)
    const [mayaEnabled, setMayaEnabled] = useState(false)
    const [gcashNumber, setGcashNumber] = useState('')
    const [gcashVerified, setGcashVerified] = useState(false)
    const [gcashOtpSent, setGcashOtpSent] = useState(false)
    const [gcashOtp, setGcashOtp] = useState('')
    const [gcashOtpLoading, setGcashOtpLoading] = useState(false)
    const [mayaNumber, setMayaNumber] = useState('')
    const [mayaVerified, setMayaVerified] = useState(false)
    const [mayaOtpSent, setMayaOtpSent] = useState(false)
    const [mayaOtp, setMayaOtp] = useState('')
    const [mayaOtpLoading, setMayaOtpLoading] = useState(false)
    const [mayaSameAsGcash, setMayaSameAsGcash] = useState(false)

    // Step 5 - Email OTP
    const [emailOtp, setEmailOtp] = useState('')
    const [emailOtpSent, setEmailOtpSent] = useState(false)
    const [useBrevoFallback, setUseBrevoFallback] = useState(false)

    useEffect(() => { setMounted(true) }, [])
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) router.push('/dashboard')
        })
    }, [router])

    // Auto-verify email OTP
    useEffect(() => {
        if (emailOtp.length === 6 && step === 4 && !loading && !isVerifyingRef.current) {
            isVerifyingRef.current = true
            const t = setTimeout(() => handleVerifyEmailOtp(), 300)
            return () => clearTimeout(t)
        }
        if (emailOtp.length < 6) isVerifyingRef.current = false
    }, [emailOtp, step, loading])

    const toast = (type, msg) => {
        showToast[type](msg, { duration: 4000, progress: true, position: 'top-right', transition: 'bounceIn', icon: '', sound: true })
    }

    // ── STEP NAVIGATION ──
    const nextStep = () => {
        if (step === 0) {
            if (!businessName.trim()) return toast('error', 'Business Name is required')
            if (!firstName.trim()) return toast('error', 'First Name is required')
            if (!lastName.trim()) return toast('error', 'Last Name is required')
            if (!termsAccepted) return toast('error', 'You must accept the Terms & Conditions')
        }
        if (step === 1) {
            if (!birthday) return toast('error', 'Please select your birthday')
            if (!gender) return toast('error', 'Please select your gender')
        }
        if (step === 2) {
            if (!email.trim()) return toast('error', 'Email is required')
            if (password.length < 6) return toast('error', 'Password must be at least 6 characters')
            if (password !== confirmPassword) return toast('error', 'Passwords do not match')
        }
        if (step === 3) {
            if (gcashEnabled && !gcashVerified) return toast('error', 'Please verify your GCash number')
            if (mayaEnabled && !mayaVerified) return toast('error', 'Please verify your Maya number')
        }
        setStep(s => s + 1)
        // Auto-send email OTP when reaching step 5
        if (step === 3) {
            setTimeout(() => handleSendEmailOtp(), 500)
        }
    }
    const prevStep = () => setStep(s => s - 1)

    // ── PHONE OTP (GCash / Maya) ──
    const handleSendPhoneOtp = async (type) => {
        const phone = type === 'gcash' ? gcashNumber : mayaNumber
        const setOtpLoading = type === 'gcash' ? setGcashOtpLoading : setMayaOtpLoading
        const setOtpSent = type === 'gcash' ? setGcashOtpSent : setMayaOtpSent
        if (!phone || phone.replace(/\D/g, '').length < 10) {
            return toast('error', `Please enter a valid ${type === 'gcash' ? 'GCash' : 'Maya'} number`)
        }
        setOtpLoading(true)
        try {
            const res = await fetch('/api/verify-phone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'send', phone })
            })
            const data = await res.json()
            if (!res.ok) { toast('error', data.error || 'Failed to send code'); return }
            setOtpSent(true)
            toast('success', `Verification code sent to your ${type === 'gcash' ? 'GCash' : 'Maya'} number!`)
        } catch { toast('error', 'Failed to send verification code') }
        finally { setOtpLoading(false) }
    }

    const handleVerifyPhoneOtp = async (type) => {
        const phone = type === 'gcash' ? gcashNumber : mayaNumber
        const code = type === 'gcash' ? gcashOtp : mayaOtp
        const setOtpLoading = type === 'gcash' ? setGcashOtpLoading : setMayaOtpLoading
        const setVerified = type === 'gcash' ? setGcashVerified : setMayaVerified
        const setOtpSent = type === 'gcash' ? setGcashOtpSent : setMayaOtpSent
        const setOtp = type === 'gcash' ? setGcashOtp : setMayaOtp
        if (!code || code.length < 6) { toast('error', 'Enter the 6-digit code'); return }
        setOtpLoading(true)
        try {
            const res = await fetch('/api/verify-phone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'verify', phone, code })
            })
            const data = await res.json()
            if (!res.ok) { toast('error', data.error || 'Verification failed'); setOtp(''); return }
            setVerified(true)
            setOtpSent(false)
            setOtp('')
            toast('success', `${type === 'gcash' ? 'GCash' : 'Maya'} number verified!`)
        } catch { toast('error', 'Verification failed') }
        finally { setOtpLoading(false) }
    }

    // ── EMAIL OTP ──
    const handleSendEmailOtp = async () => {
        setLoading(true)
        try {
            // Try Supabase signup first (sends OTP)
            const { data, error } = await supabase.auth.signUp({
                email, password,
                options: {
                    emailRedirectTo: window.location.origin,
                    data: {
                        first_name: firstName, middle_name: middleName || 'N/A',
                        last_name: lastName, birthday, gender
                    },
                },
            })
            if (error) {
                if (error.message.includes('already registered')) {
                    toast('error', 'This email is already registered. Please sign in instead.')
                    setLoading(false); return
                }
                // Rate limit exceeded -> use Brevo fallback
                if (error.message.toLowerCase().includes('rate') || error.message.toLowerCase().includes('limit') || error.message.toLowerCase().includes('exceeded')) {
                    setUseBrevoFallback(true)
                    const res = await fetch('/api/verify-email-otp', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'send', email })
                    })
                    const d = await res.json()
                    if (!res.ok) { toast('error', d.error || 'Failed to send code'); setLoading(false); return }
                    setEmailOtpSent(true)
                    toast('success', 'Verification code sent to your email! (via backup)')
                    setLoading(false); return
                }
                throw error
            }
            if (data.user) {
                setEmailOtpSent(true)
                toast('success', 'Check your email! We sent you a 6-digit verification code.')
            }
        } catch (err) { toast('error', err.message || 'Failed to send verification') }
        finally { setLoading(false) }
    }

    const handleVerifyEmailOtp = async () => {
        setLoading(true)
        try {
            if (useBrevoFallback) {
                // Verify with our custom API
                const res = await fetch('/api/verify-email-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'verify', email, code: emailOtp })
                })
                const d = await res.json()
                if (!res.ok) { toast('error', d.error || 'Invalid code'); setEmailOtp(''); isVerifyingRef.current = false; setLoading(false); return }
                // We need to actually create the user with Supabase (auto-confirm)
                // Since Supabase OTP was rate-limited, create user + profile directly
                const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
                    email, password,
                    options: { data: { first_name: firstName, middle_name: middleName || 'N/A', last_name: lastName, birthday, gender } }
                })
                // Even if rate limit hits again, email is verified via Brevo
                await finalizeRegistration(signUpData?.user)
            } else {
                // Verify via Supabase OTP
                const { data, error } = await supabase.auth.verifyOtp({ email, token: emailOtp, type: 'signup' })
                if (error) throw error
                if (data.user) await finalizeRegistration(data.user)
            }
        } catch (err) {
            toast('error', 'Invalid verification code. Please try again.')
            setEmailOtp('')
            isVerifyingRef.current = false
        } finally { setLoading(false) }
    }

    const finalizeRegistration = async (user) => {
        if (!user) { toast('error', 'Registration failed. Please try again.'); return }
        // Build accepted_payments JSON
        const acceptedPayments = { cash: true }
        if (gcashEnabled && gcashVerified) acceptedPayments.gcash = { number: gcashNumber, verified: true }
        if (mayaEnabled && mayaVerified) acceptedPayments.maya = { number: mayaNumber, verified: true }

        const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
        if (!existingProfile) {
            const { error: profileError } = await supabase.from('profiles').insert({
                id: user.id, first_name: firstName, middle_name: middleName || 'N/A',
                last_name: lastName, role: 'landlord', email, birthday, gender,
                business_name: businessName, accepted_payments: acceptedPayments
            })
            if (profileError && profileError.code !== '23505') {
                toast('error', 'Email verified but profile setup failed. Please contact support.'); return
            }
        } else {
            await supabase.from('profiles').update({
                role: 'landlord', business_name: businessName, accepted_payments: acceptedPayments
            }).eq('id', user.id)
        }
        toast('success', 'Registration successful! Redirecting...')
        setTimeout(() => router.push('/dashboard'), 1000)
    }

    const handleResendEmailOtp = async () => {
        setEmailOtp('')
        isVerifyingRef.current = false
        await handleSendEmailOtp()
    }

    // Maya same-as-gcash toggle
    useEffect(() => {
        if (mayaSameAsGcash && gcashVerified) {
            setMayaNumber(gcashNumber)
            setMayaVerified(true)
        } else if (!mayaSameAsGcash) {
            if (mayaNumber === gcashNumber) { setMayaNumber(''); setMayaVerified(false) }
        }
    }, [mayaSameAsGcash])

    // ── STEP CONTENTS ──
    const renderStep = () => {
        switch (step) {
            case 0: return renderStep1()
            case 1: return renderStep2()
            case 2: return renderStep3()
            case 3: return renderStep4()
            case 4: return renderStep5()
        }
    }

    const renderStep1 = () => (
        <div className="space-y-3">
            <FormInput label="Business Name *" id="business-name" type="text" required value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Your business name" />
            <div className="flex gap-2">
                <div className="w-1/2"><FormInput label="First Name *" id="first-name" type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" /></div>
                <div className="w-1/2"><FormInput label="Middle Name" id="middle-name" type="text" value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="(Optional)" /></div>
            </div>
            <FormInput label="Last Name *" id="last-name" type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
            <div className="flex items-center pt-1">
                <input id="terms" type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} className="h-4 w-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900 cursor-pointer accent-gray-900" />
                <label htmlFor="terms" className="ml-2 text-xs font-medium text-gray-700 cursor-pointer">
                    I agree to the{' '}<Link href="/terms" target="_blank" className="font-bold text-gray-900 hover:underline">Terms & Conditions</Link>
                </label>
            </div>
        </div>
    )

    const renderStep2 = () => (
        <div className="space-y-3">
            <FormInput label="Birthday *" id="birthday" type="date" required value={birthday} onChange={e => setBirthday(e.target.value)} />
            <div className="group">
                <label htmlFor="gender" className="block text-xs font-bold text-gray-700 mb-0.5 ml-1">Gender *</label>
                <div className="relative">
                    <select id="gender" required value={gender} onChange={e => setGender(e.target.value)} className="appearance-none relative block w-full px-3 py-2.5 border border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all duration-300 bg-white cursor-pointer hover:border-gray-400 focus:shadow-lg">
                        <option value="" disabled>Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Prefer not to say">Other</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                        <svg className="fill-current h-3 w-3" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                    </div>
                </div>
            </div>
        </div>
    )

    const renderStep3 = () => (
        <div className="space-y-3">
            <FormInput label="Email Address *" id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
            <div className="group">
                <label htmlFor="password" className="block text-xs font-bold text-gray-700 mb-0.5 ml-1">Password *</label>
                <div className="relative">
                    <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" minLength={6}
                        className="appearance-none relative block w-full px-3 py-2.5 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all duration-300 pr-9 hover:border-gray-400 focus:shadow-lg" />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 z-20 cursor-pointer" onClick={() => setShowPassword(!showPassword)} onMouseDown={e => e.preventDefault()}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showPassword ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" : "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} /></svg>
                    </button>
                </div>
            </div>
            <div className="group">
                <label htmlFor="confirm-password" className="block text-xs font-bold text-gray-700 mb-0.5 ml-1">Confirm Password *</label>
                <div className="relative">
                    <input id="confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" minLength={6}
                        className="appearance-none relative block w-full px-3 py-2.5 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all duration-300 pr-9 hover:border-gray-400 focus:shadow-lg" />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 z-20 cursor-pointer" onClick={() => setShowConfirmPassword(!showConfirmPassword)} onMouseDown={e => e.preventDefault()}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showConfirmPassword ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" : "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} /></svg>
                    </button>
                </div>
            </div>
        </div>
    )

    const renderPhoneOtpBlock = (type, number, setNumber, verified, otpSent, otp, setOtp, otpLoading, label) => (
        <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
            {!verified ? (
                <>
                    <FormInput label={`${label} Number *`} id={`${type}-number`} type="tel" value={number} onChange={e => setNumber(e.target.value)} placeholder="+63 9XX XXX XXXX" />
                    {!otpSent ? (
                        <button type="button" onClick={() => handleSendPhoneOtp(type)} disabled={otpLoading} className="w-full py-2 bg-gray-900 text-white rounded-lg font-bold text-sm hover:bg-gray-800 cursor-pointer disabled:opacity-50">
                            {otpLoading ? 'Sending...' : `Send Verification Code`}
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-xs text-gray-500">Enter the 6-digit code sent to your phone.</p>
                            <input type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} className="w-full text-center tracking-widest text-lg font-bold py-2 border-2 border-gray-200 rounded-lg focus:border-gray-900 outline-none" placeholder="000000" />
                            <div className="flex gap-2">
                                <button type="button" onClick={() => handleVerifyPhoneOtp(type)} disabled={otpLoading} className="flex-1 py-2 bg-gray-900 text-white rounded-lg font-bold text-sm cursor-pointer disabled:opacity-50">
                                    {otpLoading ? 'Verifying...' : 'Confirm'}
                                </button>
                                <button type="button" onClick={() => handleSendPhoneOtp(type)} disabled={otpLoading} className="px-3 py-2 text-sm text-gray-500 hover:underline cursor-pointer">Resend</button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="flex items-center gap-2 text-green-600 font-bold text-sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    {number} — Verified ✓
                </div>
            )}
        </div>
    )

    const renderStep4 = () => (
        <div className="space-y-3">
            <p className="text-xs text-gray-500 font-medium">Select your accepted payment methods. Cash is always included.</p>

            {/* Cash - always selected */}
            <div className="flex items-center gap-3 p-3.5 rounded-xl border-2 border-gray-900 bg-gray-900/5 cursor-default transition-all">
                <div className="w-5 h-5 rounded-full border-2 border-gray-900 flex items-center justify-center flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-900" />
                </div>
                <div className="w-8 h-8 bg-gray-900 text-white rounded-lg flex items-center justify-center font-bold text-sm">₱</div>
                <div className="flex-1"><p className="font-bold text-sm text-gray-900">Cash</p><p className="text-xs text-gray-500">Always accepted</p></div>
                <span className="text-[10px] font-bold text-gray-900 bg-gray-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Default</span>
            </div>

            {/* GCash */}
            <div
                onClick={() => { if (!gcashVerified) { setGcashEnabled(!gcashEnabled); if (gcashEnabled) { setGcashVerified(false); setGcashOtpSent(false); setGcashOtp(''); setGcashNumber('') } } }}
                className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${gcashEnabled ? 'border-blue-500 bg-blue-50/40 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${gcashEnabled ? 'border-blue-500' : 'border-gray-300'}`}>
                        {gcashEnabled && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                    </div>
                    <div className="w-8 h-8 bg-blue-500 text-white rounded-lg flex items-center justify-center font-bold text-xs">G</div>
                    <div className="flex-1"><p className="font-bold text-sm text-gray-900">GCash</p><p className="text-xs text-gray-500">Mobile wallet</p></div>
                    {gcashVerified && <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Verified ✓</span>}
                </div>
                {gcashEnabled && <div onClick={e => e.stopPropagation()}>{renderPhoneOtpBlock('gcash', gcashNumber, setGcashNumber, gcashVerified, gcashOtpSent, gcashOtp, setGcashOtp, gcashOtpLoading, 'GCash')}</div>}
            </div>

            {/* Maya */}
            <div
                onClick={() => { if (!mayaVerified) { setMayaEnabled(!mayaEnabled); if (mayaEnabled) { setMayaVerified(false); setMayaOtpSent(false); setMayaOtp(''); setMayaNumber(''); setMayaSameAsGcash(false) } } }}
                className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${mayaEnabled ? 'border-green-500 bg-green-50/40 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${mayaEnabled ? 'border-green-500' : 'border-gray-300'}`}>
                        {mayaEnabled && <div className="w-2.5 h-2.5 rounded-full bg-green-500" />}
                    </div>
                    <div className="w-8 h-8 bg-green-600 text-white rounded-lg flex items-center justify-center font-bold text-xs">M</div>
                    <div className="flex-1"><p className="font-bold text-sm text-gray-900">Maya</p><p className="text-xs text-gray-500">Digital payment</p></div>
                    {mayaVerified && <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Verified ✓</span>}
                </div>
                {mayaEnabled && (
                    <div onClick={e => e.stopPropagation()}>
                        {gcashVerified && (
                            <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <input type="checkbox" id="maya-same" checked={mayaSameAsGcash} onChange={e => setMayaSameAsGcash(e.target.checked)} className="h-4 w-4 accent-gray-900 cursor-pointer" />
                                <label htmlFor="maya-same" className="text-xs font-medium text-gray-700 cursor-pointer">Use same number as GCash ({gcashNumber})</label>
                            </div>
                        )}
                        {!mayaSameAsGcash && renderPhoneOtpBlock('maya', mayaNumber, setMayaNumber, mayaVerified, mayaOtpSent, mayaOtp, setMayaOtp, mayaOtpLoading, 'Maya')}
                        {mayaSameAsGcash && mayaVerified && (
                            <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="flex items-center gap-2 text-green-600 font-bold text-sm">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    {mayaNumber} — Auto-verified ✓
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )

    const renderStep5 = () => (
        <div className="space-y-4 text-center">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-3xl">✉️</div>
            <div>
                <h3 className="font-bold text-gray-900">Verify Your Email</h3>
                <p className="text-sm text-gray-500 mt-1">We sent a 6-digit code to</p>
                <p className="font-bold text-gray-900 text-sm">{email}</p>
            </div>
            <div>
                <input type="text" value={emailOtp} onChange={e => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} autoFocus
                    className="w-full text-center tracking-widest text-2xl font-bold py-3 border-2 border-gray-200 rounded-xl focus:border-gray-900 outline-none transition-all" placeholder="000000" />
            </div>
            <button type="button" onClick={() => { isVerifyingRef.current = true; handleVerifyEmailOtp() }} disabled={loading || emailOtp.length !== 6}
                className="w-full py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white font-bold rounded-xl hover:from-gray-800 hover:to-gray-700 shadow-lg transition-all disabled:opacity-50 cursor-pointer">
                {loading ? 'Verifying...' : 'Verify & Complete Registration'}
            </button>
            <div className="flex flex-col items-center gap-2">
                <button type="button" onClick={handleResendEmailOtp} disabled={loading} className="text-sm font-bold text-gray-900 hover:underline cursor-pointer disabled:opacity-50">Resend code</button>
                <button type="button" onClick={() => { setStep(3); setEmailOtp(''); isVerifyingRef.current = false }} className="text-sm text-gray-500 hover:text-gray-900 hover:underline cursor-pointer">← Back</button>
            </div>
        </div>
    )

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 font-sans text-black flex items-center justify-center">
            <style jsx>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(30px) } to { opacity:1; transform:translateY(0) } }
        @keyframes scaleIn { from { opacity:0; transform:scale(0.9) } to { opacity:1; transform:scale(1) } }
        .animate-fadeInUp { animation: fadeInUp 0.6s ease-out forwards }
        .animate-scaleIn { animation: scaleIn 0.5s ease-out forwards }
        .delay-100{animation-delay:.1s}.delay-200{animation-delay:.2s}.delay-300{animation-delay:.3s}.delay-400{animation-delay:.4s}.delay-500{animation-delay:.5s}
      `}</style>

            {/* Back to Home - top left */}
            <div className={`fixed top-4 left-4 z-20 ${mounted ? 'animate-fadeInUp' : 'opacity-0'}`}>
                <button onClick={() => router.push('/')} className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full shadow-md border border-gray-200 font-bold text-sm cursor-pointer hover:shadow-lg hover:scale-105 active:scale-95 transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    <span>Back to Home</span>
                </button>
            </div>

            <div className="w-full max-w-lg mx-auto p-4 sm:p-6 my-8 overflow-y-auto max-h-screen">
                <div className={`space-y-4 ${mounted ? 'animate-scaleIn' : 'opacity-0'}`}>
                    {/* Logo */}
                    <div className="text-center">
                        <div className={`mx-auto flex items-center justify-center gap-3 mb-2 cursor-pointer transition-all duration-300 ${mounted ? 'animate-fadeInUp delay-100' : 'opacity-0'}`} onClick={() => router.push('/')}>
                            <img src="/home.png" alt="Abalay Logo" className="w-14 h-14 object-contain" />
                            <span className="text-3xl font-black text-gray-900">Abalay</span>
                        </div>
                        <h2 className="text-lg font-black text-gray-900 tracking-tight">Landlord Registration</h2>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center justify-between px-2">
                        {STEPS.map((s, i) => (
                            <div key={i} className="flex items-center">
                                <div className={`flex flex-col items-center`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-gray-900 text-white shadow-lg scale-110' : 'bg-gray-200 text-gray-500'}`}>
                                        {i < step ? '✓' : s.icon}
                                    </div>
                                    <span className={`text-[9px] font-bold mt-0.5 ${i === step ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</span>
                                </div>
                                {i < STEPS.length - 1 && <div className={`w-6 sm:w-8 h-0.5 mx-0.5 mt-[-12px] transition-all ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />}
                            </div>
                        ))}
                    </div>

                    {/* Step Content */}
                    <div className="min-h-[200px]" key={step}>
                        {renderStep()}
                    </div>

                    {/* Navigation Buttons */}
                    {step < 4 && (
                        <div className="flex gap-2 pt-1">
                            {step > 0 && (
                                <button type="button" onClick={prevStep} className="px-5 py-2.5 border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-all cursor-pointer text-sm">Back</button>
                            )}
                            <button type="button" onClick={nextStep} disabled={loading}
                                className="flex-1 py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white font-bold rounded-xl hover:from-gray-800 hover:to-gray-700 shadow-lg hover:shadow-xl transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 text-sm">
                                {step === 3 ? 'Continue to Verification' : 'Next'}
                            </button>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="text-center pt-1">
                        <p className="text-xs text-gray-500 font-medium">
                            Already have an account?{' '}<Link href="/login" className="font-bold text-gray-900 hover:text-gray-700 hover:underline transition-all duration-300">Sign in</Link>
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                            Register as a tenant?{' '}<Link href="/register" className="font-bold text-gray-600 hover:text-gray-900 hover:underline transition-all duration-300">Click here</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
