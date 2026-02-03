-- ============================================
-- Security Deposit & Contract Management System
-- ============================================
-- This adds security deposit tracking, contract dates, and renewal system
-- Run this in Supabase SQL Editor

-- Add new columns to tenant_occupancies
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS contract_end_date DATE;
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS security_deposit DECIMAL(10,2) DEFAULT 0;
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS security_deposit_used DECIMAL(10,2) DEFAULT 0;
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS renewal_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS renewal_requested_at TIMESTAMPTZ;
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS renewal_status TEXT; -- pending / approved / rejected
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS contract_url TEXT; -- URL to the uploaded contract PDF
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS wifi_due_day INTEGER; -- Day of month for wifi bill due date
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS late_payment_fee DECIMAL(10,2) DEFAULT 0; -- Late payment fee amount in pesos

-- Add maintenance_cost column to maintenance_requests
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS maintenance_cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS cost_deducted_from_deposit BOOLEAN DEFAULT FALSE;

-- Create storage bucket for contracts if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('contracts', 'contracts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to contracts bucket
DROP POLICY IF EXISTS "Landlords can upload contracts" ON storage.objects;
CREATE POLICY "Landlords can upload contracts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contracts');

-- Allow anyone to read contracts (for tenants to view)
DROP POLICY IF EXISTS "Anyone can view contracts" ON storage.objects;
CREATE POLICY "Anyone can view contracts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contracts');

-- Create a view for security deposit tracking
DROP VIEW IF EXISTS security_deposit_summary;
CREATE VIEW security_deposit_summary AS
SELECT 
  o.id as occupancy_id,
  o.tenant_id,
  o.landlord_id,
  o.property_id,
  o.security_deposit,
  o.security_deposit_used,
  (o.security_deposit - o.security_deposit_used) as security_deposit_remaining,
  o.contract_end_date,
  o.start_date,
  o.contract_url,
  CASE 
    WHEN o.contract_end_date IS NOT NULL 
    THEN (o.contract_end_date - CURRENT_DATE)
    ELSE NULL 
  END as days_until_contract_end
FROM tenant_occupancies o
WHERE o.status = 'active';

-- Grant permissions on the view
GRANT SELECT ON security_deposit_summary TO authenticated;

-- Comments
COMMENT ON COLUMN tenant_occupancies.contract_end_date IS 'The end date of the rental contract';
COMMENT ON COLUMN tenant_occupancies.security_deposit IS 'Security deposit amount (usually equal to one month rent)';
COMMENT ON COLUMN tenant_occupancies.security_deposit_used IS 'Amount deducted from security deposit for maintenance etc.';
COMMENT ON COLUMN tenant_occupancies.renewal_requested IS 'Whether tenant has requested contract renewal';
COMMENT ON COLUMN tenant_occupancies.contract_url IS 'URL to the uploaded contract PDF file';
COMMENT ON COLUMN maintenance_requests.maintenance_cost IS 'Cost of the maintenance work (deducted from security deposit)';
