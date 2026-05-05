import { supabase } from './supabaseClient'

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || ''
  if (!header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim()
}

export async function getAuthenticatedUser(req) {
  const token = getBearerToken(req)
  if (!token) {
    throw new Error('Missing access token')
  }

  try {
    const { data, error } = await supabase.auth.getUser(token)
    
    if (error) {
      console.error('Supabase auth error:', error)
      throw new Error(error.message || 'Unauthorized request')
    }
    
    if (!data?.user) {
      throw new Error('Unauthorized request')
    }

    return data.user
  } catch (err) {
    if (err.message === 'fetch failed' || err.code === 'ETIMEDOUT') {
      throw new Error('Authentication server unreachable. Please check your internet connection.')
    }
    throw err
  }
}

export async function getAdminProfile(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, email, role, is_deleted')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed loading admin profile: ${error.message}`)
  }

  if (!data || data.role !== 'admin' || data.is_deleted === true) {
    throw new Error('Only admins can use this endpoint')
  }

  return data
}
