# 📸 Image Upload Setup Guide

## What Was Added

### 1. **Modal Background Fixed** ✅
- **File**: `components/AuthModal.js`
- **Fix**: Changed from single `bg-black bg-opacity-50` to separate overlay layer
- **Result**: Modal now has proper white background with semi-transparent dark overlay

### 2. **Property Image Upload** ✅
- **File**: `pages/properties/new.js`
- **Features Added**:
  - Multiple image URL fields (paste links)
  - Upload from computer (files)
  - Image preview thumbnails
  - Add/remove image fields
  - File validation (type & size)

### 3. **Database Schema Update** ✅
- **File**: `db/add_images_column.sql`
- **Change**: Added `images` column (text array) to `properties` table

---

## 🚨 REQUIRED SETUP STEPS

### Step 1: Add Images Column to Database

1. **Open Supabase Dashboard**: https://supabase.com/dashboard
2. **Select Project**: `zyyrarvawwqpnolukuav`
3. **Go to SQL Editor**: Click "SQL Editor" in left sidebar
4. **Run This SQL**:

```sql
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS images text[];

COMMENT ON COLUMN properties.images IS 'Array of image URLs for the property';
```

5. **Click "Run"** - You should see "Success"

---

### Step 2: Create Storage Bucket for Property Images

1. **Go to Storage**: Click "Storage" in left sidebar
2. **Create New Bucket**:
   - Click "Create a new bucket"
   - **Name**: `property-images`
   - **Public bucket**: ✅ **CHECK THIS** (so images are publicly accessible)
   - Click "Create bucket"

3. **Set Bucket Policies**: Click on `property-images` bucket → "Policies"
   - Click "Add Policy" → "For full customization"
   - **Policy Name**: `Allow authenticated users to upload`
   - **Policy Definition**:

```sql
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'property-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

   - Click "Review" → "Save policy"

4. **Add Read Policy**:
   - Click "Add Policy" → "For full customization"
   - **Policy Name**: `Public can view images`
   - **Policy Definition**:

```sql
CREATE POLICY "Anyone can view property images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'property-images');
```

   - Click "Review" → "Save policy"

---

### Step 3: Update RLS Policies (if needed)

If you get permission errors, run this in SQL Editor:

```sql
-- Allow users to insert properties with images
DROP POLICY IF EXISTS "Landlords can insert properties" ON properties;

CREATE POLICY "Landlords can insert properties"
ON properties FOR INSERT
TO authenticated
WITH CHECK (
  landlord = auth.uid() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'landlord'
  )
);
```

---

## 🎨 How to Use Image Upload

### Option 1: Paste Image URLs
1. Click "Add Property"
2. Scroll to "Property Images" section
3. Paste image URL (e.g., from Unsplash, Imgur, etc.)
4. Click "+ Add Image" for more URLs
5. Preview appears below each URL

### Option 2: Upload from Computer
1. Click "Upload from computer" link
2. Select image file (max 5MB)
3. Wait for "Image uploaded successfully!" message
4. Preview appears automatically
5. URL is auto-filled

### Image Management:
- **Add more**: Click "+ Add Image" button (up to 10)
- **Remove**: Click "×" button next to image field
- **Preview**: Thumbnails show below each URL

---

## 🧪 Testing

1. **Create admin account** (follow `db/create_admin.sql`)
2. **Login as landlord**: `admin@easerent.com`
3. **Go to Add Property**: Click "Add Property" in navbar
4. **Fill form and add images**:
   - Upload 2-3 images from computer
   - Or paste image URLs
5. **Submit**: Click "Create Property"
6. **Verify**: Check properties list to see images

---

## 📁 File Structure

```
property-images/
├── {user-id}/
│   ├── 1730000000000.jpg
│   ├── 1730000001000.png
│   └── 1730000002000.webp
└── {another-user-id}/
    └── ...
```

Each user's images are stored in their own folder (by user ID).

---

## 🔍 Troubleshooting

**"Error uploading image"**
- Check if `property-images` bucket exists
- Verify bucket is set to **Public**
- Check Storage policies are created

**Images not showing in preview**
- Check URL is valid (try opening in new tab)
- Verify image format (jpg, png, gif, webp)
- Check file size (must be under 5MB)

**Permission denied**
- Verify you're logged in as landlord
- Check RLS policies in SQL Editor
- Ensure Storage policies are active

---

## 🎯 Quick Checklist

- [ ] Run `db/add_images_column.sql` in SQL Editor
- [ ] Create `property-images` bucket (set to Public)
- [ ] Add upload policy for authenticated users
- [ ] Add read policy for public access
- [ ] Test uploading an image
- [ ] Verify image appears in preview
- [ ] Check image shows on property listing

---

## 💡 Tips

- **Recommended image size**: 1200x800px for best results
- **Format**: JPG or WebP for smaller file sizes
- **First image**: Will be used as the main property thumbnail
- **Backup URLs**: You can use external URLs (Unsplash, Cloudinary, etc.)

That's it! You now have full image upload support! 📸
