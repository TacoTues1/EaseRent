# EaseRent Deployment Guide

## Prerequisites
- GitHub account
- Vercel or Netlify account
- Supabase project set up

## Option 1: Deploy to Vercel (Recommended)

### Step 1: Prepare Repository
1. Initialize git in your project:
```powershell
git init
git add .
git commit -m "Initial commit"
```

2. Create a GitHub repository and push:
```powershell
git remote add origin https://github.com/your-username/easerent.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

### Step 3: Add Environment Variables
In Vercel project settings, add these environment variables:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://your-project.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `your-anon-key`

### Step 4: Deploy
Click "Deploy" and wait for the build to complete. Your app will be live at `https://your-project.vercel.app`

---

## Option 2: Deploy to Netlify

### Step 1: Prepare Repository
Same as Vercel (git init, commit, push to GitHub)

### Step 2: Deploy on Netlify
1. Go to [netlify.com](https://netlify.com) and sign in
2. Click "Add new site" → "Import an existing project"
3. Connect to GitHub and select your repository
4. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
   - **Base directory**: (leave empty)

### Step 3: Add Environment Variables
In Netlify site settings → Environment variables, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 4: Deploy
Click "Deploy site" and wait for the build to complete.

---

## Post-Deployment Steps

### 1. Configure Supabase URL Redirect
In your Supabase project settings:
- Go to Authentication → URL Configuration
- Add your deployment URL to "Site URL"
- Add redirect URLs (e.g., `https://yoursite.vercel.app/auth/callback`)

### 2. Enable Row Level Security (RLS)
For production, enable RLS policies in Supabase:

```sql
-- Example: Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Repeat for other tables (properties, payments, etc.)
```

### 3. Test Your Deployment
- Visit your deployed URL
- Test sign-up and sign-in
- Create a test property (as landlord)
- Submit a test application (as tenant)
- Verify real-time notifications work

### 4. Set Up Custom Domain (Optional)
- **Vercel**: Project Settings → Domains → Add custom domain
- **Netlify**: Site Settings → Domain Management → Add custom domain

---

## Troubleshooting

### Build Fails
- Check that all environment variables are set correctly
- Ensure `.env.local` is in `.gitignore` (don't commit secrets)
- Verify your Supabase project is active

### Authentication Not Working
- Check Supabase Auth settings
- Verify redirect URLs match your deployment URL
- Enable email confirmations or disable in Supabase Auth

### Database Errors
- Ensure all tables are created from `db/schema.sql`
- Check RLS policies if access is denied
- Verify Supabase connection from deployment logs

---

## Performance Optimization

### 1. Enable Image Optimization
Add to `next.config.js`:
```javascript
module.exports = {
  images: {
    domains: ['your-project.supabase.co'], // for Supabase Storage
  },
}
```

### 2. Enable Caching
Use Vercel's edge caching or Netlify's CDN (enabled by default)

### 3. Database Indexes
Ensure indexes exist for common queries (already in schema.sql)

---

## Monitoring & Analytics

### Vercel Analytics
- Enable in Project Settings → Analytics
- View real-time performance metrics

### Supabase Dashboard
- Monitor database usage
- Check API requests
- View Auth statistics

### Error Tracking (Optional)
Integrate Sentry or similar:
```powershell
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```

---

## Continuous Deployment

Both Vercel and Netlify auto-deploy when you push to your main branch:
```powershell
git add .
git commit -m "Update feature"
git push
```

Your site will automatically rebuild and redeploy.

---

## Security Checklist

- [ ] Environment variables set in deployment platform
- [ ] `.env.local` in `.gitignore`
- [ ] RLS policies enabled on all tables
- [ ] Supabase Auth email confirmation enabled
- [ ] HTTPS enforced (automatic with Vercel/Netlify)
- [ ] API rate limiting configured in Supabase
- [ ] Regular backups enabled in Supabase

---

## Support

For deployment issues:
- Vercel: [vercel.com/docs](https://vercel.com/docs)
- Netlify: [docs.netlify.com](https://docs.netlify.com)
- Supabase: [supabase.com/docs](https://supabase.com/docs)
