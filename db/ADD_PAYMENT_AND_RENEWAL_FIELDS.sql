-- ============================================================
-- RUN THESE STATEMENTS ONE AT A TIME IN SUPABASE SQL EDITOR
-- Wait for each to complete before running the next one
-- ============================================================

-- STEP 1: Add security_deposit_amount
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS security_deposit_amount numeric(12,2) DEFAULT 0;

-- STEP 2: Add advance_amount
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS advance_amount numeric(12,2) DEFAULT 0;

-- STEP 3: Add is_move_in_payment
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS is_move_in_payment boolean DEFAULT false;

-- STEP 4: Add is_renewal_payment
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS is_renewal_payment boolean DEFAULT false;

-- STEP 5: Add renewal_signing_date to tenant_occupancies
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS renewal_signing_date DATE;

