-- ============================================
-- Add Soft Delete to Conversations
-- ============================================

-- Add hidden_by columns to track who has hidden/deleted the conversation
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS hidden_by_landlord BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by_tenant BOOLEAN DEFAULT false;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_conversations_hidden_landlord ON conversations(landlord_id, hidden_by_landlord);
CREATE INDEX IF NOT EXISTS idx_conversations_hidden_tenant ON conversations(tenant_id, hidden_by_tenant);

-- Update RLS policies to exclude hidden conversations
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;

CREATE POLICY "Users can view their conversations" ON conversations
  FOR SELECT
  USING (
    (auth.uid() = landlord_id AND hidden_by_landlord = false) OR 
    (auth.uid() = tenant_id AND hidden_by_tenant = false)
  );

-- Add policy for updating hidden status
DROP POLICY IF EXISTS "Users can hide their conversations" ON conversations;

CREATE POLICY "Users can hide their conversations" ON conversations
  FOR UPDATE
  USING (auth.uid() = landlord_id OR auth.uid() = tenant_id)
  WITH CHECK (
    (auth.uid() = landlord_id) OR 
    (auth.uid() = tenant_id)
  );

COMMENT ON COLUMN conversations.hidden_by_landlord IS 'Soft delete: conversation hidden from landlord view';
COMMENT ON COLUMN conversations.hidden_by_tenant IS 'Soft delete: conversation hidden from tenant view';
