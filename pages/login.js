import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { showToast } from 'nextjs-toast-notify'
// import Footer from '../components/Footer'
// import { createClient } from '@supabase/supabase-js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [stats, setStats] = useState({ properties: '0', tenants: '0' })
  const [currentSlide, setCurrentSlide] = useState(0)

  // ✏️ ADD YOUR IMAGES HERE — just put files in /public and add paths to this array
  const heroImages = [
    '/logo_login.jpg',
    '/image1.png',
    '/image2.png',
  ]

  const slideContent = [
    { heading: 'Manage Properties Efficiently', description: 'Easily track rent payments, maintenance requests, and tenant communications in one place. Say goodbye to the hassle of manual management.' },
    { heading: 'Find Your Perfect Home', description: 'Browse through curated rental listings and connect with trusted landlords for a seamless renting experience.' },
    { heading: 'Secure & Reliable Payments', description: 'Pay rent securely through multiple payment channels including GCash, Maya, and credit cards.' },
  ]

  useEffect(() => {
    setMounted(true)
    async function loadStats() {
      try {
        // Fetch Properties Count
        const { count: propertiesCount } = await supabase
          .from('properties')
          .select('*', { count: 'exact', head: true })
          .eq('is_deleted', false)

        // Fetch Tenants Count
        const { count: tenantsCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'tenant')

        if (propertiesCount !== null && tenantsCount !== null) {
          setStats({
            properties: propertiesCount.toString(),
            tenants: tenantsCount.toString()
          })
        }
      } catch (err) {
        console.error('Error loading stats', err)
      }
    }
    loadStats()
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
      if (session) {
        // If there is a redirect param, go there. Otherwise, go to dashboard.
        const redirectUrl = router.query.redirect || '/dashboard'
        router.push(redirectUrl)
      }
    })

    // Load saved email if "Remember Me" was previously checked
    const savedEmail = localStorage.getItem('rememberedEmail')
    if (savedEmail) {
      setEmail(savedEmail)
      setRememberMe(true)
    }
  }, [router])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Set session persistence based on "Remember Me" checkbox
      // If rememberMe is true, session persists in localStorage
      // If rememberMe is false, session only lasts until browser/tab closes
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Save or remove email based on "Remember Me" setting
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email)
      } else {
        localStorage.removeItem('rememberedEmail')
      }

      showToast.success("Login successful!", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "popUp",
        sound: true,
      });
      const redirectUrl = router.query.redirect || '/dashboard'
      router.push(redirectUrl)
    } catch (error) {
      showToast.error("Wrong Password or Email!", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "fadeIn",
        sound: true,
      });
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    try {
      const nextPath = router.query.redirect || '/dashboard'
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${nextPath}`
        }
      })
      if (error) throw error
    } catch (error) {
      showToast.error("Login Failed, Please Try again!", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceInDown",
        icon: '',
        sound: true,
      });
    }
  }

  const handleFacebookLogin = async () => {
    try {
      const nextPath = router.query.redirect || '/dashboard'
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: `${window.location.origin}${nextPath}`
        }
      })
      if (error) throw error
    } catch (error) {
      showToast.error("Login Failed, Please Try again!", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceInDown",
        icon: '',
        sound: true,
      });
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
        .float-label input { padding-top: 1.25rem; padding-bottom: 0.5rem; }
        .float-label label {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: #9CA3AF;
          font-size: 0.875rem;
          font-weight: 500;
          pointer-events: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          transform-origin: left center;
          background: transparent;
          padding: 0;
        }
        .float-label input:focus ~ label,
        .float-label input:not(:placeholder-shown) ~ label {
          top: 0.55rem;
          transform: translateY(0);
          font-size: 0.65rem;
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
              onClick={() => router.push(router.query.redirect || '/')}
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
            {/* Slide indicator dots — click to navigate */}
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

      {/* --- RIGHT PANEL: LOGIN FORM --- */}
      <div className={`w-full lg:w-[45%] xl:w-[42%] h-full flex flex-col bg-[#F5F5F5] ${mounted ? 'animate-fadeInRight' : 'opacity-0'}`}>

        {/* Form Content */}
        <div className="flex-1 flex items-center justify-center px-6 sm:px-10 lg:px-14 overflow-y-auto">
          <div className={`w-full max-w-md space-y-5 py-8 ${mounted ? 'animate-scaleIn' : 'opacity-0'}`}>

            {/* Logo + Brand */}
            <div className="text-center">
              <div className={`mx-auto flex items-center justify-center gap-3 mb-3 cursor-pointer transition-all duration-300 ${mounted ? 'animate-fadeInUp delay-100' : 'opacity-0'}`} onClick={() => router.push('/')}>
                <img src="/home.png" alt="Abalay Logo" className="w-16 h-16 object-contain" />
                <span className="text-4xl font-black text-gray-900">Abalay</span>
              </div>
              <p className={`text-sm text-gray-500 font-medium ${mounted ? 'animate-fadeInUp delay-200' : 'opacity-0'}`}>
                Sign in to your Abalay account
              </p>
            </div>

            {/* Login Form */}
            <form className={`mt-4 space-y-4 ${mounted ? 'animate-fadeInUp delay-300' : 'opacity-0'}`} onSubmit={handleLogin}>
              <div className="space-y-4">

                {/* Email — Floating Label */}
                <div className="float-label">
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none relative block w-full px-4 border border-gray-300 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent sm:text-sm font-medium transition-all duration-300 hover:border-gray-400 bg-white"
                    placeholder=" "
                  />
                  <label htmlFor="email-address">Email address</label>
                </div>

                {/* Password — Floating Label */}
                <div className="float-label">
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none relative block w-full px-4 border border-gray-300 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent sm:text-sm font-medium transition-all duration-300 hover:border-gray-400 pr-12 bg-white"
                      placeholder=" "
                    />
                    <label htmlFor="password">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center cursor-pointer text-gray-400 hover:text-gray-600 transition-colors z-20"
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Remember Me / Forgot Password */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 text-gray-900 focus:ring-gray-900 border-gray-300 rounded cursor-pointer accent-gray-900"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-600 font-medium cursor-pointer">
                    Remember me
                  </label>
                </div>
                <a href="forgotPassword" className="text-sm font-semibold text-gray-900 hover:text-gray-700 hover:underline transition-colors">
                  Forgot password?
                </a>
              </div>

              {/* Sign In Button */}
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
                {loading ? 'Signing in...' : 'Sign in'}
              </button>

              {/* Or continue with Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-[#F5F5F5] text-gray-500 font-medium">Or continue with</span>
                </div>
              </div>

              {/* Social Login */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl shadow-sm text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 hover:shadow-md transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                >
                  <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.15 0 5.95 1.1 8.15 2.9l6.05-6.05C34.25 2.55 29.45 0 24 0 14.65 0 6.6 5.35 2.7 13.1l7.05 5.45C11.5 13.1 17.25 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.15-3.15-.4-4.65H24v9h12.45c-.55 2.95-2.2 5.45-4.7 7.15l7.2 5.55c4.2-3.9 7.15-9.65 7.15-17.05z" />
                    <path fill="#FBBC05" d="M9.75 28.55c-.5-1.5-.8-3.1-.8-4.75s.3-3.25.8-4.75l-7.05-5.45C.95 17.15 0 20.45 0 23.8s.95 6.65 2.7 9.7l7.05-4.95z" />
                    <path fill="#34A853" d="M24 48c5.45 0 10.25-1.8 13.65-4.9l-7.2-5.55c-2 1.35-4.55 2.15-6.45 2.15-6.75 0-12.5-4.55-14.25-10.65l-7.05 4.95C6.6 42.65 14.65 48 24 48z" />
                  </svg>
                  Google
                </button>

                <button
                  type="button"
                  onClick={handleFacebookLogin}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl shadow-sm text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 hover:shadow-md transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                >
                  <svg className="h-5 w-5" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" fill="#1877F2" />
                  </svg>
                  Facebook
                </button>
              </div>
            </form>

            {/* Register Link */}
            <div className={`text-center pt-2 ${mounted ? 'animate-fadeInUp delay-500' : 'opacity-0'}`}>
              <p className="text-sm text-gray-500 font-medium">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="font-bold text-gray-900 hover:text-gray-700 hover:underline transition-all duration-300">
                  Create Account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}