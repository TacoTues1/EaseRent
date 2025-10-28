-- ============================================
-- RESET ALL APPLICATIONS HISTORY
-- ============================================
-- This script deletes ALL application records
-- for ALL users in the database.
-- 
-- WARNING: This action is IRREVERSIBLE!
-- Make sure you have a backup before running this script.
-- ============================================

-- Delete all booking records first (foreign key constraint)
DELETE FROM bookings;

-- Delete all application records
DELETE FROM applications;

-- Optional: Delete application-related notifications
-- Uncomment the lines below if you also want to remove application notifications
-- DELETE FROM notifications 
-- WHERE type IN ('application', 'application_status', 'booking');

-- Show confirmation message
SELECT 
  'All application history has been deleted!' as status,
  (SELECT COUNT(*) FROM applications) as remaining_applications,
  (SELECT COUNT(*) FROM bookings) as remaining_bookings;
