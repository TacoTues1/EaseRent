-- Add terms_conditions column to properties table
-- Run this in Supabase SQL Editor

ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS terms_conditions TEXT;

-- Add a comment to describe the column
COMMENT ON COLUMN properties.terms_conditions IS 'Custom terms and conditions set by the landlord for this property';
