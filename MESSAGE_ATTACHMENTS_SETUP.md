# Message Attachments Setup Guide

## Error You're Seeing
```
StorageApiError: Bucket not found
```

This happens because the `message-attachments` storage bucket hasn't been created in Supabase yet.

## Quick Fix (Choose ONE method)

### Method 1: Manual Setup (Easiest - Recommended)

1. **Create the Bucket**
   - Go to [Supabase Dashboard](https://app.supabase.com)
   - Navigate to **Storage** (left sidebar)
   - Click **"New Bucket"** or **"Create Bucket"**
   - Configure:
     - **Name:** `message-attachments`
     - **Public:** Toggle to **OFF** (private bucket)
     - **File size limit:** 10 MB (optional)
   - Click **"Create Bucket"**

2. **Add Storage Policies**
   - Go to **Storage** > **Policies** tab for the `message-attachments` bucket
   - Click **"New Policy"**
   - You can use the SQL Editor to run: `db/CREATE_MESSAGE_ATTACHMENTS_STORAGE.sql`
   - OR create policies manually with these rules:

   **Policy 1: Upload Files**
   ```sql
   CREATE POLICY "Users can upload message attachments"
   ON storage.objects FOR INSERT
   TO authenticated
   WITH CHECK (
     bucket_id = 'message-attachments' AND
     auth.uid()::text = (storage.foldername(name))[1]
   );
   ```

   **Policy 2: View Files**
   ```sql
   CREATE POLICY "Users can view message attachments"
   ON storage.objects FOR SELECT
   TO authenticated
   USING (
     bucket_id = 'message-attachments' AND
     auth.uid()::text = (storage.foldername(name))[1]
   );
   ```

   **Policy 3: Delete Files**
   ```sql
   CREATE POLICY "Users can delete their message attachments"
   ON storage.objects FOR DELETE
   TO authenticated
   USING (
     bucket_id = 'message-attachments' AND
     auth.uid()::text = (storage.foldername(name))[1]
   );
   ```

3. **Test the Feature**
   - Refresh your application
   - Try uploading a file in the messages page
   - Should work now! ✅

### Method 2: Automated Setup (Advanced)

1. **Get your Supabase Service Role Key**
   - Go to Supabase Dashboard > Settings > API
   - Copy the `service_role` key (secret!)

2. **Add to .env.local**
   ```env
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

3. **Run the setup script**
   ```powershell
   node scripts/setup-message-attachments-bucket.js
   ```

4. **Run the SQL policies** (from output or use file)
   - Copy the SQL policies shown in the terminal
   - Paste into Supabase SQL Editor
   - Execute

## What's Already Done ✅

- [x] Database schema updated (messages table has file columns)
- [x] Frontend code ready (messages.js has file upload functionality)
- [ ] **Storage bucket created** ← This is what's missing!
- [ ] **Storage policies added** ← Also needed!

## Allowed File Types

- Images: JPEG, PNG, GIF, WebP
- Documents: PDF, DOC, DOCX, TXT
- Max size: 10 MB per file

## File Structure

Files are stored as:
```
message-attachments/
  {user_id}/
    {conversation_id}/
      {random_id}_{timestamp}.{extension}
```

## Troubleshooting

### Still getting "Bucket not found"?
- Make sure the bucket name is exactly `message-attachments` (lowercase, with hyphen)
- Verify in Supabase Dashboard > Storage that the bucket exists

### Files upload but can't be viewed?
- Check that storage policies are created (Method 1, Step 2)
- Run the verification query in `CREATE_MESSAGE_ATTACHMENTS_STORAGE.sql`

### "Permission denied" errors?
- Ensure policies are set to `TO authenticated` (not `TO public`)
- Check that users are logged in before uploading

## Next Steps After Setup

Once the bucket is created and policies are added:

1. Refresh your EaseRent application
2. Go to Messages page
3. Start a conversation
4. Click the attachment icon (📎)
5. Select a file to upload
6. Send the message

The file should upload successfully! 🎉

## Related Files

- `/db/ADD_FILE_ATTACHMENTS_TO_MESSAGES.sql` - Database schema
- `/db/CREATE_MESSAGE_ATTACHMENTS_STORAGE.sql` - Storage policies (NEW)
- `/scripts/setup-message-attachments-bucket.js` - Automated setup (NEW)
- `/pages/messages.js` - Frontend implementation
