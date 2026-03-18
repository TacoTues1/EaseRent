import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'
import Footer from '../components/Footer'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentStep, setCurrentStep] = useState('email')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const router = useRouter()
  const allowAuthenticatedExitRef = useRef(false)

  const normalizedEmail = email.trim().toLowerCase()

  // Timer for cooldown
  useEffect(() => {
    let timer
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1)
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [resendCooldown])

  useEffect(() => {
    const handleRouteChangeStart = (url) => {
      if (currentStep === 'password' && !allowAuthenticatedExitRef.current && url !== router.asPath) {
        void supabase.auth.signOut()
      }
    }

    router.events.on('routeChangeStart', handleRouteChangeStart)

    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart)
    }
  }, [currentStep, router])

  const leaveResetFlow = async (destination = '/login') => {
    if (currentStep === 'password' && !allowAuthenticatedExitRef.current) {
      await supabase.auth.signOut()
    }

    router.push(destination)
  }

  const handleSendCode = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/reset-password-brevo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail })
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send verification code')
      }

      setCurrentStep('otp')
      setOtp('')
      setPassword('')
      setConfirmPassword('')
      setResendCooldown(90)

      showToast.success("Password reset code sent! Please check your email.", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });

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

  const handleVerifyCode = async (e) => {
    e.preventDefault()

    if (otp.length !== 6) {
      showToast.error("Enter the 6-digit verification code", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
      return
    }

    setLoading(true)

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: otp,
        type: 'recovery',
      })

      if (verifyError) throw verifyError

      allowAuthenticatedExitRef.current = false
      setCurrentStep('password')
      setPassword('')
      setConfirmPassword('')

      showToast.success("Code verified! You can now set a new password.", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    } catch (error) {
      showToast.error(error.message || 'Invalid or expired code. Please try again.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      showToast.error("Passwords do not match", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
      return
    }

    if (password.length < 6) {
      showToast.error("Password must be at least 6 characters long", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
      return
    }

    setLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) throw updateError

      allowAuthenticatedExitRef.current = true
      showToast.success("Password updated successfully!", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })

      router.push('/dashboard')
    } catch (error) {
      showToast.error(error.message || 'Failed to update password. Please try again.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleResendCode = async () => {
    setLoading(true)

    try {
      const res = await fetch('/api/reset-password-brevo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail })
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to resend verification code')
      }

      setCurrentStep('otp')
      setOtp('')
      setResendCooldown(90)

      showToast.success("Verification code resent! Please check your email.", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    } catch (error) {
      showToast.error(error.message, {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-black">

      <div className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 sm:p-10 rounded-3xl shadow-xl border border-gray-100">
          <div className="text-center">
            <button
              type="button"
              className="mx-auto h-12 w-12 bg-black rounded-xl flex items-center justify-center shadow-lg mb-4 cursor-pointer"
              onClick={() => leaveResetFlow('/login')}
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h2 className="mt-2 text-3xl font-black text-gray-900 tracking-tight">
              Forgot Password?
            </h2>
            <p className="mt-2 text-sm text-gray-500 font-medium">
              {currentStep === 'email' && "No worries! Enter your email and we'll send you a 6-digit reset code."}
              {currentStep === 'otp' && `Enter the 6-digit code sent to ${normalizedEmail}.`}
              {currentStep === 'password' && "Enter your new password below."}
            </p>
          </div>

          <form
            className="mt-8 space-y-6"
            onSubmit={
              currentStep === 'email'
                ? handleSendCode
                : currentStep === 'otp'
                  ? handleVerifyCode
                  : handleResetPassword
            }
          >
            <div className="space-y-4">
              {currentStep === 'email' ? (
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
              ) : null}

              {currentStep === 'otp' ? (
                <div>
                  <label htmlFor="otp-code" className="block text-sm font-bold text-gray-700 mb-1 ml-1">
                    Verification code
                  </label>
                  <input
                    id="otp-code"
                    name="otp"
                    type="text"
                    required
                    autoFocus
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium tracking-[0.4em] text-center transition-all"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>
              ) : null}

              {currentStep === 'password' ? (
                <>
                  <div>
                    <label htmlFor="new-password" className="block text-sm font-bold text-gray-700 mb-1 ml-1">
                      New password
                    </label>
                    <input
                      id="new-password"
                      name="password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all"
                      placeholder="Enter new password"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirm-password" className="block text-sm font-bold text-gray-700 mb-1 ml-1">
                      Confirm new password
                    </label>
                    <input
                      id="confirm-password"
                      name="confirmPassword"
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent focus:z-10 sm:text-sm font-medium transition-all"
                      placeholder="Confirm new password"
                    />
                  </div>
                </>
              ) : null}
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
                {loading
                  ? (
                    currentStep === 'email'
                      ? 'Sending code...'
                      : currentStep === 'otp'
                        ? 'Verifying code...'
                        : 'Resetting password...'
                  )
                  : (
                    currentStep === 'email'
                      ? 'Send Reset Code'
                      : currentStep === 'otp'
                        ? 'Verify Code'
                        : 'Update Password'
                  )}
              </button>
            </div>
          </form>

          <div className="text-center">
            {currentStep === 'otp' ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading || resendCooldown > 0}
                  className="text-sm font-bold text-black hover:underline transition-all disabled:opacity-50 cursor-pointer disabled:hover:no-underline"
                >
                  {resendCooldown > 0 ? `Resend code in ${Math.floor(resendCooldown / 60)}:${(resendCooldown % 60).toString().padStart(2, '0')}` : 'Resend code'}
                </button>
                <p className="text-sm text-gray-500 font-medium">
                  Need a different email?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentStep('email')
                      setOtp('')
                      setPassword('')
                      setConfirmPassword('')
                    }}
                    className="font-bold text-black hover:underline transition-all cursor-pointer"
                  >
                    Go back
                  </button>
                </p>
              </div>
            ) : currentStep === 'password' ? (
              <p className="text-sm text-gray-500 font-medium">
                Need a new code?{' '}
                <button
                  type="button"
                  onClick={async () => {
                    allowAuthenticatedExitRef.current = false
                    await supabase.auth.signOut()
                    setCurrentStep('otp')
                    setPassword('')
                    setConfirmPassword('')
                  }}
                  className="font-bold text-black hover:underline transition-all cursor-pointer"
                >
                  Start over
                </button>
              </p>
            ) : (
              <p className="text-sm text-gray-500 font-medium">
                Remember your password?{' '}
                <Link href="/login" className="font-bold text-black hover:underline transition-all">
                  Back to login
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
