-- Add bill columns to payments table

-- Add new columns for different bill types
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS water_bill numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS electrical_bill numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_bills numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS bills_description text,
ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES applications(id) ON DELETE SET NULL;

-- Create index for application_id
CREATE INDEX IF NOT EXISTS idx_payments_application ON payments(application_id);

-- Note: The 'amount' column will now represent the rent amount
-- Total payment = amount (rent) + water_bill + electrical_bill + other_bills
