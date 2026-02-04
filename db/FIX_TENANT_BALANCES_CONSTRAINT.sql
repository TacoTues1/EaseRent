-- FIX: Add unique constraint on tenant_id + occupancy_id for proper upsert
-- This allows the credit balance to be tracked per occupancy

-- First, drop any existing unique constraint on tenant_id only
ALTER TABLE tenant_balances DROP CONSTRAINT IF EXISTS tenant_balances_tenant_id_key;

-- Add new composite unique constraint
ALTER TABLE tenant_balances 
ADD CONSTRAINT tenant_balances_tenant_occupancy_unique 
UNIQUE (tenant_id, occupancy_id);

-- If needed, create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tenant_balances_tenant_occupancy 
ON tenant_balances(tenant_id, occupancy_id);
