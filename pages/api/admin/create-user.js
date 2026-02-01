import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { email, password, first_name, middle_name, last_name, phone, role } = req.body

    if (!email || !password || !first_name || !last_name || !role) {
        return res.status(400).json({ error: 'Missing required fields' })
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    try {
        // 1. Create the Auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email for admin-created users
        })

        if (authError) throw authError

        const userId = authData.user.id

        // 2. Create the profile record
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert({
                id: userId,
                email,
                first_name,
                middle_name: middle_name || null,
                last_name,
                phone: phone || null,
                role,
                is_verified: true,
                is_deleted: false,
            })

        if (profileError) {
            // Rollback: delete the auth user if profile creation fails
            await supabaseAdmin.auth.admin.deleteUser(userId)
            throw profileError
        }

        return res.status(200).json({ message: 'User created successfully', userId })

    } catch (error) {
        console.error('Create user error:', error)
        return res.status(500).json({ error: error.message })
    }
}
