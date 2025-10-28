# Google Authentication Setup Guide

## Prerequisites
- A Supabase project
- A Google Cloud Platform account

## Step 1: Set up Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Go to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Configure the OAuth consent screen if prompted:
   - User Type: External
   - Fill in the required information (App name, User support email, Developer contact)
6. For Application type, select **Web application**
7. Add Authorized redirect URIs:
   - Add: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - For local development, also add: `http://localhost:3000/auth/v1/callback`
8. Click **Create**
9. Copy your **Client ID** and **Client Secret**

## Step 2: Configure Supabase

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to **Authentication** > **Providers**
4. Find **Google** in the list and click to expand
5. Enable Google provider
6. Paste your **Client ID** and **Client Secret** from Step 1
7. Click **Save**

## Step 3: Update Site URL (Important!)

1. In Supabase Dashboard, go to **Authentication** > **URL Configuration**
2. Set **Site URL** to your production URL (e.g., `https://yourdomain.com`)
3. Add **Redirect URLs**:
   - `http://localhost:3000/dashboard` (for local development)
   - `https://yourdomain.com/dashboard` (for production)

## Step 4: Test the Integration

1. Start your development server: `npm run dev`
2. Go to `http://localhost:3000/auth`
3. Click the "Continue with Google" button
4. Sign in with your Google account
5. You should be redirected to the dashboard

## Features Implemented

✅ **Google Sign-In Button** - Added to auth page with Google branding
✅ **Automatic Profile Creation** - Creates a tenant profile for new Google users
✅ **Redirect Handling** - Automatically redirects to dashboard after authentication
✅ **Session Management** - Maintains user session across page refreshes

## Code Changes Made

### 1. `pages/auth/index.js`
- Added `handleGoogleSignIn()` function
- Added Google sign-in button with proper styling and Google logo
- Added "OR" divider between email/password and Google auth

### 2. `pages/dashboard.js`
- Updated `loadProfile()` to create a profile if one doesn't exist
- Extracts user's name from Google metadata or email

## Troubleshooting

### "redirect_uri_mismatch" Error
- Make sure the redirect URI in Google Cloud Console exactly matches your Supabase callback URL
- Format: `https://<your-project-ref>.supabase.co/auth/v1/callback`

### User Not Redirected After Login
- Check that your Site URL and Redirect URLs are configured correctly in Supabase
- Verify that the dashboard route exists and is accessible

### Profile Not Created
- Check browser console for errors
- Verify that the `profiles` table has the correct structure
- Ensure RLS policies allow INSERT for authenticated users

### Can't Find Supabase Project Reference
- Go to Supabase Dashboard > Settings > API
- Your project URL shows your project reference

## Security Notes

⚠️ **Never commit your Google Client Secret to version control**
⚠️ **Always use environment variables for sensitive credentials**
⚠️ **Enable email verification in production**
⚠️ **Review and configure OAuth scopes appropriately**

## Additional Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Supabase Auth with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
