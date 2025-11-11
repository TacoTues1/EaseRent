-- ============================================
-- Fix for Schedule Page Update
-- Run this ONLY if you already ran the old UPDATE_BOOKINGS_SYSTEM.sql
-- ============================================

-- Make property_id nullable (if it wasn't already)
ALTER TABLE available_time_slots 
ALTER COLUMN property_id DROP NOT NULL;

-- Update any existing time slots to have null property_id
-- This converts them to general availability
UPDATE available_time_slots 
SET property_id = NULL 
WHERE property_id IS NOT NULL;

-- Add helpful comments
COMMENT ON TABLE available_time_slots IS 'Stores available time slots set by landlords for property viewings. property_id can be null for general availability.';
COMMENT ON COLUMN available_time_slots.property_id IS 'Optional: Specific property. NULL means landlord is generally available for any property viewing';

-- Verify the change
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'available_time_slots' 
  AND column_name = 'property_id';

-- This should show: is_nullable = 'YES'
