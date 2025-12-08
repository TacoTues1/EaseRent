-- Add amenities column to properties table
-- This stores an array of amenities/features for each property

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS amenities text[] DEFAULT '{}';

COMMENT ON COLUMN properties.amenities IS 'Array of amenities/features offered by the property (Kitchen, Wifi, Pool, etc.)';

-- Example amenities that can be added:
-- Kitchen, Wifi, Pool, TV, Elevator, Air conditioning, Heating
-- Washing machine, Dryer, Parking, Gym, Security, Balcony
-- Garden, Pet friendly, Furnished, Carbon monoxide alarm
-- Smoke alarm, Fire extinguisher, First aid kit
