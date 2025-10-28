import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const router = useRouter()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        
        // Create profile as tenant (default role)
        if (data.user) {
          await supabase.from('profiles').insert({
            id: data.user.id,
            full_name: fullName,
            role: 'tenant' // Always tenant for public signup
          })
        }
        
        setMessage('Sign-up complete. Check your email for confirmation.')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // on success, redirect to dashboard
        router.push('/dashboard')
      }
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-6 bg-white rounded shadow">
        <h2 className="text-xl font-semibold mb-4">{isSignUp ? 'Sign up' : 'Sign in'}</h2>
        {message && <div className="mb-3 text-sm text-red-600">{message}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          {isSignUp && (
            <div>
              <label className="block text-sm">Full Name</label>
              <input 
                className="w-full border rounded px-3 py-2" 
                value={fullName} 
                onChange={e => setFullName(e.target.value)}
                required
              />
            </div>
          )}
          <div>
            <label className="block text-sm">Email</label>
            <input 
              type="email"
              className="w-full border rounded px-3 py-2" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm">Password</label>
            <input 
              type="password" 
              className="w-full border rounded px-3 py-2" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded">
            {loading ? 'Please wait...' : (isSignUp ? 'Create account' : 'Sign in')}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <button className="text-blue-600" onClick={() => setIsSignUp(s => !s)}>
            {isSignUp ? 'Have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  )
}
