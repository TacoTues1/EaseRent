-- Add repairman_name column to maintenance_requests table
-- Run this SQL in your Supabase SQL Editor

ALTER TABLE maintenance_requests 
ADD COLUMN IF NOT EXISTS repairman_name TEXT;

-- Optional: Add an index if you plan to search by repairman name
-- CREATE INDEX IF NOT EXISTS idx_maintenance_requests_repairman_name 
-- ON maintenance_requests(repairman_name);

COMMENT ON COLUMN maintenance_requests.repairman_name IS 'Name of the assigned repairman for the maintenance request';
