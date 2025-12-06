-- ============================================
-- Fix Unique Constraint on Tenant Occupancies
-- ============================================
-- The constraint "unique_active_property_occupancy" is blocking
-- the approval of end requests

-- Check current constraints
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(c.oid) as definition
FROM pg_constraint c
WHERE conrelid = 'tenant_occupancies'::regclass;

-- Drop the problematic unique constraint
ALTER TABLE tenant_occupancies 
  DROP CONSTRAINT IF EXISTS unique_active_property_occupancy;

-- Create a better constraint that only applies to active occupancies
-- This allows ended/pending_end occupancies without conflict
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_property_occupancy
ON tenant_occupancies (property_id)
WHERE status = 'active';

-- Verify the fix
SELECT * FROM tenant_occupancies ORDER BY created_at DESC LIMIT 10;
