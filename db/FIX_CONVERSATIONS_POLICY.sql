-- Fix conversations policies to allow both landlords and tenants to create conversations

DROP POLICY IF EXISTS "Tenants can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;

-- Allow both landlords and tenants to create conversations
CREATE POLICY "Users can create conversations" ON conversations
  FOR INSERT
  WITH CHECK (auth.uid() = landlord_id OR auth.uid() = tenant_id);

-- Also allow users to update conversations (for soft delete)
DROP POLICY IF EXISTS "Users can update their conversations" ON conversations;

CREATE POLICY "Users can update their conversations" ON conversations
  FOR UPDATE
  USING (auth.uid() = landlord_id OR auth.uid() = tenant_id)
  WITH CHECK (auth.uid() = landlord_id OR auth.uid() = tenant_id);
