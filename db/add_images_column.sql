-- Add images column to properties table
-- Run this in Supabase SQL Editor

ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS images text[];

-- Add comment to explain the column
COMMENT ON COLUMN properties.images IS 'Array of image URLs for the property';

-- Optional: Update existing properties with empty array
UPDATE properties 
SET images = '{}' 
WHERE images IS NULL;
