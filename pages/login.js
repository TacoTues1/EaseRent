import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { showToast } from 'nextjs-toast-notify'
import Footer from '../components/Footer'
import { createClient } from '@supabase/supabase-js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const [rememberMe, setRememberMe] = useState(false) 
  

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
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-black">
      
      <div className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 sm:p-10 rounded-3xl shadow-xl border border-gray-100">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-black rounded-xl flex items-center justify-center shadow-lg mb-4 cursor-pointer" onClick={() => router.push('/')}>
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h2 className="mt-2 text-3xl font-black text-gray-900 tracking-tight">
              Welcome to EaseRent
            </h2>
            <p className="mt-2 text-sm text-gray-500 font-medium">
              Sign in to your account to continue
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
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all"
                  placeholder="Password"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}                                // 1. Bind value
                  onChange={(e) => setRememberMe(e.target.checked)}   // 2. Update state on click
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
                <svg className="h-5 w-5 mr-2" aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12.0003 20.45c4.656 0 8.526-3.237 9.942-7.65h-9.942v-4.32h14.736c.144.744.216 1.512.216 2.304 0 8.856-6.048 15.12-14.952 15.12-8.352 0-15.12-6.768-15.12-15.12s6.768-15.12 15.12-15.12c4.08 0 7.776 1.512 10.608 4.008l-3.24 3.24c-1.92-1.728-4.464-2.736-7.368-2.736-6.048 0-11.04 4.512-12.048 10.368h-.024l-3.936 3.048v.048c1.776 5.304 6.84 9.144 12.768 9.144z" fill="#4285F4" />
                  <path d="M4.32 14.22c-.264-1.248-.408-2.544-.408-3.888s.144-2.64.408-3.888l-4.224-3.288c-.912 2.184-1.416 4.584-1.416 7.176s.504 4.992 1.416 7.176l4.224-3.288z" fill="#FBBC05" />
                  <path d="M12 4.752c2.256 0 4.296.816 5.856 2.16l3.312-3.312c-2.544-2.376-5.856-3.84-9.168-3.84-5.928 0-10.992 3.84-12.768 9.144l4.224 3.288c1.008-5.856 6-10.368 12.048-10.368z" fill="#EA4335" />
                  <path d="M12 19.608c-3.24 0-6.168-1.128-8.4-3.072l-4.224 3.288c2.184 3.24 5.928 5.304 10.128 5.304 2.592 0 5.04-.648 7.176-1.8l-2.52-4.152c-1.392.936-3.048 1.488-4.88 1.488z" fill="#34A853" />
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
      
      <Footer />
    </div>
  )
}