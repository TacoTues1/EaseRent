# 🚨 QUICK FIX: Bucket Not Found Error

## The Error You're Seeing:
```
StorageApiError: Bucket not found
POST https://...supabase.co/storage/v1/object/property-images/... 400 (Bad Request)
```

## What It Means:
The `property-images` storage bucket doesn't exist in your Supabase project yet.

---

## ✅ **SOLUTION (3 Minutes)**

### **Step 1: Create Storage Bucket** (1 min)

1. Open: https://supabase.com/dashboard
2. Select your project: `zyyrarvawwqpnolukuav`
3. Click **"Storage"** in left sidebar
4. Click **"Create a new bucket"** button (green button, top right)
5. Fill in:
   - **Name**: `property-images` (exactly this, no spaces)
   - **Public bucket**: ✅ **CHECK THIS BOX** (important!)
   - Leave other settings as default
6. Click **"Create bucket"**

✅ Done! You should see `property-images` in the list.

---

### **Step 2: Set Bucket Policies** (1 min)

1. Click on `property-images` bucket (in the list)
2. Click **"Policies"** tab at the top
3. Click **"New Policy"** button
4. Click **"For full customization"**

**Policy 1 - Allow Upload:**
- **Policy name**: `Allow authenticated uploads`
- **Allowed operation**: `INSERT`
- Click the **Policy definition** tab
- Paste this SQL:
```sql
(bucket_id = 'property-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)
```
- Click **"Save policy"**

**Policy 2 - Allow Read:**
- Click **"New Policy"** again
- **Policy name**: `Public read access`
- **Allowed operation**: `SELECT`
- **Target roles**: `public`
- Click the **Policy definition** tab
- Paste this SQL:
```sql
(bucket_id = 'property-images'::text)
```
- Click **"Save policy"**

✅ Done! You should see 2 policies listed.

---

### **Step 3: Test Upload** (30 sec)

1. Refresh your browser: http://localhost:3000
2. Go to **"Add Property"**
3. Try uploading an image again
4. ✅ Should work now!

---

## 🎯 **Alternative: Use Image URLs Instead**

**If you don't want to set up Storage right now**, you can still use the image feature by **pasting image URLs**:

1. Go to: https://unsplash.com
2. Find any house/property image
3. Right-click → Copy image address
4. Paste in the "Property Images" field
5. ✅ Works immediately, no setup needed!

Example URLs you can use:
```
https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200
https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200
https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200
```

---

## 📋 **Quick Checklist**

- [ ] Go to Supabase Dashboard → Storage
- [ ] Create bucket: `property-images` (Public ✅)
- [ ] Add 2 policies (Upload + Read)
- [ ] Refresh browser
- [ ] Test upload

**Time needed**: ~3 minutes

---

## 🔍 **Verify Setup**

After creating the bucket, you should see:
- ✅ Bucket named `property-images` in Storage
- ✅ "Public" badge on the bucket
- ✅ 2 policies listed under Policies tab
- ✅ Upload works without errors

---

## 💡 **Pro Tip**

The app now shows a **helpful error message** if the bucket isn't set up:
```
Storage bucket not set up. Please create "property-images" bucket 
in Supabase Dashboard → Storage. See IMAGE_UPLOAD_GUIDE.md for instructions.
```

You'll see this message instead of the technical error, making it easier to know what to do!

---

## 🆘 **Still Having Issues?**

1. **Check bucket name**: Must be exactly `property-images` (lowercase, with hyphen)
2. **Check "Public" checkbox**: Must be enabled
3. **Check policies**: Should see 2 policies (upload + read)
4. **Clear cache**: Ctrl+Shift+R in browser
5. **Check console**: Press F12, look for specific error messages

---

**Let's get this working!** Follow Step 1 & 2 above, should take ~3 minutes total. 🚀
