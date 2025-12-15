-- Remove the unused 'state' column from the properties table
-- The 'street' column is the correct one to use
-- Run this in Supabase SQL Editor

ALTER TABLE properties DROP COLUMN IF EXISTS state;
