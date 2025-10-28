-- ============================================
-- RESET ALL PAYMENT HISTORY
-- ============================================
-- This script deletes ALL payment records and payment requests
-- for ALL users in the database.
-- 
-- WARNING: This action is IRREVERSIBLE!
-- Make sure you have a backup before running this script.
-- ============================================

-- Delete all payment records (confirmed payments)
DELETE FROM payments;

-- Delete all payment requests (bills sent to tenants)
DELETE FROM payment_requests;

-- Optional: Delete payment-related notifications
-- Uncomment the lines below if you also want to remove payment notifications
-- DELETE FROM notifications 
-- WHERE type IN ('payment_request', 'payment_confirmation_needed', 'payment_confirmed');

-- Show confirmation message
SELECT 
  'All payment history has been deleted!' as status,
  (SELECT COUNT(*) FROM payments) as remaining_payments,
  (SELECT COUNT(*) FROM payment_requests) as remaining_payment_requests;
