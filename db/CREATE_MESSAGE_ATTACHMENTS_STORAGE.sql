-- ============================================
-- Create Storage Policies for Message Attachments
-- ============================================
-- 
-- IMPORTANT: Before running this SQL, create the bucket first:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New Bucket"
-- 3. Name: message-attachments
-- 4. Public: OFF (private)
-- 5. Click "Create Bucket"
--
-- Then run this SQL in the SQL Editor
-- ============================================

-- Policy 1: Users can upload files to their own folder
CREATE POLICY "Users can upload message attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy 2: Users can view files they uploaded (in their own folder)
CREATE POLICY "Users can view message attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy 3: Users can delete their own uploaded files
CREATE POLICY "Users can delete their message attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'message-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'objects' 
  AND policyname LIKE '%message attachments%'
ORDER BY policyname;
