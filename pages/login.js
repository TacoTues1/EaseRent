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
  

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/dashboard')
    })
  }, [router])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
      
      showToast.success("Login successful!", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "popUp",    
        sound: true,
      });
      router.push('/dashboard')
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: `${window.location.origin}/dashboard`
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
            redirectTo: `${window.location.origin}/dashboard`
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
    <div className="min-h-screen bg-[#F2F3F4] font-sans text-black flex flex-col">
      
      <div className="absolute top-6 left-6 z-50">
        <button 
          onClick={() => router.push('/')}
          className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-md border border-gray-200 transition-all font-bold text-sm cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="hidden sm:inline">Back</span>
        </button>
      </div>

      {/* Main Content Wrapper */}
      <div className="flex-grow flex flex-col lg:flex-row w-full max-w-7xl mx-auto">
        
        {/* --- LEFT PANEL: LOGO / BRANDING --- */}
        {/* Changed to 'hidden lg:flex' so it disappears on mobile */}
        <div className="lg:w-1/2 hidden lg:flex flex-col justify-center items-center p-8 lg:p-12 bg-[#F2F3F4] order-1 lg:order-1">
          
          <div className="w-full text-center lg:text-left mt-8">
             <img 
                src="/logo_login.png" 
                alt="Company Logo" 
                // UPDATED: Removed 'max-w-xl' so it can fill the entire half of the screen
                className="mx-auto lg:mx-0 w-full h-auto object-contain mb-6   lg:mb-0 transition-all duration-300" 
              /> 
          </div>
        </div>

        {/* --- RIGHT PANEL: LOGIN FORM --- */}
        <div className="lg:w-1/2 w-full flex items-center justify-center p-4 sm:p-8 lg:p-12 order-2 lg:order-2">
          <div className="max-w-md w-full space-y-8 bg-white p-8 sm:p-10 rounded-3xl shadow-xl border border-gray-100">
            <div className="text-center">
              <h2 className="mt-2 text-3xl font-black text-gray-900 tracking-tight">
                EASERENT
              </h2>
              <p className="mt-2 text-sm text-gray-500 font-medium">
                Login to your account
              </p>
            </div>

            <form className="mt-8 space-y-6" onSubmit={handleLogin}>
              <div className="space-y-4">
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

                <div>
                  <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-1 ml-1">
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
                    className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all"
                    placeholder="Password"
                  />
                  <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 cursor-pointer text-gray-500 hover:text-black transition-colors"
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
                    className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded cursor-pointer"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 font-medium cursor-pointer">
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <a href="forgotPassword" className="font-bold text-black hover:underline">
                    Forgot password?
                  </a>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-black hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black shadow-lg transition-all cursor-pointer`}
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
                  <span className="px-2 bg-white text-gray-500 font-medium">Or continue with</span>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-xl shadow-sm text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-all cursor-pointer"
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
                  Continue with Google
                </button>

                <button
                  type="button"
                  onClick={handleFacebookLogin}
                  className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-xl shadow-sm text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-all cursor-pointer"
                >
                  <svg className="h-5 w-5 mr-2" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" fill="#1877F2" />
                  </svg>
                  Continue with Facebook
                </button>
              </div>
            </form>

            <div className="text-center">
              <p className="text-sm text-gray-500 font-medium">
                Don't have an account?{' '}
                <Link href="/register" className="font-bold text-black hover:underline transition-all">
                  Sign up for free
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}