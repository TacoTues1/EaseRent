-- Add DELETE policies for conversations and messages
-- Allow users to delete conversations and messages they are part of

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can delete their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete their messages" ON messages;

-- Allow users to delete conversations they are part of
CREATE POLICY "Users can delete their conversations" ON conversations
  FOR DELETE
  USING (auth.uid() = landlord_id OR auth.uid() = tenant_id);

-- Allow users to delete messages they sent or received
CREATE POLICY "Users can delete their messages" ON messages
  FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
