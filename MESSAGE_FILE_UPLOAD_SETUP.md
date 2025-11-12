# 📎 Message File Upload Feature - Setup Guide

## ✅ What's Been Added

### 1. **Database Changes**
- Added 4 new columns to the `messages` table:
  - `file_url` - URL to the uploaded file
  - `file_name` - Original filename
  - `file_type` - MIME type (e.g., image/png, application/pdf)
  - `file_size` - File size in bytes

### 2. **Frontend Features**
- ✅ File attachment button in message input
- ✅ File preview before sending
- ✅ Support for images (shows preview in chat)
- ✅ Support for documents (PDF, DOC, DOCX, TXT)
- ✅ File size limit (10MB)
- ✅ Upload progress indicator
- ✅ Download/view file functionality
- ✅ Optimistic UI updates

---

## 🚀 Setup Instructions

### **Step 1: Run Database Migration**

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `db/ADD_FILE_ATTACHMENTS_TO_MESSAGES.sql`
4. Click **Run** to execute the migration

This will add the necessary columns to your `messages` table.

---

### **Step 2: Create Storage Bucket**

1. Go to **Storage** in your Supabase Dashboard
2. Click **Create a new bucket**
3. Enter the following details:
   - **Name:** `message-attachments`
   - **Public bucket:** ❌ **Leave UNCHECKED** (files should be private)
   - **File size limit:** 10 MB (or your preferred limit)
   - **Allowed MIME types:** Leave empty or add:
     - `image/*`
     - `application/pdf`
     - `application/msword`
     - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
     - `text/plain`

4. Click **Save**

---

### **Step 3: Set Storage Policies**

Go to **Storage** → **Policies** → **message-attachments** bucket

#### **Policy 1: Allow Upload**
```sql
-- Policy name: Users can upload message attachments
-- Allowed operation: INSERT
-- Target roles: authenticated

-- Policy definition:
bucket_id = 'message-attachments' 
AND auth.uid()::text = (storage.foldername(name))[1]
```

#### **Policy 2: Allow View/Download**
```sql
-- Policy name: Users can view message attachments
-- Allowed operation: SELECT
-- Target roles: authenticated

-- Policy definition:
bucket_id = 'message-attachments' 
AND EXISTS (
  SELECT 1 FROM messages m
  WHERE m.file_url LIKE '%' || name 
  AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
)
```

#### **Policy 3: Allow Delete**
```sql
-- Policy name: Users can delete their message attachments
-- Allowed operation: DELETE
-- Target roles: authenticated

-- Policy definition:
bucket_id = 'message-attachments' 
AND auth.uid()::text = (storage.foldername(name))[1]
```

---

## 🎯 How It Works

### **For Users:**

1. **Attach a File:**
   - Click the 📎 attachment icon in the message input
   - Select a file (images, PDFs, documents)
   - File preview appears above the input

2. **Send Message with File:**
   - Type a message (optional)
   - Click Send
   - File uploads and message is sent

3. **View File in Chat:**
   - **Images:** Display inline with preview
   - **Documents:** Show file icon with download button
   - Click to open/download

### **Technical Flow:**

1. User selects file → Validates size (max 10MB)
2. User clicks Send → File uploads to Supabase Storage
3. File uploaded to: `message-attachments/{user_id}/{conversation_id}/{random_filename}`
4. Public URL generated and saved to database
5. Message created with file metadata
6. Real-time update shows message with file attachment

---

## 📁 Supported File Types

- **Images:** PNG, JPG, JPEG, GIF, WebP
- **Documents:** PDF, DOC, DOCX, TXT

You can add more by updating the `accept` attribute in `messages.js`:
```javascript
accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
```

---

## 🔒 Security Features

1. **File Size Validation:** Maximum 10MB per file
2. **User Authentication:** Only authenticated users can upload
3. **Access Control:** Users can only view files in their conversations
4. **Organized Storage:** Files stored in user-specific folders
5. **Private Bucket:** Files not publicly accessible without proper permissions

---

## 🎨 UI Features

### **Message with Image:**
```
┌─────────────────────────┐
│ [Image Preview]         │
│ 📷 photo.jpg            │
│ 2:30 PM                 │
└─────────────────────────┘
```

### **Message with Document:**
```
┌─────────────────────────┐
│ 📄 document.pdf         │
│ 2.5 MB                  │
│ [Download Icon]         │
│ 2:30 PM                 │
└─────────────────────────┘
```

### **File Preview (before sending):**
```
┌─────────────────────────────────┐
│ 📎 contract.pdf  [X]            │
│ 1.2 MB                          │
└─────────────────────────────────┘
```

---

## 🧪 Testing Guide

1. **Test Image Upload:**
   - Select a small image (< 1MB)
   - Send in a conversation
   - Verify image displays inline

2. **Test Document Upload:**
   - Select a PDF file
   - Send in a conversation
   - Click download icon to verify download works

3. **Test Size Limit:**
   - Try uploading a file > 10MB
   - Should show error toast

4. **Test Message + File:**
   - Type a message AND attach a file
   - Both should appear in the message bubble

5. **Test File-Only Message:**
   - Attach file without typing message
   - Should send with default "📎 File attachment" text

---

## 🐛 Troubleshooting

### **Error: "Failed to upload file"**
- Check that `message-attachments` bucket exists
- Verify storage policies are configured correctly
- Check browser console for detailed error

### **Files not visible**
- Ensure storage SELECT policy is set up
- Check that file_url is being saved correctly in database

### **Upload stuck**
- Check file size (must be < 10MB)
- Verify internet connection
- Check Supabase storage quota

---

## 📊 Database Schema

After running the migration, your `messages` table will have:

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID,
  sender_id UUID,
  receiver_id UUID,
  message TEXT,
  file_url TEXT,        -- NEW: URL to file
  file_name TEXT,       -- NEW: Original filename
  file_type TEXT,       -- NEW: MIME type
  file_size BIGINT,     -- NEW: Size in bytes
  read BOOLEAN,
  created_at TIMESTAMPTZ
);
```

---

## 🎉 You're All Set!

Once you complete the setup steps above, users will be able to:
- ✅ Send images in messages
- ✅ Send documents (PDF, DOC, etc.)
- ✅ View image previews inline
- ✅ Download attached files
- ✅ See file metadata (name, size)

Need help? Check the Supabase Storage documentation or review the code in `pages/messages.js`! 🚀
