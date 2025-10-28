-- Fix: Allow public/anonymous users to view properties
-- This is needed for the homepage to show featured properties

-- First, check current policies
SELECT * FROM pg_policies WHERE tablename = 'properties' AND cmd = 'SELECT';

-- Drop the restrictive policy that blocks anonymous users
DROP POLICY IF EXISTS "Anyone can view available properties" ON properties;
DROP POLICY IF EXISTS "Landlords can view own properties" ON properties;

-- Create new policy that allows everyone (including anonymous) to view properties
CREATE POLICY "Public can view all properties"
ON properties FOR SELECT
TO public
USING (true);

-- Alternative: If you want to only show available properties to public
-- CREATE POLICY "Public can view available properties"
-- ON properties FOR SELECT
-- TO public
-- USING (available = true);

-- Verify the policy was created
SELECT * FROM pg_policies WHERE tablename = 'properties' AND cmd = 'SELECT';
