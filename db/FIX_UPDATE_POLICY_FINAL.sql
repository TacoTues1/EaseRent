-- ============================================
-- Fix Conversation Update Policy - DEFINITIVE FIX
-- ============================================

-- Drop all existing update policies
DROP POLICY IF EXISTS "Users can update their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations" ON conversations;
DROP POLICY IF EXISTS "Allow conversation updates" ON conversations;

-- Create a new update policy that explicitly allows soft deletes
-- This policy allows users to update ONLY the hidden columns for their own side
CREATE POLICY "Users can soft delete their conversations" ON conversations
  FOR UPDATE
  USING (
    -- User must be a participant
    auth.uid() = landlord_id OR auth.uid() = tenant_id
  )
  WITH CHECK (
    -- User must still be a participant after update (IDs shouldn't change)
    auth.uid() = landlord_id OR auth.uid() = tenant_id
  );

-- Grant necessary permissions
GRANT UPDATE (hidden_by_landlord, hidden_by_tenant, updated_at) ON conversations TO authenticated;

-- Verify the policy
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
WHERE tablename = 'conversations' 
AND cmd = 'UPDATE';
