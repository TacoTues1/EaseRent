import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'

export default function AuthModal({ isOpen, onClose, initialMode = 'signin' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [otp, setOtp] = useState('')
  const [pendingUserId, setPendingUserId] = useState(null)
  const [rememberMe, setRememberMe] = useState(false)
  const router = useRouter()

  // Update mode when initialMode prop changes
  useEffect(() => {
    if (isOpen) {
      setIsSignUp(initialMode === 'signup')
      setMessage(null)
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setFirstName('')
      setMiddleName('')
      setLastName('')
      setShowPassword(false)
      setShowConfirmPassword(false)
      setShowOtpInput(false)
      setOtp('')
      setPendingUserId(null)
      setRememberMe(false)
      
      // Load saved email if "Remember Me" was previously checked
      if (initialMode === 'signin') {
        const savedRememberMe = localStorage.getItem('rememberMe')
        const savedEmail = localStorage.getItem('savedEmail')
        if (savedRememberMe === 'true' && savedEmail) {
          setEmail(savedEmail)
          setRememberMe(true)
        }
      }
    }
  }, [isOpen, initialMode])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        throw new Error('Please enter a valid email address')
      }

      if (isSignUp) {
        // Validate password match
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match')
        }

        // Validate password strength
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long')
        }

        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              first_name: firstName,
              middle_name: middleName || 'N/A',
              last_name: lastName
            }
          }
        })
        
        if (error) {
          // Handle specific Supabase errors
          if (error.message.includes('invalid')) {
            throw new Error('Please enter a valid email address')
          }
          if (error.message.includes('already registered')) {
            throw new Error('This email is already registered. Please sign in instead.')
          }
          throw error
        }
        
        if (data.user) {
          // Store user ID for OTP verification
          setPendingUserId(data.user.id)
          
          // ALWAYS show OTP input for email verification
          // Even if Supabase auto-confirms, we want manual verification
          setShowOtpInput(true)
          toast.success('Check your email! We sent you a 6-digit verification code.', {
            icon: '✓',
          })
        }
      } else {
        // Sign In
        const { data, error } = await supabase.auth.signInWithPassword({ 
          email, 
          password,
          options: {
            // Set session to persist if "Remember Me" is checked
            // Otherwise use default session behavior
            data: {
              rememberMe: rememberMe
            }
          }
        })
        
        // If remember me is checked, store credentials in localStorage
        if (rememberMe && !error) {
          localStorage.setItem('rememberMe', 'true')
          localStorage.setItem('savedEmail', email)
        } else if (!rememberMe) {
          localStorage.removeItem('rememberMe')
          localStorage.removeItem('savedEmail')
        }
        
        if (error) {
          // Provide helpful error messages
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Invalid email or password. Please check and try again.')
          } else if (error.message.includes('Email not confirmed')) {
            throw new Error('Please confirm your email before signing in. Check your inbox.')
          } else {
            throw error
          }
        }
        
        toast.success('Login successful!', {
          icon: '✓',
        })
        onClose()
        router.push('/dashboard')
      }
    } catch (err) {
      toast.error(err.message || 'An error occurred', {
        icon: '✕',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          skipBrowserRedirect: false
        }
      })
      
      if (error) throw error
      // User will be redirected automatically - no email verification needed
    } catch (err) {
      toast.error(err.message || 'Failed to sign in with Google', {
        icon: '✕',
      })
      setLoading(false)
    }
  }

  async function handleFacebookSignIn() {
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          scopes: 'public_profile email',
          skipBrowserRedirect: false
        }
      })
      
      if (error) throw error
      // User will be redirected automatically - no email verification needed
    } catch (err) {
      toast.error(err.message || 'Failed to sign in with Facebook', {
        icon: '✕',
      })
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setLoading(true)

    try {
      // Verify the OTP
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'signup'
      })

      if (error) throw error

      if (data.user) {
        // Check if profile already exists
        const { data: existingProfile, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle()

        // Only create profile if it doesn't exist
        if (!existingProfile) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            first_name: firstName,
            middle_name: middleName || 'N/A',
            last_name: lastName,
            role: 'tenant'
          })

          // Ignore duplicate key errors (profile was created elsewhere, e.g., by Navbar)
          if (profileError && profileError.code !== '23505') {
            throw new Error('Email verified but profile setup failed. Please contact support.')
          }
        }

        // Profile exists now (either already existed or just created)
        toast.success('Email verified successfully! Redirecting...', {
          icon: '✓',
        })
        setTimeout(() => {
          onClose()
          router.push('/dashboard')
        }, 1500)
      }
    } catch (err) {
      toast.error(err.message || 'Invalid verification code. Please try again.', {
        icon: '✕',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleResendOtp() {
    setLoading(true)

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      })

      if (error) throw error

      toast.success('Verification code resent! Check your email.', {
        icon: '✓',
      })
    } catch (err) {
      toast.error(err.message || 'Failed to resend code. Please try again.', {
        icon: '✕',
      })
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 px-4">
      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-black opacity-50"></div>
      
      {/* Modal content */}
      <div className="bg-white border-2 border-black p-6 w-full max-w-md relative z-10 rounded-xl">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-black text-2xl cursor-pointer"
        >
          ×
        </button>
        
        <h2 className="text-2xl font-bold mb-4 text-black">
          {showOtpInput ? 'Verify Email' : (isSignUp ? 'Create Account' : 'Login')}
        </h2>
        
        {message && (
          <div className={`mb-4 p-3 text-sm border-2 border-black ${
            message.includes('complete') || message.includes('successful') || message.includes('Check your email')
              ? 'bg-black text-white' 
              : 'bg-white text-black'
          }`}>
            {message}
          </div>
        )}
        
        {showOtpInput ? (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Verification Code</label>
              <input 
                type="text"
                className="w-full border-2 border-black px-3 py-2 text-center text-2xl tracking-widest rounded-md" 
                value={otp} 
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
              />
              <p className="text-xs text-gray-600 mt-2">
                Enter the 6-digit code sent to {email}
              </p>
            </div>

            <button 
              type="submit" 
              disabled={loading || otp.length !== 6} 
              className="w-full bg-black text-white py-2 border-2 border-black disabled:opacity-50 cursor-pointer rounded-xl"
            >
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading}
                className="text-sm text-black underline disabled:opacity-50 cursor-pointer"
              >
                Resend code
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setShowOtpInput(false)
                  setOtp('')
                  setMessage(null)
                }}
                className="text-sm text-black underline cursor-pointer"
              >
                ← Back to sign up
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">First Name</label>
                  <input 
                    className="w-full border-2 border-black px-3 py-2 rounded-md" 
                    value={firstName} 
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Juan"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Last Name</label>
                  <input 
                    className="w-full border-2 border-black px-3 py-2 rounded-md" 
                    value={lastName} 
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Dela Cruz"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Middle Name <span className="text-gray-500 text-xs">(Leave blank if N/A)</span></label>
                <input 
                  className="w-full border-2 border-black px-3 py-2 rounded-md" 
                  value={middleName} 
                  onChange={e => setMiddleName(e.target.value)}
                  placeholder="Santos (optional)"
                />
              </div>
            </>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-1">
              {isSignUp ? 'Email (Active Email Address)' : 'Email'}
            </label>
            <input 
              type="email"
              className="w-full border-2 border-black px-3 py-2 rounded-md" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              placeholder={isSignUp ? 'example@email.com' : ''}
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"}
                className="w-full border-2 border-black px-3 py-2 pr-10 rounded-md" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-black p-1 cursor-pointer rounded-md"
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

          {!isSignUp && (
            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 border-2 border-black cursor-pointer"
              />
              <label htmlFor="rememberMe" className="ml-2 text-sm text-black cursor-pointer">
                Remember me
              </label>
            </div>
          )}

          {isSignUp && (
            <div>
              <label className="block text-sm font-medium mb-1">Confirm Password</label>
              <div className="relative">
                <input 
                  type={showConfirmPassword ? "text" : "password"}
                  className="w-full border-2 border-black px-3 py-2 pr-10 rounded-md" 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-black p-1"
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
          )}

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full bg-black text-white py-2 border-2 border-black disabled:opacity-50 cursor-pointer rounded-xl"
          >
            {loading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
          </form>
        )}

        {!showOtpInput && !isSignUp && (
          <>
            <div className="my-4 flex items-center">
              <div className="flex-1 border-t-2 border-black"></div>
              <span className="px-4 text-sm text-black">OR</span>
              <div className="flex-1 border-t-2 border-black"></div>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white border-1 border-black text-black py-2 px-4 disabled:opacity-50 cursor-pointer rounded-xl"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            <button
              onClick={handleFacebookSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-[#1877F2] border-2 border-[#1877F2] text-white py-2 px-4 disabled:opacity-50 mt-3 hover:bg-[#166FE5] cursor-pointer rounded-xl"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Continue with Facebook
            </button>
          </>
        )}

        {!showOtpInput && (
          <>
        <div className="mt-4 text-center text-sm">
          <button 
            className="text-black underline cursor-pointer" 
            onClick={() => {
              setIsSignUp(s => !s)
              setMessage(null)
              setShowPassword(false)
              setShowConfirmPassword(false)
            }}
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
          </>
        )}
      </div>
    </div>
  )
}
