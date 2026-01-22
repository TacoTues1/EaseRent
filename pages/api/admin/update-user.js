import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId, email, password, profileData } = req.body

  if (!userId) {
    return res.status(400).json({ error: 'Missing user ID' })
  }

  // Initialize Supabase Admin Client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const updates = {}
    if (email) updates.email = email
    if (password) updates.password = password

    // 1. Update Auth User (Email/Password)
    if (Object.keys(updates).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        updates
      )
      if (authError) throw authError
    }

    // 2. Update Public Profile
    if (profileData) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileData)
        .eq('id', userId)

      if (profileError) throw profileError
    }

    return res.status(200).json({ message: 'User updated successfully' })

  } catch (error) {
    console.error('Update error:', error)
    return res.status(500).json({ error: error.message })
  }
}