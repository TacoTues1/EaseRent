-- Create payment_requests table for landlord to send bills to tenants

CREATE TABLE IF NOT EXISTS payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tenant uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  
  -- Payment details
  rent_amount numeric(12,2) NOT NULL DEFAULT 0,
  water_bill numeric(12,2) DEFAULT 0,
  electrical_bill numeric(12,2) DEFAULT 0,
  other_bills numeric(12,2) DEFAULT 0,
  bills_description text,
  
  -- Due date and status
  due_date timestamp with time zone,
  status text DEFAULT 'pending', -- pending / pending_confirmation / paid / overdue / cancelled
  
  -- Payment tracking
  paid_at timestamp with time zone,
  payment_method text,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_requests_tenant ON payment_requests(tenant);
CREATE INDEX IF NOT EXISTS idx_payment_requests_landlord ON payment_requests(landlord);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_due_date ON payment_requests(due_date);

-- Enable RLS
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Landlords can see their own payment requests
CREATE POLICY "Landlords can view own payment requests"
  ON payment_requests FOR SELECT
  USING (auth.uid() = landlord);

-- Tenants can see payment requests sent to them
CREATE POLICY "Tenants can view their payment requests"
  ON payment_requests FOR SELECT
  USING (auth.uid() = tenant);

-- Landlords can create payment requests
CREATE POLICY "Landlords can create payment requests"
  ON payment_requests FOR INSERT
  WITH CHECK (auth.uid() = landlord);

-- Landlords can update their own payment requests
CREATE POLICY "Landlords can update own payment requests"
  ON payment_requests FOR UPDATE
  USING (auth.uid() = landlord);

-- Tenants can update status to paid (when they pay)
CREATE POLICY "Tenants can update payment requests to paid"
  ON payment_requests FOR UPDATE
  USING (auth.uid() = tenant);

-- Landlords can delete their own payment requests
CREATE POLICY "Landlords can delete own payment requests"
  ON payment_requests FOR DELETE
  USING (auth.uid() = landlord);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_payment_requests_updated_at
  BEFORE UPDATE ON payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_requests_updated_at();

-- Add link column to notifications table if it doesn't exist
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link text;
