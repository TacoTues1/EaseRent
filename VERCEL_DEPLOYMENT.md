# Vercel Deployment Checklist

## ✅ Current Status

### Local Changes Made
1. ✅ Created `lib/supabaseAdmin.js` - Admin client for API routes
2. ✅ Updated `pages/api/send-email.js` - Uses admin client to bypass RLS
3. ✅ Fixed all `.single()` to `.maybeSingle()` errors
4. ✅ Fixed email `from` address in `lib/email.js`

### Local Environment Variables (Already Set)
```env
NEXT_PUBLIC_SUPABASE_URL=https://zyyrarvawwqpnolukuav.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... ✅
RESEND_API_KEY=re_WVKo2gtc... ✅
```

## 🚀 Vercel Deployment Steps

### Step 1: Add Environment Variables to Vercel
You need to add these to your Vercel project:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (EaseRent)
3. Go to **Settings** → **Environment Variables**
4. Add the following variables:

| Variable Name | Value | Environment |
|--------------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zyyrarvawwqpnolukuav.supabase.co` | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5eXJhcnZhd3dxcG5vbHVrdWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2MzE2MTAsImV4cCI6MjA3NzIwNzYxMH0.oX7ep9QIkc04eGzOzkegFL5zxUSSzZ-5yW3IMMgiUBM` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5eXJhcnZhd3dxcG5vbHVrdWF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTYzMTYxMCwiZXhwIjoyMDc3MjA3NjEwfQ.aqUdCp1UwlaNPsUg8DyOWi8QBRkcdbDyNGp9LC8LlW4` | All |
| `RESEND_API_KEY` | `re_WVKo2gtc_Fzdb64CjCHXVFVpBSKQoZq4b` | All |

**Important**: Make sure to select **"All"** environments (Production, Preview, Development) for each variable.

### Step 2: Push Changes to GitHub
```bash
git add .
git commit -m "Fix email API: use admin client and correct email format"
git push origin main
```

### Step 3: Wait for Deployment
- Vercel will automatically detect the push and deploy
- Watch the deployment in your Vercel dashboard
- Check the deployment logs for any errors

### Step 4: Test the Email Feature
1. Go to https://ease-rent.vercel.app
2. Login as a landlord
3. Approve a booking request
4. Check that the email sends successfully

## 🔍 Troubleshooting

### If Email Still Fails:

**1. Check Vercel Function Logs**
- Go to Vercel Dashboard → Your Project → Deployments
- Click on the latest deployment
- Go to "Functions" tab
- Look for `/api/send-email` logs

**2. Verify Environment Variables**
- Vercel Dashboard → Settings → Environment Variables
- Make sure `SUPABASE_SERVICE_ROLE_KEY` is present
- Make sure `RESEND_API_KEY` is present

**3. Check Resend Dashboard**
- Go to [Resend Dashboard](https://resend.com/emails)
- Check if emails are being sent
- Look for any error messages

**4. Common Issues**
- ❌ Missing `SUPABASE_SERVICE_ROLE_KEY` → Add it to Vercel
- ❌ Wrong Resend API key → Verify in Resend dashboard
- ❌ Email address not found → User may not have completed signup

**Note**: Email retrieval works for **all authentication methods**:
- ✅ Email/Password signup
- ✅ Google OAuth (email from Google account)
- ✅ Facebook OAuth (email from Facebook account)
- ✅ Any other OAuth provider configured in Supabase

The API uses `supabaseAdmin.auth.admin.getUserById()` which retrieves the email from `auth.users` regardless of the authentication method used.

## 📝 Next Steps After Deployment

1. Test email sending with a real booking
2. Monitor Vercel function logs for any errors
3. Check Resend dashboard to see sent emails
4. Verify tenant receives the email

## 🎉 Success Indicators

You'll know it's working when:
- ✅ No 500 error in browser console
- ✅ "Email sent successfully" toast appears
- ✅ Email appears in Resend dashboard
- ✅ Tenant receives the email
