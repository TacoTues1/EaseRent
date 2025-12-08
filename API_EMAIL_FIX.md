# API Email Endpoint Fix

## Issue
The `/api/send-email` endpoint was returning 404 or "Booking not found" errors on Vercel because the Supabase client was subject to Row Level Security (RLS) policies.

## Solution
Created a server-side admin Supabase client that bypasses RLS for API routes.

## Files Changed

### 1. Created `lib/supabaseAdmin.js`
```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Admin client bypasses RLS - use only in API routes
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})
```

### 2. Updated `pages/api/send-email.js`
- Changed import from `supabase` to `supabaseAdmin`
- Now uses service role key to bypass RLS when fetching booking data

## Environment Variables Required

### Local Development (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
```

### Vercel Deployment
Add this environment variable in Vercel Dashboard:
1. Go to your project settings → Environment Variables
2. Add `SUPABASE_SERVICE_ROLE_KEY` with your service role key value
3. **Important**: Select "All" environments or at least "Production"
4. Redeploy your application

## Where to Find Service Role Key
1. Go to your Supabase project dashboard
2. Click on Settings (⚙️) in the sidebar
3. Navigate to API section
4. Copy the **service_role** key (marked as "secret")
5. **NEVER commit this to git or expose it client-side!**

## Security Notes
- The service role key **bypasses all RLS policies**
- Only use `supabaseAdmin` in API routes (server-side)
- Never import `supabaseAdmin` in client-side pages or components
- The anon key (`supabase`) should still be used for all client-side operations

## Testing
After adding the environment variable to Vercel:
1. Trigger a new deployment (or wait for automatic deployment)
2. Test the booking approval email functionality
3. Check Vercel function logs if issues persist

## Verification
The email should now send successfully when landlords approve a booking request.
