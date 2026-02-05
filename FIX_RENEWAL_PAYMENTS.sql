-- ============================================
-- Fix Existing Renewal Payment Data
-- ============================================
-- This script fixes:
-- 1. Renewal payments with incorrect due_date (contract end date instead of actual next due date)
-- 2. Credit balance incorrectly added from renewal payment advance amounts
-- ============================================

-- Step 1: Fix renewal payment due_dates
-- This creates a function to calculate the correct next due date
DO $$
DECLARE
  renewal_record RECORD;
  last_bill_record RECORD;
  calculated_due_date TIMESTAMP;
  months_to_add INTEGER;
  last_due_date DATE;
  last_rent_amount NUMERIC;
  last_advance_amount NUMERIC;
  occupancy_start_date DATE;
BEGIN
  -- Loop through all renewal payments
  FOR renewal_record IN 
    SELECT 
      pr.id,
      pr.tenant,
      pr.occupancy_id,
      pr.due_date as current_due_date,
      pr.rent_amount,
      pr.advance_amount
    FROM payment_requests pr
    WHERE pr.is_renewal_payment = true
      AND pr.status IN ('paid', 'pending_confirmation')
      AND pr.advance_amount > 0
  LOOP
    -- Find the last paid bill before this renewal
    SELECT 
      due_date,
      rent_amount,
      advance_amount
    INTO last_bill_record
    FROM payment_requests
    WHERE tenant = renewal_record.tenant
      AND occupancy_id = renewal_record.occupancy_id
      AND status IN ('paid', 'pending_confirmation')
      AND id != renewal_record.id
      AND rent_amount > 0
      AND (is_renewal_payment IS NULL OR is_renewal_payment = false)
    ORDER BY due_date DESC
    LIMIT 1;
    
    -- Calculate the correct due date
    IF last_bill_record.due_date IS NOT NULL THEN
      -- Calculate months covered by last bill
      last_due_date := last_bill_record.due_date::date;
      last_rent_amount := last_bill_record.rent_amount;
      last_advance_amount := COALESCE(last_bill_record.advance_amount, 0);
      
      IF last_rent_amount > 0 AND last_advance_amount > 0 THEN
        months_to_add := 1 + FLOOR(last_advance_amount / last_rent_amount);
      ELSE
        months_to_add := 1;
      END IF;
      
      -- The renewal payment's due_date should be the calculated next due date from last bill
      -- Example: If last bill due_date = Feb 6, and it covers 1 month, then next due = March 6
      -- The renewal payment's due_date should be March 6 (the actual next due date)
      -- NOT March 6 + 1 month = April 6
      -- The renewal payment itself will cover March 6 + advance (April 6), so next due after renewal = May 6
      calculated_due_date := (last_due_date + (months_to_add || ' months')::INTERVAL)::TIMESTAMP;
    ELSE
      -- No last paid bill, use occupancy start_date + 1 month
      SELECT start_date INTO occupancy_start_date
      FROM tenant_occupancies
      WHERE id = renewal_record.occupancy_id;
      
      IF occupancy_start_date IS NOT NULL THEN
        calculated_due_date := (occupancy_start_date + INTERVAL '1 month')::TIMESTAMP;
      ELSE
        -- Fallback: keep current due_date
        calculated_due_date := renewal_record.current_due_date;
      END IF;
    END IF;
    
    -- Update the renewal payment's due_date
    UPDATE payment_requests
    SET due_date = calculated_due_date
    WHERE id = renewal_record.id
      AND due_date != calculated_due_date;
    
    RAISE NOTICE 'Updated renewal payment %: due_date from % to %', 
      renewal_record.id, 
      renewal_record.current_due_date, 
      calculated_due_date;
  END LOOP;
END $$;

-- Step 2: Remove credit balance that was incorrectly added from renewal payments
-- Find and remove credit balances that match renewal payment advance amounts
DO $$
DECLARE
  credit_record RECORD;
  renewal_advance NUMERIC;
BEGIN
  -- Loop through all tenant balances
  FOR credit_record IN 
    SELECT 
      tb.tenant_id,
      tb.occupancy_id,
      tb.amount as credit_amount
    FROM tenant_balances tb
    WHERE tb.amount > 0
  LOOP
    -- Find renewal payments for this tenant/occupancy
    SELECT COALESCE(SUM(pr.advance_amount), 0)
    INTO renewal_advance
    FROM payment_requests pr
    WHERE pr.tenant = credit_record.tenant_id
      AND (pr.occupancy_id = credit_record.occupancy_id 
           OR (pr.occupancy_id IS NULL AND credit_record.occupancy_id IS NULL))
      AND pr.is_renewal_payment = true
      AND pr.status IN ('paid', 'pending_confirmation')
      AND pr.advance_amount > 0;
    
    -- If credit matches or exceeds renewal advance, remove/reduce it
    IF renewal_advance > 0 THEN
      IF ABS(credit_record.credit_amount - renewal_advance) < 0.01 THEN
        -- Credit exactly matches advance amount - remove it
        UPDATE tenant_balances
        SET amount = 0, last_updated = NOW()
        WHERE tenant_id = credit_record.tenant_id
          AND (occupancy_id = credit_record.occupancy_id 
               OR (occupancy_id IS NULL AND credit_record.occupancy_id IS NULL));
        
        RAISE NOTICE 'Removed credit balance % for tenant % (matched renewal advance %)', 
          credit_record.credit_amount, 
          credit_record.tenant_id, 
          renewal_advance;
      ELSIF credit_record.credit_amount >= renewal_advance THEN
        -- Credit is greater than or equal to advance - reduce by advance amount
        UPDATE tenant_balances
        SET amount = credit_record.credit_amount - renewal_advance,
            last_updated = NOW()
        WHERE tenant_id = credit_record.tenant_id
          AND (occupancy_id = credit_record.occupancy_id 
               OR (occupancy_id IS NULL AND credit_record.occupancy_id IS NULL));
        
        RAISE NOTICE 'Reduced credit balance from % to % for tenant % (renewal advance: %)', 
          credit_record.credit_amount,
          credit_record.credit_amount - renewal_advance,
          credit_record.tenant_id,
          renewal_advance;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Step 3: Show summary of changes
SELECT 
  'Renewal Payments' as category,
  COUNT(*) as total_count,
  COUNT(CASE WHEN due_date IS NOT NULL THEN 1 END) as with_due_date
FROM payment_requests
WHERE is_renewal_payment = true
  AND status IN ('paid', 'pending_confirmation')
  AND advance_amount > 0;

SELECT 
  'Credit Balances' as category,
  COUNT(*) as total_count,
  SUM(amount) as total_amount,
  COUNT(CASE WHEN amount = 0 THEN 1 END) as zero_balance_count
FROM tenant_balances;

-- ============================================
-- Manual Verification Queries
-- ============================================
-- Run these to verify the fixes:

-- Check renewal payments and their due dates
-- SELECT 
--   pr.id,
--   pr.tenant,
--   pr.due_date,
--   pr.rent_amount,
--   pr.advance_amount,
--   pr.is_renewal_payment,
--   pr.status,
--   to.contract_end_date,
--   to.start_date
-- FROM payment_requests pr
-- LEFT JOIN tenant_occupancies to ON pr.occupancy_id = to.id
-- WHERE pr.is_renewal_payment = true
-- ORDER BY pr.due_date DESC;

-- Check credit balances
-- SELECT 
--   tb.tenant_id,
--   tb.occupancy_id,
--   tb.amount,
--   tb.last_updated,
--   p.first_name || ' ' || p.last_name as tenant_name
-- FROM tenant_balances tb
-- LEFT JOIN profiles p ON tb.tenant_id = p.id
-- WHERE tb.amount > 0
-- ORDER BY tb.amount DESC;

-- Check renewal payments with their advance amounts
-- SELECT 
--   pr.id,
--   pr.tenant,
--   pr.advance_amount,
--   pr.due_date,
--   pr.status,
--   tb.amount as credit_balance
-- FROM payment_requests pr
-- LEFT JOIN tenant_balances tb ON pr.tenant = tb.tenant_id 
--   AND pr.occupancy_id = tb.occupancy_id
-- WHERE pr.is_renewal_payment = true
--   AND pr.advance_amount > 0
-- ORDER BY pr.due_date DESC;
