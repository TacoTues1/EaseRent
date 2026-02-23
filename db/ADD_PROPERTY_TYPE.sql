-- Add property_type, bed_type, and max_occupancy columns to properties table

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS property_type text DEFAULT 'House Apartment';

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS bed_type text DEFAULT 'Single Bed';

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS max_occupancy int DEFAULT 1;

COMMENT ON COLUMN public.properties.property_type IS 'Type of rental: House Apartment, Studio Type, Solo Room, Boarding House';
COMMENT ON COLUMN public.properties.bed_type IS 'Bed type: Single Bed, Double Bed, Triple Bed';
COMMENT ON COLUMN public.properties.max_occupancy IS 'Maximum number of people allowed in one room';
