import { createClient } from '@supabase/supabase-js'

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase public client is not configured')
  }

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  const { data, error } = await publicClient.auth.getUser(token)
  if (error || !data?.user) {
    throw new Error('Unauthorized request')
  }

  return data.user
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
