-- ============================================
-- Fix Messaging System - Run This Complete Script
-- ============================================

-- Step 1: Add soft delete columns to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS hidden_by_landlord BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by_tenant BOOLEAN DEFAULT false;

-- Step 2: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_conversations_hidden_landlord ON conversations(landlord_id, hidden_by_landlord);
CREATE INDEX IF NOT EXISTS idx_conversations_hidden_tenant ON conversations(tenant_id, hidden_by_tenant);

-- Step 3: Fix conversation policies to allow both landlords and tenants to create conversations
DROP POLICY IF EXISTS "Tenants can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;

-- Allow both landlords and tenants to create conversations
CREATE POLICY "Users can create conversations" ON conversations
  FOR INSERT
  WITH CHECK (auth.uid() = landlord_id OR auth.uid() = tenant_id);

-- Step 4: Allow users to update their conversations (for soft delete)
DROP POLICY IF EXISTS "Users can update their conversations" ON conversations;

CREATE POLICY "Users can update their conversations" ON conversations
  FOR UPDATE
  USING (auth.uid() = landlord_id OR auth.uid() = tenant_id)
  WITH CHECK (auth.uid() = landlord_id OR auth.uid() = tenant_id);

-- Step 5: Remove unique constraint on property_id to allow multiple conversations without properties
-- First, check if the constraint exists and drop it
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'conversations_property_id_landlord_id_tenant_id_key'
    ) THEN
        ALTER TABLE conversations DROP CONSTRAINT conversations_property_id_landlord_id_tenant_id_key;
    END IF;
END $$;

-- Add a new unique constraint that allows NULL property_id
-- This ensures each pair of users can only have one conversation per property
-- But allows multiple conversations without properties
CREATE UNIQUE INDEX IF NOT EXISTS conversations_users_property_unique 
ON conversations (landlord_id, tenant_id, property_id) 
WHERE property_id IS NOT NULL;

-- Add comments
COMMENT ON COLUMN conversations.hidden_by_landlord IS 'Soft delete: true if landlord deleted this conversation from their view';
COMMENT ON COLUMN conversations.hidden_by_tenant IS 'Soft delete: true if tenant deleted this conversation from their view';

-- Done! Your messaging system should now work properly.
