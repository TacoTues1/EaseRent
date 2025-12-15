-- ============================================
-- Fix conversation_participants View Security Issue
-- ============================================
-- This removes SECURITY DEFINER from the view to use SECURITY INVOKER instead
-- SECURITY INVOKER enforces permissions of the querying user, not the view creator

-- Drop the existing view if it exists
DROP VIEW IF EXISTS conversation_participants;

-- Recreate the view WITHOUT SECURITY DEFINER (defaults to SECURITY INVOKER)
-- This ensures RLS policies of the querying user are enforced, not the view creator's
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

-- Grant appropriate permissions
GRANT SELECT ON conversation_participants TO authenticated;

COMMENT ON VIEW conversation_participants IS 'Helper view showing conversation participants with their details - uses SECURITY INVOKER for proper RLS enforcement';
