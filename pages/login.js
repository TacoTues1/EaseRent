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
        @keyframes fadeInRight {
          from {
            opacity: 0;
            transform: translateX(30px);
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
        .animate-fadeInRight {
          animation: fadeInRight 0.6s ease-out forwards;
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
        .delay-600 { animation-delay: 0.6s; }
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
              onClick={() => router.push(router.query.redirect || '/')}
              className="flex items-center gap-3 text-white/90 hover:text-white transition-all duration-300 group"
            >
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center group-hover:bg-white/30 group-hover:scale-110 transition-all duration-300 cursor-pointer">
                <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </div>
              <span className="font-semibold">Back</span>
            </button>
          </div>

          {/* Hero Text */}
          <div className="max-w-lg">
            <h1 className={`text-5xl xl:text-6xl font-black text-white leading-tight mb-6 ${mounted ? 'animate-fadeInUp' : 'opacity-0'}`} style={{ animationDelay: '0.2s' }}>
              Find Your <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 animate-float inline-block">Perfect Home</span>
            </h1>
            <p className={`text-white/80 text-lg leading-relaxed ${mounted ? 'animate-fadeInUp delay-300' : 'opacity-0'}`}>
              Discover comfortable rental spaces that fit your lifestyle. 𝐓𝐞𝐬𝐬𝐲𝐍𝐓𝐞𝐝 connects you with trusted landlords for a seamless renting experience.
            </p>
          </div>

          {/* Trust indicators */}
          <div className={`flex items-center gap-8 ${mounted ? 'animate-slideInStats delay-400' : 'opacity-0'}`}>
            <div className="text-center group cursor-default">
              <div className="text-3xl font-black text-white group-hover:scale-110 transition-transform duration-300">{stats.properties}+</div>
              <div className="text-white/60 text-sm font-medium">Properties</div>
            </div>
            <div className="w-px h-12 bg-white/20"></div>
            <div className="text-center group cursor-default">
              <div className="text-3xl font-black text-white group-hover:scale-110 transition-transform duration-300">{stats.tenants}+</div>
              <div className="text-white/60 text-sm font-medium">Happy Tenants</div>
            </div>
            <div className="w-px h-12 bg-white/20"></div>
            <div className="text-center group cursor-default">
              <div className="text-3xl font-black text-white group-hover:scale-110 transition-transform duration-300">98%</div>
              <div className="text-white/60 text-sm font-medium">Satisfaction</div>
            </div>
          </div>
        </div>
      </div>

      {/* --- RIGHT PANEL: LOGIN FORM --- */}
      <div className="w-full lg:w-[45%] xl:w-[40%] h-full flex flex-col">
        {/* Mobile back button */}
        <div className={`lg:hidden absolute top-4 left-4 z-20 ${mounted ? 'animate-fadeInUp' : 'opacity-0'}`}>
          <button
            onClick={() => router.push(router.query.redirect || '/')}
            className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full shadow-md  transition-all font-bold text-sm cursor-pointer hover:shadow-lg hover:scale-105 active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back</span>
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className={`max-w-md w-full space-y-5 p-6 sm:p-8 ${mounted ? 'animate-scaleIn' : 'opacity-0'}`}>
            <div className="text-center">
              {/* Logo Icon */}
              <div className={`mx-auto flex items-center justify-center gap-3 mb-4 cursor-pointer  transition-all duration-300 ${mounted ? 'animate-fadeInUp delay-100' : 'opacity-0'}`} onClick={() => router.push('/')}>
                <img src="/home.png" alt="TessyNTed Logo" className="w-20 h-20 object-contain" />
                <span className="text-5xl font-black text-gray-900">TessyNTed</span>
              </div>
              <p className={`mt-1 text-sm text-gray-500 font-medium ${mounted ? 'animate-fadeInUp delay-300' : 'opacity-0'}`}>
                Sign in to your TessyNTed account
              </p>
            </div>

            <form className={`mt-4 space-y-4 ${mounted ? 'animate-fadeInUp delay-400' : 'opacity-0'}`} onSubmit={handleLogin}>
              <div className="space-y-3">
                <div className="group">
                  <label htmlFor="email-address" className="block text-sm font-bold text-gray-700 mb-1 ml-1 group-focus-within:text-gray-900 transition-colors">
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
                    className="appearance-none relative block w-full px-4 py-2.5 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all duration-300 hover:border-gray-400 focus:shadow-lg"
                    placeholder="Email"
                  />
                </div>

                <div className="group">
                  <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-1 ml-1 group-focus-within:text-gray-900 transition-colors">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none relative block w-full px-4 py-2.5 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all duration-300 hover:border-gray-400 focus:shadow-lg"
                      placeholder="Password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 cursor-pointer text-gray-500 hover:text-black transition-colors z-20"
                    >
                      {showPassword ? (
                        // Eye Slash Icon (Hide)
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        // Eye Icon (Show)
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

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

                <div className="text-sm">
                  <a href="forgotPassword" className="font-semibold text-gray-900 hover:text-gray-700 hover:underline transition-colors">
                    Forgot password?
                  </a>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 shadow-lg hover:shadow-xl transition-all cursor-pointer transform hover:-translate-y-0.5`}
                >
                  {loading ? (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : null}
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-[#F5F5F5] text-gray-500 font-medium">Or continue with</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="flex items-center justify-center px-4 py-2.5 border border-gray-200 rounded-xl shadow-sm text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                >
                  <svg
                    className="h-5 w-5 mr-2"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.15 0 5.95 1.1 8.15 2.9l6.05-6.05C34.25 2.55 29.45 0 24 0 14.65 0 6.6 5.35 2.7 13.1l7.05 5.45C11.5 13.1 17.25 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.1 24.5c0-1.6-.15-3.15-.4-4.65H24v9h12.45c-.55 2.95-2.2 5.45-4.7 7.15l7.2 5.55c4.2-3.9 7.15-9.65 7.15-17.05z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M9.75 28.55c-.5-1.5-.8-3.1-.8-4.75s.3-3.25.8-4.75l-7.05-5.45C.95 17.15 0 20.45 0 23.8s.95 6.65 2.7 9.7l7.05-4.95z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c5.45 0 10.25-1.8 13.65-4.9l-7.2-5.55c-2 1.35-4.55 2.15-6.45 2.15-6.75 0-12.5-4.55-14.25-10.65l-7.05 4.95C6.6 42.65 14.65 48 24 48z"
                    />
                  </svg>
                  Google
                </button>

                <button
                  type="button"
                  onClick={handleFacebookLogin}
                  className="flex items-center justify-center px-4 py-2.5 border border-gray-200 rounded-xl shadow-sm text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                >
                  <svg className="h-5 w-5 mr-2" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" fill="#1877F2" />
                  </svg>
                  Facebook
                </button>
              </div>
            </form>

            <div className={`text-center pt-3 ${mounted ? 'animate-fadeInUp delay-500' : 'opacity-0'}`}>
              <p className="text-sm text-gray-500 font-medium">
                Don't have an account?{' '}
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