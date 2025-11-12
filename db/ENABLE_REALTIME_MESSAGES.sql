-- Enable real-time for messages table
-- Run this in Supabase SQL Editor to fix real-time messaging

-- Enable real-time replication for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Verify it's enabled (optional - just to check)
-- SELECT schemaname, tablename 
-- FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime';
