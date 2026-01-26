import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Create client only if env vars are available. During build/time in CI these may be absent,
// so provide a lightweight stub to avoid throwing during Next.js build. At runtime (dev/prod),
// ensure you set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local or in the
// environment where Next runs.

export const getSupabaseClient = (rememberMe = true) => {
  if (typeof window === 'undefined') return supabase

  return createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        storage: rememberMe ? localStorage : sessionStorage,
        autoRefreshToken: true,
      },
    }
  )
}

let supabase
if (supabaseUrl && supabaseAnonKey) {
	supabase = createClient(supabaseUrl, supabaseAnonKey)
} else {
	// minimal stub (safe no-op) used during build when env isn't set
	supabase = {
		auth: {
			getSession: async () => ({ data: { session: null } }),
			onAuthStateChange: () => ({ subscription: { unsubscribe: () => {} } }),
		},
		from: () => ({ select: async () => ({ data: null }) }),
		// add other helpers as needed
	}
}

export { supabase }
