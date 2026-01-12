import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { showToast } from 'nextjs-toast-notify'
import Footer from '../components/Footer'

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
  
  // OTP / Verification States
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [otp, setOtp] = useState('')
  
  // UI States
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const router = useRouter()

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/dashboard')
    })
  }, [router])

  // Step 1: Sign Up
  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    
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
            birthday: birthday, // Save birthday to metadata
            gender: gender,     // Save gender to metadata
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

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
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

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/dashboard` }
      })
      if (error) throw error
    } catch (error) {
      showToast.error("Login error, Please Try again!", {
    duration: 4000,
    progress: true,
    position: "top-right",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
    }
  }

  const handleFacebookLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: { redirectTo: `${window.location.origin}/dashboard` }
      })
      if (error) throw error
    } catch (error) {
      showToast.error("Login error, Please Try again!", {
    duration: 4000,
    progress: true,
    position: "top-right",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-black">
      
      <div className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 sm:p-10 rounded-3xl shadow-xl border border-gray-100">
          
          {/* Header Section */}
          <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-black rounded-xl flex items-center justify-center shadow-lg mb-4 cursor-pointer" onClick={() => router.push('/')}>
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h2 className="mt-2 text-3xl font-black text-gray-900 tracking-tight">
              {showOtpInput ? 'Verify Email' : 'Create an account'}
            </h2>
            <p className="mt-2 text-sm text-gray-500 font-medium">
              {showOtpInput 
                ? `Enter the 6-digit code sent to ${email}`
                : 'Join us to start managing your properties'}
            </p>
          </div>

          {/* Conditional Rendering: OTP Form vs Registration Form */}
          {showOtpInput ? (
            /* --- OTP FORM --- */
            <form className="mt-8 space-y-6" onSubmit={handleVerifyOtp}>
              <div>
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
                  className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 text-center text-2xl tracking-widest font-medium transition-all"
                  placeholder="000000"
                  maxLength={6}
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className={`group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-black hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black shadow-lg transition-all cursor-pointer`}
                >
                  {loading ? 'Verifying...' : 'Verify Email'}
                </button>
              </div>

              <div className="flex flex-col items-center space-y-4">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-sm font-bold text-black hover:underline cursor-pointer disabled:opacity-50"
                >
                  Resend code
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowOtpInput(false)
                    setOtp('')
                  }}
                  className="text-sm text-gray-500 hover:text-black hover:underline cursor-pointer"
                >
                  ← Back to sign up
                </button>
              </div>
            </form>
          ) : (
            /* --- REGISTRATION FORM --- */
            <form className="mt-8 space-y-6" onSubmit={handleRegister}>
              <div className="space-y-4">
                
                {/* First Name & Middle Name */}
                <div className="flex gap-4">
                  <div className="w-1/2">
                    <label htmlFor="first-name" className="block text-sm font-bold text-gray-700 mb-1 ml-1">
                      First Name
                    </label>
                    <input
                      id="first-name"
                      name="firstName"
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all"
                      placeholder="Firstname"
                    />
                  </div>
                  <div className="w-1/2">
                    <label htmlFor="middle-name" className="block text-sm font-bold text-gray-700 mb-1 ml-1">
                      Middle Name
                    </label>
                    <input
                      id="middle-name"
                      name="middleName"
                      type="text"
                      value={middleName}
                      onChange={(e) => setMiddleName(e.target.value)}
                      className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all"
                      placeholder="(Optional)"
                    />
                  </div>
                </div>

                {/* Last Name */}
                <div>
                  <label htmlFor="last-name" className="block text-sm font-bold text-gray-700 mb-1 ml-1">
                    Last Name
                  </label>
                  <input
                    id="last-name"
                    name="lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all"
                    placeholder="Lastname"
                  />
                </div>

                {/* Birthday & Gender */}
                <div className="flex gap-4">
                  <div className="w-1/2">
                    <label htmlFor="birthday" className="block text-sm font-bold text-gray-700 mb-1 ml-1 cursor-pointer">
                      Birthday
                    </label>
                    <input
                      id="birthday"
                      name="birthday"
                      type="date"
                      required
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all cursor-pointer"
                    />
                  </div>
                  <div className="w-1/2 cursor-pointer">
                    <label htmlFor="gender" className="block text-sm font-bold text-gray-700 mb-1 ml-1 cursor-pointer">
                      Gender
                    </label>
                    <div className="relative">
                      <select
                        id="gender"
                        name="gender"
                        required
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all bg-white cursor-pointer"
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

                {/* Email */}
                <div>
                  <label htmlFor="email-address" className="block text-sm font-bold text-gray-700 mb-1 ml-1">
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
                    className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all"
                    placeholder="Email"
                  />
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-1 ml-1">
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
                      className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all pr-10"
                      placeholder="Password"
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black focus:outline-none p-1 z-20 cursor-pointer"
                      onClick={() => setShowPassword(!showPassword)}
                      onMouseDown={(e) => e.preventDefault()} 
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-bold text-gray-700 mb-1 ml-1">
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
                      className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all pr-10"
                      placeholder="Password"
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black focus:outline-none p-1 z-20 cursor-pointer"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {showConfirmPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-black hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black shadow-lg cursor-pointer`}
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

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500 font-medium">Or register with</span>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-xl shadow-sm text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-all cursor-pointer"
                >
                  <svg className="h-5 w-5 mr-2" aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12.0003 20.45c4.656 0 8.526-3.237 9.942-7.65h-9.942v-4.32h14.736c.144.744.216 1.512.216 2.304 0 8.856-6.048 15.12-14.952 15.12-8.352 0-15.12-6.768-15.12-15.12s6.768-15.12 15.12-15.12c4.08 0 7.776 1.512 10.608 4.008l-3.24 3.24c-1.92-1.728-4.464-2.736-7.368-2.736-6.048 0-11.04 4.512-12.048 10.368h-.024l-3.936 3.048v.048c1.776 5.304 6.84 9.144 12.768 9.144z" fill="#4285F4" />
                    <path d="M4.32 14.22c-.264-1.248-.408-2.544-.408-3.888s.144-2.64.408-3.888l-4.224-3.288c-.912 2.184-1.416 4.584-1.416 7.176s.504 4.992 1.416 7.176l4.224-3.288z" fill="#FBBC05" />
                    <path d="M12 4.752c2.256 0 4.296.816 5.856 2.16l3.312-3.312c-2.544-2.376-5.856-3.84-9.168-3.84-5.928 0-10.992 3.84-12.768 9.144l4.224 3.288c1.008-5.856 6-10.368 12.048-10.368z" fill="#EA4335" />
                    <path d="M12 19.608c-3.24 0-6.168-1.128-8.4-3.072l-4.224 3.288c2.184 3.24 5.928 5.304 10.128 5.304 2.592 0 5.04-.648 7.176-1.8l-2.52-4.152c-1.392.936-3.048 1.488-4.88 1.488z" fill="#34A853" />
                  </svg>
                  Sign up with Google
                </button>

                <button
                  type="button"
                  onClick={handleFacebookLogin}
                  className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-xl shadow-sm text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-all cursor-pointer"
                >
                  <svg className="h-5 w-5 mr-2" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" fill="#1877F2" />
                  </svg>
                  Sign up with Facebook
                </button>
              </div>
            </form>
          )}

          <div className="text-center">
            <p className="text-sm text-gray-500 font-medium">
              Already have an account?{' '}
              <Link href="/login" className="font-bold text-black hover:underline transition-all">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  )
}