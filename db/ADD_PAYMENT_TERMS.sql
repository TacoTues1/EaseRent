-- Add payment terms columns to properties table
-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS has_security_deposit BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS security_deposit_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_advance BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS advance_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_contract_months INT,
ADD COLUMN IF NOT EXISTS water_due_day INT,
ADD COLUMN IF NOT EXISTS electricity_due_day INT,
ADD COLUMN IF NOT EXISTS wifi_due_day INT;
