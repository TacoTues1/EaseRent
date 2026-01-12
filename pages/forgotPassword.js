import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'
import Footer from '../components/Footer'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleReset = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // Redirect user to this page after they click the email link
        // You will need to create 'pages/update-password.js' to handle the new password input
        redirectTo: `${window.location.origin}/updatePassword`,
      })

      if (error) throw error
      
      showToast.success("Password reset link sent! Please check your email.", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

      // Optional: Redirect back to login after a delay
      // setTimeout(() => router.push('/login'), 3000)
      
    } catch (error) {
      showToast.error(error.message, {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-black">
      
      <div className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 sm:p-10 rounded-3xl shadow-xl border border-gray-100">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-black rounded-xl flex items-center justify-center shadow-lg mb-4 cursor-pointer" onClick={() => router.push('/login')}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </div>
            <h2 className="mt-2 text-3xl font-black text-gray-900 tracking-tight">
              Forgot Password?
            </h2>
            <p className="mt-2 text-sm text-gray-500 font-medium">
              No worries! Enter your email and we'll send you reset instructions.
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleReset}>
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
                  placeholder="Email Address"
                />
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
                {loading ? 'Sending link...' : 'Send Reset Link'}
              </button>
            </div>
          </form>

          <div className="text-center">
            <p className="text-sm text-gray-500 font-medium">
              Remember your password?{' '}
              <Link href="/login" className="font-bold text-black hover:underline transition-all">
                Back to login
              </Link>
            </p>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  )
}