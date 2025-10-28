# 🎯 BUCKET ERROR - SIMPLE FIX

## The Problem
You're seeing: **"StorageApiError: Bucket not found"**

This means the storage bucket for property images doesn't exist yet.

---

## ⚡ Quick Fix (3 Minutes)

### 1️⃣ Go to Supabase Storage
- Open: https://supabase.com/dashboard
- Select your project
- Click **"Storage"** (left sidebar)

### 2️⃣ Create Bucket
- Click **"Create a new bucket"**
- Name: `property-images`
- **✅ Check "Public bucket"** ← Important!
- Click **"Create bucket"**

### 3️⃣ Add Upload Policy
- Click on `property-images` bucket
- Click **"Policies"** tab
- Click **"New Policy"** → **"For full customization"**
- Name: `Allow authenticated uploads`
- Allowed operation: **INSERT**
- Policy definition (paste this):
```sql
(bucket_id = 'property-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)
```
- Click **"Save policy"**

### 4️⃣ Add Read Policy
- Click **"New Policy"** again
- Name: `Public read access`
- Allowed operation: **SELECT**
- Target roles: **public**
- Policy definition (paste this):
```sql
(bucket_id = 'property-images'::text)
```
- Click **"Save policy"**

### 5️⃣ Test
- Refresh your browser: http://localhost:3000
- Try uploading an image again
- ✅ Should work!

---

## 🎨 Alternative: Use URLs Instead

Don't want to set up Storage right now? **Just paste image URLs!**

Example URLs to use:
```
https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200
https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200
```

This works immediately with no setup needed!

---

## ✅ Checklist
- [ ] Created `property-images` bucket
- [ ] Checked "Public bucket"
- [ ] Added upload policy (INSERT)
- [ ] Added read policy (SELECT)
- [ ] Refreshed browser
- [ ] Tested upload

---

**That's it!** The app now shows helpful error messages to guide you. 🚀
