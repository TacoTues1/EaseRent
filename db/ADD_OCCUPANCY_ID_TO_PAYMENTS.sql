-- ============================================
-- Link Payments to Specific Occupancy
-- ============================================
-- This ensures payment history is tied to a specific tenancy period,
-- so when a tenant is re-assigned, their old payments don't show up.

-- Add occupancy_id to payment_requests
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS occupancy_id UUID REFERENCES tenant_occupancies(id) ON DELETE CASCADE;

-- Add occupancy_id to tenant_balances (if it exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tenant_balances') THEN
    ALTER TABLE tenant_balances ADD COLUMN IF NOT EXISTS occupancy_id UUID REFERENCES tenant_occupancies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_requests_occupancy ON payment_requests(occupancy_id);

-- Update existing payment_requests to link to current active occupancy (optional - run if needed)
-- UPDATE payment_requests pr
-- SET occupancy_id = (
--   SELECT o.id FROM tenant_occupancies o
--   WHERE o.tenant_id = pr.tenant
--   AND o.property_id = pr.property_id
--   AND o.status = 'active'
--   LIMIT 1
-- )
-- WHERE pr.occupancy_id IS NULL;

COMMENT ON COLUMN payment_requests.occupancy_id IS 'Links payment to specific occupancy period. Used to reset payment history when tenant is re-assigned.';
