import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { showToast } from 'nextjs-toast-notify'

export default function Register() {
  // Form States
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [otp, setOtp] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [currentSlide, setCurrentSlide] = useState(0)
  const isVerifyingRef = useRef(false) // Prevent double-triggering auto-verification
  const router = useRouter()

  const heroImages = [
    '/logo_login.jpg',
    '/image1.png',
    '/image2.png',
  ]

  const slideContent = [
    { heading: 'Start Your Journey', description: 'Join thousands of happy tenants who found their perfect home through Abalay. Your dream rental is just a few clicks away.' },
    { heading: 'Find Your Perfect Home', description: 'Browse through curated rental listings and connect with trusted landlords for a seamless renting experience.' },
    { heading: 'Secure & Reliable', description: 'Pay rent securely through multiple payment channels including GCash, Maya, and credit cards.' },
  ]

  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-slide timer
  useEffect(() => {
    if (heroImages.length <= 1) return
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroImages.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [heroImages.length])

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/dashboard')
    })
  }, [router])

  // Auto-verify when OTP reaches 6 digits
  useEffect(() => {
    if (otp.length === 6 && showOtpInput && !loading && !isVerifyingRef.current) {
      isVerifyingRef.current = true
      // Small delay to let the user see the last digit before verification starts
      const timer = setTimeout(() => {
        handleAutoVerifyOtp()
      }, 300)
      return () => clearTimeout(timer)
    }
    if (otp.length < 6) {
      isVerifyingRef.current = false
    }
  }, [otp, showOtpInput, loading])

  // Step 1: Sign Up
  const handleRegister = async (e) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)

    if (!termsAccepted) {
      showToast.error("You must accept the Terms & Conditions to continue.", { duration: 4000 });
      setLoading(false); return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      showToast.error("Passwords do not match", {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      setLoading(false)
      return
    }

    // Validate password strength (matching AuthModal logic)
    if (password.length < 6) {
      showToast.error("Password must be at least 6 characters long", {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      setLoading(false)
      return
    }

    // Validate Gender selection
    if (!gender) {
      showToast.error("Please select a gender", {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      setLoading(false)
      return
    }

    if (!birthday) {
      showToast.error("Please select a birthday", {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            first_name: firstName,
            middle_name: middleName || 'N/A',
            last_name: lastName,
            birthday: birthday,
            gender: gender
          },
        },
      })

      if (error) {
        if (error.message.includes('already registered')) {
          throw new Error('This email is already registered. Please sign in instead.')
        }
        throw error
      }

      // If successful, show OTP input
      if (data.user) {
        setShowOtpInput(true)
        showToast.success("Check your email! We sent you a 6-digit verification code.", {
          duration: 4000,
          progress: true,
          position: "top-right",
          transition: "bounceIn",
          icon: '',
          sound: true,
        });
      }

    } catch (error) {
      showToast.error(error.message, {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });

    } finally {
      setLoading(false)
    }
  }

  // Auto-verification function (no event parameter)
  const handleAutoVerifyOtp = async () => {
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'signup'
      })

      if (error) throw error

      if (data.user) {
        // Create Profile (Logic from AuthModal.js)
        const { data: existingProfile, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle()

        if (!existingProfile) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            first_name: firstName,
            middle_name: middleName || 'N/A',
            last_name: lastName,
            role: 'tenant',
            email: email,
            birthday: birthday,
            gender: gender
          })

          // Ignore duplicate key errors if profile was created by a trigger
          if (profileError && profileError.code !== '23505') {
            throw new Error('Email verified but profile setup failed. Please contact support.')
          }
        }

        showToast.success("Email verified successfully! Redirecting...", {
          duration: 4000,
          progress: true,
          position: "top-right",
          transition: "bounceIn",
          icon: '',
          sound: true,
        });

        setTimeout(() => {
          router.push('/dashboard')
        }, 1000)
      }
    } catch (error) {
      showToast.error("Invalid verification code. Please try again.", {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      setOtp('') // Clear OTP field on error to prevent loop
      isVerifyingRef.current = false // Allow retry on error
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Verify OTP (Manual form submission)
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    if (isVerifyingRef.current) return // Prevent double submission
    isVerifyingRef.current = true
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'signup'
      })

      if (error) throw error

      if (data.user) {
        // Create Profile (Logic from AuthModal.js)
        const { data: existingProfile, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle()

        if (!existingProfile) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            first_name: firstName,
            middle_name: middleName || 'N/A',
            last_name: lastName,
            role: 'tenant',
            email: email,
            birthday: birthday,
            gender: gender
          })

          // Ignore duplicate key errors if profile was created by a trigger
          if (profileError && profileError.code !== '23505') {
            throw new Error('Email verified but profile setup failed. Please contact support.')
          }
        }

        showToast.success("Email verified successfully! Redirecting...", {
          duration: 4000,
          progress: true,
          position: "top-right",
          transition: "bounceIn",
          icon: '',
          sound: true,
        });

        setTimeout(() => {
          router.push('/dashboard')
        }, 1000)
      }
    } catch (error) {
      showToast.error("Invalid verification code. Please try again.", {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      setOtp('') // Clear OTP field on error to prevent loop
      isVerifyingRef.current = false // Allow retry on error
    } finally {
      setLoading(false)
    }
  }

  // Resend OTP
  const handleResendOtp = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      })
      if (error) throw error
      showToast.success("Verification code resent! Check your email.", {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
    } catch (error) {
      showToast.error("Resend failed, Please Try again!", {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-[#F3F4F5] font-sans text-black flex">
      {/* Custom animations */}
      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        /* Floating label styles */
        .float-label { position: relative; }
        .float-label input:not([type='date']) { padding-top: 1.15rem; padding-bottom: 0.35rem; }
        .float-label > label,
        .float-label > div > label {
          position: absolute;
          left: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          color: #9CA3AF;
          font-size: 0.8rem;
          font-weight: 500;
          pointer-events: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          transform-origin: left center;
          z-index: 10;
        }
        .float-label input:focus ~ label,
        .float-label input:not(:placeholder-shown) ~ label,
        .float-label > div > input:focus ~ label,
        .float-label > div > input:not(:placeholder-shown) ~ label {
          top: 0.45rem;
          transform: translateY(0);
          font-size: 0.6rem;
          font-weight: 700;
          color: #1F2937;
        }
        .animate-fadeInUp { animation: fadeInUp 0.6s ease-out forwards; }
        .animate-fadeInLeft { animation: fadeInLeft 0.6s ease-out forwards; }
        .animate-fadeInRight { animation: fadeInRight 0.6s ease-out forwards; }
        .animate-scaleIn { animation: scaleIn 0.5s ease-out forwards; }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-400 { animation-delay: 0.4s; }
        .delay-500 { animation-delay: 0.5s; }
      `}</style>

      {/* --- LEFT PANEL: HERO IMAGE (only this has border radius) --- */}
      <div className={`hidden lg:block lg:w-[55%] xl:w-[58%] h-full p-3 ${mounted ? 'animate-fadeInLeft' : 'opacity-0'}`}>
        <div className="relative w-full h-full rounded-3xl overflow-hidden">
          {/* Sliding Background Images */}
          {heroImages.map((img, index) => (
            <img
              key={index}
              src={img}
              alt={`Property ${index + 1}`}
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ease-in-out ${index === currentSlide
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-110'
                }`}
            />
          ))}
          {/* Bottom gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

          {/* Top-Left Brand */}
          <div className="absolute top-6 left-6 z-10">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2.5 bg-white/15 backdrop-blur-md px-4 py-2 rounded-full hover:bg-white/25 transition-all cursor-pointer"
            >
              <img src="/home.png" alt="Logo" className="w-6 h-6 object-contain" />
              <span className="text-white font-bold text-sm">Abalay</span>
            </button>
          </div>

          {/* Bottom Content — synced with current slide */}
          <div className="absolute bottom-0 left-0 right-0 p-8 z-10">
            <h2 className="text-2xl font-bold text-white mb-2 transition-all duration-500">
              {slideContent[currentSlide]?.heading || slideContent[0].heading}
            </h2>
            <p className="text-white/70 text-sm leading-relaxed max-w-sm transition-all duration-500">
              {slideContent[currentSlide]?.description || slideContent[0].description}
            </p>
            {/* Slide indicator dots */}
            <div className="flex gap-2 mt-5">
              {heroImages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`rounded-full transition-all duration-500 cursor-pointer ${index === currentSlide
                    ? 'w-8 h-1.5 bg-white'
                    : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/60'
                    }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* --- RIGHT PANEL: REGISTER FORM --- */}
      <div className={`w-full lg:w-[45%] xl:w-[42%] h-full flex flex-col bg-[#F5F5F5] ${mounted ? 'animate-fadeInRight' : 'opacity-0'}`}>

        {/* Form Content */}
        <div className="flex-1 flex items-center justify-center px-4 sm:px-8 lg:px-10 overflow-y-auto">
          <div className={`w-full max-w-md space-y-4 py-6 ${mounted ? 'animate-scaleIn' : 'opacity-0'}`}>

            {/* Logo + Brand */}
            <div className="text-center">
              <div className={`mx-auto flex items-center justify-center gap-3 mb-2 cursor-pointer transition-all duration-300 ${mounted ? 'animate-fadeInUp delay-100' : 'opacity-0'}`} onClick={() => router.push('/')}>
                <img src="/home.png" alt="Abalay Logo" className="w-14 h-14 object-contain" />
                <span className="text-3xl font-black text-gray-900">Abalay</span>
              </div>
              <p className={`text-sm text-gray-500 font-medium ${mounted ? 'animate-fadeInUp delay-200' : 'opacity-0'}`}>
                {showOtpInput ? `Enter the 6-digit code sent to ${email}` : 'Create your Abalay account'}
              </p>
            </div>

            {/* Conditional Rendering: OTP Form vs Registration Form */}
            {showOtpInput ? (
              /* --- OTP FORM --- */
              <form className={`mt-4 space-y-4 ${mounted ? 'animate-fadeInUp delay-300' : 'opacity-0'}`} onSubmit={handleVerifyOtp}>
                <div>
                  <label htmlFor="otp" className="block text-sm font-bold text-gray-800 mb-1.5 ml-0.5">
                    Verification Code
                  </label>
                  <input
                    id="otp"
                    name="otp"
                    type="text"
                    required
                    autoFocus
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-center text-2xl tracking-widest font-medium transition-all duration-300 hover:border-gray-400 bg-white"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                >
                  {loading ? 'Verifying...' : 'Verify Email'}
                </button>

                <div className="flex flex-col items-center space-y-2">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="text-sm font-bold text-gray-900 hover:underline cursor-pointer disabled:opacity-50 transition-all"
                  >
                    Resend code
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowOtpInput(false); setOtp('') }}
                    className="text-sm text-gray-500 hover:text-gray-900 hover:underline cursor-pointer transition-all"
                  >
                    ← Back to sign up
                  </button>
                </div>
              </form>
            ) : (
              /* --- REGISTRATION FORM --- */
              <form className={`mt-3 space-y-3 ${mounted ? 'animate-fadeInUp delay-300' : 'opacity-0'}`} onSubmit={handleRegister}>
                <div className="space-y-3">

                  {/* First Name & Middle Name */}
                  <div className="flex gap-2">
                    <div className="w-1/2 float-label">
                      <input
                        id="first-name"
                        name="firstName"
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="appearance-none block w-full px-3 border border-gray-300 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all hover:border-gray-400 bg-white"
                        placeholder=" "
                      />
                      <label htmlFor="first-name">First Name</label>
                    </div>
                    <div className="w-1/2 float-label">
                      <input
                        id="middle-name"
                        name="middleName"
                        type="text"
                        value={middleName}
                        onChange={(e) => setMiddleName(e.target.value)}
                        className="appearance-none block w-full px-3 border border-gray-300 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all hover:border-gray-400 bg-white"
                        placeholder=" "
                      />
                      <label htmlFor="middle-name">Middle Name (Optional)</label>
                    </div>
                  </div>

                  {/* Last Name */}
                  <div className="float-label">
                    <input
                      id="last-name"
                      name="lastName"
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="appearance-none block w-full px-3 border border-gray-300 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all hover:border-gray-400 bg-white"
                      placeholder=" "
                    />
                    <label htmlFor="last-name">Last Name</label>
                  </div>

                  {/* Birthday & Gender */}
                  <div className="flex gap-2">
                    <div className="w-1/2">
                      <label htmlFor="birthday" className="block text-xs font-bold text-gray-800 mb-1 ml-0.5">
                        Birthday
                      </label>
                      <input
                        id="birthday"
                        name="birthday"
                        type="date"
                        required
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                        className="appearance-none block w-full px-3 py-2.5 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all cursor-pointer hover:border-gray-400 bg-white"
                      />
                    </div>
                    <div className="w-1/2">
                      <label htmlFor="gender" className="block text-xs font-bold text-gray-800 mb-1 ml-0.5">
                        Gender
                      </label>
                      <div className="relative">
                        <select
                          id="gender"
                          name="gender"
                          required
                          value={gender}
                          onChange={(e) => setGender(e.target.value)}
                          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all bg-white cursor-pointer hover:border-gray-400"
                        >
                          <option value="" disabled>Select</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Prefer not to say">Other</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                          <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="float-label">
                    <input
                      id="email-address"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="appearance-none block w-full px-3 border border-gray-300 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all hover:border-gray-400 bg-white"
                      placeholder=" "
                    />
                    <label htmlFor="email-address">Email address</label>
                  </div>

                  {/* Password Row */}
                  <div className="flex gap-2">
                    <div className="w-1/2 float-label">
                      <div className="relative">
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="appearance-none block w-full px-3 border border-gray-300 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all pr-9 hover:border-gray-400 bg-white"
                          placeholder=" "
                          minLength={6}
                        />
                        <label htmlFor="password">Password</label>
                        <button
                          type="button"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors z-20"
                          onClick={() => setShowPassword(!showPassword)}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {showPassword ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="w-1/2 float-label">
                      <div className="relative">
                        <input
                          id="confirm-password"
                          name="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="appearance-none block w-full px-3 border border-gray-300 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm font-medium transition-all pr-9 hover:border-gray-400 bg-white"
                          placeholder=" "
                          minLength={6}
                        />
                        <label htmlFor="confirm-password">Confirm Password</label>
                        <button
                          type="button"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors z-20"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {showConfirmPassword ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Terms Checkbox */}
                <div className="flex items-center">
                  <input
                    id="terms"
                    name="terms"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="h-4 w-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900 cursor-pointer accent-gray-900"
                  />
                  <label htmlFor="terms" className="ml-2 text-xs font-medium text-gray-700 cursor-pointer">
                    I agree to the{' '}
                    <Link href="/terms" target="_blank" className="font-bold text-gray-900 hover:underline transition-all">
                      Terms & Conditions
                    </Link>
                  </label>
                </div>

                {/* Create Account Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                >
                  {loading && (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {loading ? 'Creating account...' : 'Create account'}
                </button>
              </form>
            )}

            {/* Sign In Link */}
            <div className={`text-center pt-1 ${mounted ? 'animate-fadeInUp delay-500' : 'opacity-0'}`}>
              <p className="text-sm text-gray-500 font-medium">
                Already have an account?{' '}
                <Link href="/login" className="font-bold text-gray-900 hover:text-gray-700 hover:underline transition-all duration-300">
                  Sign in
                </Link>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Register as a landlord?{' '}
                <Link href="/register-landlord" className="font-bold text-gray-600 hover:text-gray-900 hover:underline transition-all duration-300">
                  Click here
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}