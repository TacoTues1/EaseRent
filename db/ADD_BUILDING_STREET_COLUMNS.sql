-- Add building_no, street, location_link, owner_phone, and owner_email columns to properties table
-- Run this in Supabase SQL Editor

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS building_no TEXT,
ADD COLUMN IF NOT EXISTS street TEXT,
ADD COLUMN IF NOT EXISTS location_link TEXT,
ADD COLUMN IF NOT EXISTS owner_phone TEXT,
ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- Update existing properties to move address data if needed
-- (Optional: You can manually reorganize existing data later)

COMMENT ON COLUMN properties.building_no IS 'Building number or unit (optional) - e.g., "Bldg 5, Unit 203"';
COMMENT ON COLUMN properties.street IS 'Street number and street name - e.g., "123 Main Street"';
COMMENT ON COLUMN properties.address IS 'Barangay or district name - e.g., "Barangay San Roque"';
COMMENT ON COLUMN properties.location_link IS 'Google Maps location link (preferred) - helps tenants find the property easily';
COMMENT ON COLUMN properties.owner_phone IS 'Owner contact phone number - e.g., "+63 912 345 6789"';
COMMENT ON COLUMN properties.owner_email IS 'Owner contact email address';
