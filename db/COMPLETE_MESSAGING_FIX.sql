-- ============================================
-- COMPLETE MESSAGING FIX - RUN THIS ENTIRE SCRIPT
-- This includes ALL fixes in one place
-- ============================================

-- STEP 1: Add the soft delete columns first
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS hidden_by_landlord BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by_tenant BOOLEAN DEFAULT false;

-- STEP 2: Drop all unique constraints that might be blocking conversation creation
DO $$ 
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'conversations'::regclass 
        AND contype = 'u'
    LOOP
        EXECUTE 'ALTER TABLE conversations DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
    END LOOP;
END $$;

-- STEP 3: Drop all unique indexes
DROP INDEX IF EXISTS conversations_users_unique;
DROP INDEX IF EXISTS conversations_users_property_unique;
DROP INDEX IF EXISTS conversations_property_id_landlord_id_tenant_id_key;

-- STEP 4: Create new constraint that allows NULL property_id
CREATE UNIQUE INDEX IF NOT EXISTS conversations_users_property_unique 
ON conversations (landlord_id, tenant_id, property_id) 
WHERE property_id IS NOT NULL;

-- STEP 5: Create performance indexes
CREATE INDEX IF NOT EXISTS idx_conversations_hidden_landlord ON conversations(landlord_id, hidden_by_landlord);
CREATE INDEX IF NOT EXISTS idx_conversations_hidden_tenant ON conversations(tenant_id, hidden_by_tenant);

-- STEP 6: Fix all policies

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Tenants can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations" ON conversations;
DROP POLICY IF EXISTS "Allow conversation updates" ON conversations;
DROP POLICY IF EXISTS "Users can soft delete their conversations" ON conversations;

-- SELECT policy (view conversations)
CREATE POLICY "Users can view their conversations" ON conversations
  FOR SELECT
  USING (auth.uid() = landlord_id OR auth.uid() = tenant_id);

-- INSERT policy (create conversations)
CREATE POLICY "Users can create conversations" ON conversations
  FOR INSERT
  WITH CHECK (auth.uid() = landlord_id OR auth.uid() = tenant_id);

-- UPDATE policy (soft delete/hide conversations)
CREATE POLICY "Users can update their conversations" ON conversations
  FOR UPDATE
  USING (auth.uid() = landlord_id OR auth.uid() = tenant_id)
  WITH CHECK (auth.uid() = landlord_id OR auth.uid() = tenant_id);

-- STEP 7: Grant permissions
GRANT ALL ON conversations TO authenticated;

-- STEP 8: Add comments
COMMENT ON COLUMN conversations.hidden_by_landlord IS 'Soft delete: true if landlord deleted this conversation from their view';
COMMENT ON COLUMN conversations.hidden_by_tenant IS 'Soft delete: true if tenant deleted this conversation from their view';

-- STEP 9: Verify setup
SELECT 'Setup complete! Testing policies...' as status;

-- Show all policies
SELECT 
    policyname,
    cmd as command,
    CASE 
        WHEN qual IS NOT NULL THEN 'Has USING clause'
        ELSE 'No USING clause'
    END as using_check,
    CASE 
        WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
        ELSE 'No WITH CHECK clause'
    END as with_check_status
FROM pg_policies 
WHERE tablename = 'conversations'
ORDER BY cmd, policyname;
