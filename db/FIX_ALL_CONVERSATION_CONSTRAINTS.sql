-- ============================================
-- Fix All Conversation Constraints - COMPLETE FIX
-- ============================================

-- Step 1: Drop ALL existing unique constraints on conversations
DO $$ 
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find and drop all unique constraints on conversations table
    FOR constraint_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'conversations'::regclass 
        AND contype = 'u'  -- 'u' means unique constraint
    LOOP
        EXECUTE 'ALTER TABLE conversations DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
    END LOOP;
END $$;

-- Step 2: Drop all unique indexes on conversations
DROP INDEX IF EXISTS conversations_users_unique;
DROP INDEX IF EXISTS conversations_users_property_unique;
DROP INDEX IF EXISTS conversations_property_id_landlord_id_tenant_id_key;

-- Step 3: Create a NEW constraint that allows multiple conversations between same users
-- This constraint only applies when property_id is NOT NULL
-- Allows unlimited conversations when property_id IS NULL (direct messaging)
CREATE UNIQUE INDEX conversations_users_property_unique 
ON conversations (landlord_id, tenant_id, property_id) 
WHERE property_id IS NOT NULL;

-- Step 4: Add soft delete columns if they don't exist
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS hidden_by_landlord BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by_tenant BOOLEAN DEFAULT false;

-- Step 5: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_conversations_hidden_landlord ON conversations(landlord_id, hidden_by_landlord);
CREATE INDEX IF NOT EXISTS idx_conversations_hidden_tenant ON conversations(tenant_id, hidden_by_tenant);

-- Step 6: Fix conversation policies
DROP POLICY IF EXISTS "Tenants can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;

CREATE POLICY "Users can create conversations" ON conversations
  FOR INSERT
  WITH CHECK (auth.uid() = landlord_id OR auth.uid() = tenant_id);

DROP POLICY IF EXISTS "Users can update their conversations" ON conversations;

CREATE POLICY "Users can update their conversations" ON conversations
  FOR UPDATE
  USING (auth.uid() = landlord_id OR auth.uid() = tenant_id)
  WITH CHECK (auth.uid() = landlord_id OR auth.uid() = tenant_id);

-- Step 7: Add comments
COMMENT ON COLUMN conversations.hidden_by_landlord IS 'Soft delete: true if landlord deleted this conversation from their view';
COMMENT ON COLUMN conversations.hidden_by_tenant IS 'Soft delete: true if tenant deleted this conversation from their view';

-- Verify the changes
SELECT 
    'Unique Constraints:' as info,
    conname as constraint_name
FROM pg_constraint 
WHERE conrelid = 'conversations'::regclass 
AND contype = 'u'
UNION ALL
SELECT 
    'Unique Indexes:' as info,
    indexname as index_name
FROM pg_indexes 
WHERE tablename = 'conversations' 
AND indexdef LIKE '%UNIQUE%';

-- Done! Try creating a conversation now.
