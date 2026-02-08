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
  const isVerifyingRef = useRef(false) // Prevent double-triggering auto-verification
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

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
    <div className="h-screen overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 font-sans text-black flex">
      {/* Custom animations */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeInLeft {
          from {
            opacity: 0;
            transform: translateX(-30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        @keyframes slideInStats {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.6s ease-out forwards;
        }
        .animate-fadeInLeft {
          animation: fadeInLeft 0.6s ease-out forwards;
        }
        .animate-scaleIn {
          animation: scaleIn 0.5s ease-out forwards;
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        .animate-slideInStats {
          animation: slideInStats 0.6s ease-out forwards;
        }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-400 { animation-delay: 0.4s; }
        .delay-500 { animation-delay: 0.5s; }
      `}</style>

      {/* --- LEFT PANEL: HERO IMAGE --- */}
      <div className="hidden lg:flex lg:w-[55%] xl:w-[60%] h-full relative overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src="/logo_login.jpg"
            alt="EaseRent Hero"
            className={`w-full h-full object-cover transition-all duration-1000 ${mounted ? 'scale-100 opacity-100' : 'scale-110 opacity-0'}`}
          />
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30"></div>
        </div>

        {/* Content on top of image */}
        <div className="relative z-10 flex flex-col justify-between p-8 xl:p-12 w-full h-full">
          {/* Logo/Brand */}
          <div className={`${mounted ? 'animate-fadeInLeft' : 'opacity-0'}`}>
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-3 text-white/90 hover:text-white transition-all duration-300 group"
            >
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center group-hover:bg-white/30 group-hover:scale-110 transition-all duration-300">
                <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </div>
              <span className="font-semibold">Back to Home</span>
            </button>
          </div>

          {/* Hero Text */}
          <div className="max-w-lg">
            <h1 className={`text-5xl xl:text-6xl font-black text-white leading-tight mb-6 ${mounted ? 'animate-fadeInUp' : 'opacity-0'}`} style={{ animationDelay: '0.2s' }}>
              Start Your <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400 animate-float inline-block">Journey Today</span>
            </h1>
            <p className={`text-white/80 text-lg leading-relaxed ${mounted ? 'animate-fadeInUp delay-300' : 'opacity-0'}`}>
              Join thousands of happy tenants who found their perfect home through EaseRent. Your dream rental is just a few clicks away.
            </p>
          </div>

          {/* Trust indicators */}
          <div className={`flex items-center gap-8 ${mounted ? 'animate-slideInStats delay-400' : 'opacity-0'}`}>
            <div className="text-center group cursor-default">
              <div className="text-3xl font-black text-white group-hover:scale-110 transition-transform duration-300">Easy</div>
              <div className="text-white/60 text-sm font-medium">Registration</div>
            </div>
            <div className="w-px h-12 bg-white/20"></div>
            <div className="text-center group cursor-default">
              <div className="text-3xl font-black text-white group-hover:scale-110 transition-transform duration-300">Secure</div>
              <div className="text-white/60 text-sm font-medium">Platform</div>
            </div>
            <div className="w-px h-12 bg-white/20"></div>
            <div className="text-center group cursor-default">
              <div className="text-3xl font-black text-white group-hover:scale-110 transition-transform duration-300">Free</div>
              <div className="text-white/60 text-sm font-medium">To Join</div>
            </div>
          </div>
        </div>
      </div>

      {/* --- RIGHT PANEL: REGISTER FORM --- */}
      <div className="w-full lg:w-[45%] xl:w-[40%] h-full flex flex-col">
        {/* Mobile back button */}
        <div className={`lg:hidden absolute top-4 left-4 z-20 ${mounted ? 'animate-fadeInUp' : 'opacity-0'}`}>
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full shadow-md border border-gray-200 transition-all font-bold text-sm cursor-pointer hover:shadow-lg hover:scale-105 active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back</span>
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-3 sm:p-4 lg:p-6">
          <div className={`max-w-md w-full space-y-3 p-4 sm:p-5 ${mounted ? 'animate-scaleIn' : 'opacity-0'}`}>

            {/* Header Section */}
            <div className="text-center">
              <div className={`mx-auto flex items-center justify-center gap-3 mb-4 cursor-pointer transition-all duration-300 ${mounted ? 'animate-fadeInUp delay-100' : 'opacity-0'}`} onClick={() => router.push('/')}>
                <img src="/home.png" alt="TessyNTed Logo" className="w-20 h-20 object-contain" />
                <span className="text-5xl font-black text-gray-900">TessyNTed</span>
              </div>
              <h2 className={`text-lg sm:text-xl font-black text-gray-900 tracking-tight ${mounted ? 'animate-fadeInUp delay-200' : 'opacity-0'}`}>
                {showOtpInput ? 'Verify Email' : 'Create Account'}
              </h2>
              <p className={`mt-0.5 text-xs text-gray-500 font-medium ${mounted ? 'animate-fadeInUp delay-300' : 'opacity-0'}`}>
                {showOtpInput
                  ? `Enter the 6-digit code sent to ${email}`
                  : 'Join us to find your perfect home'}
              </p>
            </div>

            {/* Conditional Rendering: OTP Form vs Registration Form */}
            {showOtpInput ? (
              /* --- OTP FORM --- */
              <form className={`mt-4 space-y-4 ${mounted ? 'animate-fadeInUp delay-400' : 'opacity-0'}`} onSubmit={handleVerifyOtp}>
                <div className="group">
                  <label htmlFor="otp" className="block text-sm font-bold text-gray-700 mb-1 ml-1">
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
                    className="appearance-none relative block w-full px-4 py-2.5 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:z-10 text-center text-2xl tracking-widest font-medium transition-all duration-300 hover:border-gray-400 focus:shadow-lg"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className={`group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0`}
                  >
                    {loading ? 'Verifying...' : 'Verify Email'}
                  </button>
                </div>

                <div className="flex flex-col items-center space-y-3">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="text-sm font-bold text-gray-900 hover:underline cursor-pointer disabled:opacity-50 transition-all duration-300 hover:text-gray-700"
                  >
                    Resend code
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowOtpInput(false)
                      setOtp('')
                    }}
                    className="text-sm text-gray-500 hover:text-gray-900 hover:underline cursor-pointer transition-all duration-300"
                  >
                    ← Back to sign up
                  </button>
                </div>
              </form>
            ) : (
              /* --- REGISTRATION FORM --- */
              <form className={`mt-3 space-y-3 ${mounted ? 'animate-fadeInUp delay-400' : 'opacity-0'}`} onSubmit={handleRegister}>
                <div className="space-y-2">

                  {/* First Name & Middle Name */}
                  <div className="flex gap-2">
                    <div className="w-1/2 group">
                      <label htmlFor="first-name" className="block text-xs font-bold text-gray-700 mb-0.5 ml-1 group-focus-within:text-gray-900 transition-colors">
                        First Name
                      </label>
                      <input
                        id="first-name"
                        name="firstName"
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:z-10 text-sm font-medium transition-all duration-300 hover:border-gray-400 focus:shadow-lg"
                        placeholder="Firstname"
                      />
                    </div>
                    <div className="w-1/2 group">
                      <label htmlFor="middle-name" className="block text-xs font-bold text-gray-700 mb-0.5 ml-1 group-focus-within:text-gray-900 transition-colors">
                        Middle Name
                      </label>
                      <input
                        id="middle-name"
                        name="middleName"
                        type="text"
                        value={middleName}
                        onChange={(e) => setMiddleName(e.target.value)}
                        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:z-10 text-sm font-medium transition-all duration-300 hover:border-gray-400 focus:shadow-lg"
                        placeholder="(Optional)"
                      />
                    </div>
                  </div>

                  {/* Last Name */}
                  <div className="group">
                    <label htmlFor="last-name" className="block text-xs font-bold text-gray-700 mb-0.5 ml-1 group-focus-within:text-gray-900 transition-colors">
                      Last Name
                    </label>
                    <input
                      id="last-name"
                      name="lastName"
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:z-10 text-sm font-medium transition-all duration-300 hover:border-gray-400 focus:shadow-lg"
                      placeholder="Lastname"
                    />
                  </div>

                  {/* Birthday & Gender */}
                  <div className="flex gap-2">
                    <div className="w-1/2 group">
                      <label htmlFor="birthday" className="block text-xs font-bold text-gray-700 mb-0.5 ml-1 cursor-pointer group-focus-within:text-gray-900 transition-colors">
                        Birthday
                      </label>
                      <input
                        id="birthday"
                        name="birthday"
                        type="date"
                        required
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:z-10 text-sm font-medium transition-all duration-300 cursor-pointer hover:border-gray-400 focus:shadow-lg"
                      />
                    </div>
                    <div className="w-1/2 group cursor-pointer">
                      <label htmlFor="gender" className="block text-xs font-bold text-gray-700 mb-0.5 ml-1 cursor-pointer group-focus-within:text-gray-900 transition-colors">
                        Gender
                      </label>
                      <div className="relative">
                        <select
                          id="gender"
                          name="gender"
                          required
                          value={gender}
                          onChange={(e) => setGender(e.target.value)}
                          className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:z-10 text-sm font-medium transition-all duration-300 bg-white cursor-pointer hover:border-gray-400 focus:shadow-lg"
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
                  <div className="group">
                    <label htmlFor="email-address" className="block text-xs font-bold text-gray-700 mb-0.5 ml-1 group-focus-within:text-gray-900 transition-colors">
                      Email address
                    </label>
                    <input
                      id="email-address"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:z-10 text-sm font-medium transition-all duration-300 hover:border-gray-400 focus:shadow-lg"
                      placeholder="Email"
                    />
                  </div>

                  {/* Password Row */}
                  <div className="flex gap-2">
                    <div className="w-1/2 group">
                      <label htmlFor="password" className="block text-xs font-bold text-gray-700 mb-0.5 ml-1 group-focus-within:text-gray-900 transition-colors">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:z-10 text-sm font-medium transition-all duration-300 pr-9 hover:border-gray-400 focus:shadow-lg"
                          placeholder="Password"
                          minLength={6}
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 focus:outline-none z-20 cursor-pointer transition-colors duration-300"
                          onClick={() => setShowPassword(!showPassword)}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {showPassword ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="w-1/2 group">
                      <label htmlFor="confirm-password" className="block text-xs font-bold text-gray-700 mb-0.5 ml-1 group-focus-within:text-gray-900 transition-colors">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <input
                          id="confirm-password"
                          name="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:z-10 text-sm font-medium transition-all duration-300 pr-9 hover:border-gray-400 focus:shadow-lg"
                          placeholder="Confirm"
                          minLength={6}
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 focus:outline-none z-20 cursor-pointer transition-colors duration-300"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {showConfirmPassword ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
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
                    className="h-4 w-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900 cursor-pointer accent-gray-900 transition-all duration-300"
                  />
                  <label htmlFor="terms" className="ml-2 text-xs font-medium text-gray-700 cursor-pointer">
                    I agree to the{' '}
                    <Link href="/terms" target="_blank" className="font-bold text-gray-900 hover:underline transition-all duration-300">
                      Terms & Conditions
                    </Link>
                  </label>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={loading}
                    className={`group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none cursor-pointer`}
                  >
                    {loading ? (
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : null}
                    {loading ? 'Creating account...' : 'Create account'}
                  </button>
                </div>
              </form>
            )}

            <div className={`text-center pt-2 ${mounted ? 'animate-fadeInUp delay-500' : 'opacity-0'}`}>
              <p className="text-xs text-gray-500 font-medium">
                Already have an account?{' '}
                <Link href="/login" className="font-bold text-gray-900 hover:text-gray-700 hover:underline transition-all duration-300">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}