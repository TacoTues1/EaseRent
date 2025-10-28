import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'

export default function AuthModal({ isOpen, onClose, initialMode = 'signin' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const router = useRouter()

  // Update mode when initialMode prop changes
  useEffect(() => {
    if (isOpen) {
      setIsSignUp(initialMode === 'signup')
      setMessage(null)
      setEmail('')
      setPassword('')
      setFullName('')
    }
  }, [isOpen, initialMode])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName
            }
          }
        })
        
        if (error) throw error
        
        console.log('SignUp response:', data) // Debug log
        
        if (data.user) {
          // Insert profile - handle both confirmed and unconfirmed users
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            full_name: fullName,
            role: 'tenant'
          })
          
          if (profileError) {
            console.error('Profile creation error:', profileError)
            throw new Error('Account created but profile setup failed. Please contact support.')
          }
          
          // Check if email confirmation is required
          if (data.session) {
            // User is auto-confirmed, redirect to dashboard
            setMessage('Sign-up complete! Redirecting...')
            setTimeout(() => {
              onClose()
              router.push('/dashboard')
            }, 1500)
          } else {
            // Email confirmation required
            setMessage('Sign-up complete! Check your email to confirm your account, then sign in.')
            setTimeout(() => setIsSignUp(false), 3000)
          }
        }
      } else {
        // Sign In
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        
        if (error) {
          console.error('Sign in error:', error)
          
          // Provide helpful error messages
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Invalid email or password. Please check and try again.')
          } else if (error.message.includes('Email not confirmed')) {
            throw new Error('Please confirm your email before signing in. Check your inbox.')
          } else {
            throw error
          }
        }
        
        // console.log('Sign in successful:', data)
        onClose()
        router.push('/dashboard')
      }
    } catch (err) {
      console.error('Auth error:', err) // Debug log
      setMessage(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" onClick={onClose}>
      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-black opacity-50"></div>
      
      {/* Modal content */}
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md relative z-10" onClick={e => e.stopPropagation()}>
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl"
        >
          ×
        </button>
        
        <h2 className="text-2xl font-bold mb-4 text-gray-900">{isSignUp ? 'Create Account' : 'Sign In'}</h2>
        
        {message && (
          <div className={`mb-4 p-3 rounded text-sm ${
            message.includes('complete') || message.includes('successful') 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <input 
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                value={fullName} 
                onChange={e => setFullName(e.target.value)}
                required
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input 
              type="email"
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input 
              type="password" 
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <button 
            className="text-blue-600 hover:underline" 
            onClick={() => {
              setIsSignUp(s => !s)
              setMessage(null)
            }}
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  )
}
