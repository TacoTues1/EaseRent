-- ============================================
-- Add File Attachments to Messages
-- ============================================

-- Add file_url and file_name columns to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_type TEXT,
ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- Create storage bucket for message attachments if it doesn't exist
-- Note: This needs to be run in Supabase Dashboard -> Storage -> Create Bucket
-- Bucket name: message-attachments
-- Public: false (files are private)

-- Storage policies for message-attachments bucket
-- Note: These policies need to be added in Supabase Dashboard -> Storage -> Policies

-- Policy 1: Users can upload files to their own folder
-- CREATE POLICY "Users can upload message attachments"
-- ON storage.objects FOR INSERT
-- WITH CHECK (
--   bucket_id = 'message-attachments' AND
--   auth.uid()::text = (storage.foldername(name))[1]
-- );

-- Policy 2: Users can view files in conversations they're part of
-- CREATE POLICY "Users can view message attachments"
-- ON storage.objects FOR SELECT
-- USING (
--   bucket_id = 'message-attachments' AND
--   EXISTS (
--     SELECT 1 FROM messages m
--     WHERE m.file_url = storage.objects.name AND
--     (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
--   )
-- );

-- Policy 3: Users can delete their own uploaded files
-- CREATE POLICY "Users can delete their message attachments"
-- ON storage.objects FOR DELETE
-- USING (
--   bucket_id = 'message-attachments' AND
--   auth.uid()::text = (storage.foldername(name))[1]
-- );

COMMENT ON COLUMN messages.file_url IS 'URL to the uploaded file in Supabase Storage';
COMMENT ON COLUMN messages.file_name IS 'Original name of the uploaded file';
COMMENT ON COLUMN messages.file_type IS 'MIME type of the file (e.g., image/png, application/pdf)';
COMMENT ON COLUMN messages.file_size IS 'Size of the file in bytes';
