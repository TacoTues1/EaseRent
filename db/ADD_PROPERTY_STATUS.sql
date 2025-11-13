-- Add status column to properties table
-- This replaces the boolean 'available' field with a status field that can be:
-- 'available', 'occupied', or 'not available'

-- Step 1: Add the new status column
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';

-- Step 2: Migrate existing data from 'available' column to 'status'
UPDATE properties 
SET status = CASE 
  WHEN available = true THEN 'available'
  ELSE 'not available'
END
WHERE status = 'available'; -- Only update rows that haven't been set yet

-- Step 3: Add constraint to ensure only valid values
ALTER TABLE properties
ADD CONSTRAINT valid_property_status 
CHECK (status IN ('available', 'occupied', 'not available'));

-- Note: You can optionally drop the old 'available' column after confirming everything works:
-- ALTER TABLE properties DROP COLUMN available;
