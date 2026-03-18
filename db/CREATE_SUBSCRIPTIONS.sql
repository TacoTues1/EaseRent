-- ============================================
-- Family Member Subscriptions System
-- ============================================
-- Tracks family member slot purchases PER TENANT (permanent).
-- The subscription stays with the tenant forever, even if their
-- occupancy/contract ends and they move to a new property.
--
-- Free plan: 1 family member slot included.
-- Additional slots: ₱50 each (up to max 4 total family members).
-- Run this in Supabase SQL Editor.

-- Create subscriptions table (linked to TENANT, not occupancy)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The tenant who owns this subscription (PERMANENT — never removed)
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Plan type: 'free' (1 slot), or 'paid' for purchased slots
  plan_type TEXT NOT NULL DEFAULT 'free', -- 'free' | 'paid'
  
  -- Total number of family member slots available (starts at 1 for free plan)
  total_slots INT NOT NULL DEFAULT 1,
  
  -- Number of extra paid slots purchased (each costs ₱50)
  paid_slots INT NOT NULL DEFAULT 0,
  
  -- Current status — always 'active', never expires or gets cancelled
  status TEXT NOT NULL DEFAULT 'active', -- 'active'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Subscription payment history (tracks each ₱50 slot purchase)
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link back to the subscription
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE NOT NULL,
  
  -- The tenant who paid
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Optional: which occupancy they were in when they purchased (for audit only)
  occupancy_id UUID REFERENCES tenant_occupancies(id) ON DELETE SET NULL,
  
  -- Payment details
  amount NUMERIC(12,2) NOT NULL DEFAULT 50.00,
  currency TEXT DEFAULT 'PHP',
  
  -- How they paid
  payment_method TEXT, -- 'paymongo', 'gcash', 'maya', 'cash', etc.
  payment_reference TEXT, -- PayMongo checkout session ID, reference number, etc.
  
  -- Payment status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
  
  -- Timestamps
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sub_payments_subscription ON subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_tenant ON subscription_payments(tenant_id);

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscriptions
DROP POLICY IF EXISTS "Tenants can view their own subscriptions" ON subscriptions;
CREATE POLICY "Tenants can view their own subscriptions" ON subscriptions
  FOR SELECT
  USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "Tenants can update their own subscriptions" ON subscriptions;
CREATE POLICY "Tenants can update their own subscriptions" ON subscriptions
  FOR UPDATE
  USING (auth.uid() = tenant_id)
  WITH CHECK (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "Landlords can view tenant subscriptions" ON subscriptions;
CREATE POLICY "Landlords can view tenant subscriptions" ON subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenant_occupancies
      WHERE tenant_occupancies.tenant_id = subscriptions.tenant_id
      AND tenant_occupancies.landlord_id = auth.uid()
      AND tenant_occupancies.status IN ('active', 'pending_end')
    )
  );

-- RLS Policies for subscription_payments
DROP POLICY IF EXISTS "Tenants can view their own subscription payments" ON subscription_payments;
CREATE POLICY "Tenants can view their own subscription payments" ON subscription_payments
  FOR SELECT
  USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "Landlords can view subscription payments" ON subscription_payments;
CREATE POLICY "Landlords can view subscription payments" ON subscription_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenant_occupancies
      WHERE tenant_occupancies.tenant_id = subscription_payments.tenant_id
      AND tenant_occupancies.landlord_id = auth.uid()
      AND tenant_occupancies.status IN ('active', 'pending_end')
    )
  );

-- Grant permissions
GRANT ALL ON subscriptions TO authenticated;
GRANT ALL ON subscription_payments TO authenticated;

-- Unique constraint: one subscription per tenant (permanent, never duplicated)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tenant_subscription 
  ON subscriptions(tenant_id);

-- Auto-update updated_at on subscriptions
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_subscription_updated_at ON subscriptions;
CREATE TRIGGER tr_subscription_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_updated_at();

-- Comments
COMMENT ON TABLE subscriptions IS 'Permanent per-tenant subscription for family member slots. Free plan = 1 slot; additional slots = ₱50 each. Never expires — follows the tenant across properties.';
COMMENT ON TABLE subscription_payments IS 'Payment history for purchased family member slots (₱50 per slot).';
COMMENT ON COLUMN subscriptions.total_slots IS 'Total family member slots = 1 (free) + paid_slots';
COMMENT ON COLUMN subscriptions.paid_slots IS 'Number of additional slots purchased at ₱50 each';
COMMENT ON COLUMN subscriptions.status IS 'Always active — subscriptions are permanent and never expire';
