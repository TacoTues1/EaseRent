// pages/api/delete-account.js
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId } = req.body

  if (!userId) {
    return res.status(400).json({ error: 'Missing user ID' })
  }

  // Initialize Supabase with SERVICE ROLE key (Admin privileges)
  // You need to add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your .env.local
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // 1. Mark the profile as deleted (Soft Delete)
    // We do this first to ensure the flag is set before the auth user is removed
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ is_deleted: true })
      .eq('id', userId)

    if (updateError) {
      throw updateError
    }

    // 2. Delete the Auth User (Hard Delete)
    // This frees up the email address so they can register again with a NEW ID
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      throw deleteError
    }

    return res.status(200).json({ message: 'Account deleted successfully' })

  } catch (error) {
    console.error('Delete error:', error)
    return res.status(500).json({ error: error.message })
  }
}