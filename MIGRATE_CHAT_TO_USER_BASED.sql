-- ============================================
-- Migrate Chat System to User-to-User Based
-- Remove property_id requirement, add search capabilities
-- ============================================

-- Step 1: Make property_id nullable in conversations table
ALTER TABLE conversations 
  ALTER COLUMN property_id DROP NOT NULL;

-- Step 2: Drop the unique constraint that includes property_id
ALTER TABLE conversations 
  DROP CONSTRAINT IF EXISTS conversations_property_id_landlord_id_tenant_id_key;

-- Step 3: Add new unique constraint for user-to-user conversations
-- This ensures only one conversation between any two users
ALTER TABLE conversations 
  ADD CONSTRAINT conversations_users_unique 
  UNIQUE (landlord_id, tenant_id);

-- Step 4: Update RLS policies to remove property requirement
DROP POLICY IF EXISTS "Tenants can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;

-- Allow any authenticated user to create conversations
CREATE POLICY "Users can create conversations" ON conversations
  FOR INSERT
  WITH CHECK (
    auth.uid() = landlord_id OR auth.uid() = tenant_id
  );

-- Step 5: Add indexes for user search
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON profiles(full_name);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Step 6: Create a view for easier conversation queries with both participants
CREATE OR REPLACE VIEW conversation_participants AS
SELECT 
  c.id as conversation_id,
  c.property_id,
  c.created_at,
  c.updated_at,
  c.landlord_id as user1_id,
  c.tenant_id as user2_id,
  p1.full_name as user1_name,
  p1.role as user1_role,
  p2.full_name as user2_name,
  p2.role as user2_role,
  prop.title as property_title,
  prop.address as property_address
FROM conversations c
LEFT JOIN profiles p1 ON c.landlord_id = p1.id
LEFT JOIN profiles p2 ON c.tenant_id = p2.id
LEFT JOIN properties prop ON c.property_id = prop.id;

-- Grant access to the view
GRANT SELECT ON conversation_participants TO authenticated;

COMMENT ON TABLE conversations IS 'Stores direct conversations between users. property_id is now optional for legacy support.';
COMMENT ON VIEW conversation_participants IS 'Helper view showing conversation participants with their details';
