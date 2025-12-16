-- Replace full_name with separate name columns in profiles table
-- Run this in the Supabase SQL editor

-- Add first_name column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text;

-- Add middle_name column (can be null or 'N/A')
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS middle_name text;

-- Add last_name column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;

-- Migrate existing full_name data to new columns before dropping
UPDATE profiles 
SET 
  first_name = split_part(full_name, ' ', 1),
  last_name = CASE 
    WHEN array_length(string_to_array(full_name, ' '), 1) > 1 
    THEN split_part(full_name, ' ', array_length(string_to_array(full_name, ' '), 1))
    ELSE NULL 
  END,
  middle_name = 'N/A'
WHERE full_name IS NOT NULL AND first_name IS NULL;

-- Drop the view that depends on full_name
DROP VIEW IF EXISTS conversation_participants;

-- Drop the old full_name column
ALTER TABLE profiles DROP COLUMN IF EXISTS full_name;

-- Recreate the conversation_participants view using new name columns
CREATE OR REPLACE VIEW conversation_participants AS
SELECT 
  c.id as conversation_id,
  c.property_id,
  c.created_at,
  c.updated_at,
  c.landlord_id as user1_id,
  c.tenant_id as user2_id,
  CONCAT(p1.first_name, ' ', p1.last_name) as user1_name,
  p1.role as user1_role,
  CONCAT(p2.first_name, ' ', p2.last_name) as user2_name,
  p2.role as user2_role,
  prop.title as property_title,
  prop.address as property_address
FROM conversations c
LEFT JOIN profiles p1 ON c.landlord_id = p1.id
LEFT JOIN profiles p2 ON c.tenant_id = p2.id
LEFT JOIN properties prop ON c.property_id = prop.id;

-- Grant appropriate permissions
GRANT SELECT ON conversation_participants TO authenticated;
