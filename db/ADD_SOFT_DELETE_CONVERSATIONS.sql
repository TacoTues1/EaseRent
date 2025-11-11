-- Add soft delete columns to conversations table

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS hidden_by_landlord BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by_tenant BOOLEAN DEFAULT false;

-- Create index for better performance when filtering hidden conversations
CREATE INDEX IF NOT EXISTS idx_conversations_hidden_landlord ON conversations(landlord_id, hidden_by_landlord);
CREATE INDEX IF NOT EXISTS idx_conversations_hidden_tenant ON conversations(tenant_id, hidden_by_tenant);

COMMENT ON COLUMN conversations.hidden_by_landlord IS 'Soft delete: true if landlord deleted this conversation from their view';
COMMENT ON COLUMN conversations.hidden_by_tenant IS 'Soft delete: true if tenant deleted this conversation from their view';
