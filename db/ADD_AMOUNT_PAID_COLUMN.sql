-- Add amount_paid column to payment_requests to track actual amount paid by tenant
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) DEFAULT 0;

-- Update existing paid records to calculate amount_paid from bill total
UPDATE payment_requests 
SET amount_paid = COALESCE(rent_amount, 0) + 
                  COALESCE(security_deposit_amount, 0) + 
                  COALESCE(water_bill, 0) + 
                  COALESCE(electrical_bill, 0) + 
                  COALESCE(other_bills, 0) +
                  COALESCE(advance_amount, 0)
WHERE status IN ('paid', 'pending_confirmation') 
  AND (amount_paid IS NULL OR amount_paid = 0);
