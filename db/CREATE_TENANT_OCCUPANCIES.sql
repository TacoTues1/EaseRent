-- ============================================
-- Tenant Occupancy Tracking System
-- ============================================
-- This tracks which tenant is currently occupying which property
-- Run this in Supabase SQL Editor

-- Create tenant_occupancies table
CREATE TABLE IF NOT EXISTS tenant_occupancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  landlord_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active', -- active / pending_end / ended
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- End request fields
  end_requested_at TIMESTAMPTZ,
  end_request_reason TEXT,
  end_request_status TEXT -- pending / approved / rejected
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_occupancies_tenant ON tenant_occupancies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_occupancies_landlord ON tenant_occupancies(landlord_id);
CREATE INDEX IF NOT EXISTS idx_occupancies_property ON tenant_occupancies(property_id);
CREATE INDEX IF NOT EXISTS idx_occupancies_active ON tenant_occupancies(status) WHERE status = 'active';

-- Enable RLS
ALTER TABLE tenant_occupancies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Tenants can view their own occupancies" ON tenant_occupancies;
DROP POLICY IF EXISTS "Tenants can update their own occupancies" ON tenant_occupancies;
DROP POLICY IF EXISTS "Landlords can manage occupancies for their properties" ON tenant_occupancies;
DROP POLICY IF EXISTS "Anyone can view active occupancies" ON tenant_occupancies;

-- Tenants can view their own occupancies
CREATE POLICY "Tenants can view their own occupancies" ON tenant_occupancies
  FOR SELECT
  USING (auth.uid() = tenant_id);

-- Tenants can update their own occupancies (for end requests)
CREATE POLICY "Tenants can update their own occupancies" ON tenant_occupancies
  FOR UPDATE
  USING (auth.uid() = tenant_id)
  WITH CHECK (auth.uid() = tenant_id);

-- Landlords can manage occupancies for their properties
CREATE POLICY "Landlords can manage occupancies for their properties" ON tenant_occupancies
  FOR ALL
  USING (auth.uid() = landlord_id)
  WITH CHECK (auth.uid() = landlord_id);

-- Grant permissions
GRANT ALL ON tenant_occupancies TO authenticated;

-- Comments
COMMENT ON TABLE tenant_occupancies IS 'Tracks which tenant is currently occupying which property';
COMMENT ON COLUMN tenant_occupancies.status IS 'active = currently living there, ended = moved out';
