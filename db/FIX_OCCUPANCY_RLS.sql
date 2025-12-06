-- ============================================
-- Fix Tenant Occupancies RLS Policies
-- ============================================
-- Run this to allow landlords to approve/reject end requests

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Tenants can view their own occupancies" ON tenant_occupancies;
DROP POLICY IF EXISTS "Tenants can update their own occupancies" ON tenant_occupancies;
DROP POLICY IF EXISTS "Landlords can manage occupancies for their properties" ON tenant_occupancies;
DROP POLICY IF EXISTS "Landlords can view occupancies" ON tenant_occupancies;
DROP POLICY IF EXISTS "Landlords can insert occupancies" ON tenant_occupancies;
DROP POLICY IF EXISTS "Landlords can update occupancies" ON tenant_occupancies;
DROP POLICY IF EXISTS "Landlords can delete occupancies" ON tenant_occupancies;

-- Tenants can view their own occupancies
CREATE POLICY "Tenants can view their own occupancies" ON tenant_occupancies
  FOR SELECT
  USING (auth.uid() = tenant_id);

-- Tenants can request to end (update their own)
CREATE POLICY "Tenants can request end" ON tenant_occupancies
  FOR UPDATE
  USING (auth.uid() = tenant_id);

-- Landlords can view their occupancies
CREATE POLICY "Landlords can view occupancies" ON tenant_occupancies
  FOR SELECT
  USING (auth.uid() = landlord_id);

-- Landlords can insert occupancies
CREATE POLICY "Landlords can insert occupancies" ON tenant_occupancies
  FOR INSERT
  WITH CHECK (auth.uid() = landlord_id);

-- Landlords can update (approve/reject end requests, end occupancy)
CREATE POLICY "Landlords can update occupancies" ON tenant_occupancies
  FOR UPDATE
  USING (auth.uid() = landlord_id);

-- Landlords can delete occupancies
CREATE POLICY "Landlords can delete occupancies" ON tenant_occupancies
  FOR DELETE
  USING (auth.uid() = landlord_id);

-- Verify policies
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'tenant_occupancies'
ORDER BY policyname;
