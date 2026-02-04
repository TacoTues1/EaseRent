-- Add due_date column to payments table to match payment_requests
-- This allows us to track when the payment was originally due

ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS due_date timestamp with time zone;

-- Create index for faster queries by due_date
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
