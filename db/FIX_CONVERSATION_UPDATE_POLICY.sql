-- Fix the conversation update policy to allow soft deletes

-- Drop existing update policy
DROP POLICY IF EXISTS "Users can update their conversations" ON conversations;

-- Create a more permissive update policy
-- Allow users to update conversations they're part of
-- This is needed for soft delete (hiding conversations)
CREATE POLICY "Users can update their conversations" ON conversations
  FOR UPDATE
  USING (auth.uid() = landlord_id OR auth.uid() = tenant_id);
  -- Removed WITH CHECK clause - it was blocking the update

-- Alternative: If you want to keep WITH CHECK, make it match USING
-- CREATE POLICY "Users can update their conversations" ON conversations
--   FOR UPDATE
--   USING (auth.uid() = landlord_id OR auth.uid() = tenant_id)
--   WITH CHECK (auth.uid() = landlord_id OR auth.uid() = tenant_id);
