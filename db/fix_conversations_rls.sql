-- Fix conversations RLS policy to allow landlords to create conversations too

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Tenants can create conversations" ON conversations;

-- Create new policy that allows both landlords and tenants to create conversations
CREATE POLICY "Users can create conversations" ON conversations
  FOR INSERT
  WITH CHECK (
    auth.uid() = landlord_id OR auth.uid() = tenant_id
  );
