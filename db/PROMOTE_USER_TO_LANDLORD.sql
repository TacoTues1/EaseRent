-- ============================================
-- PROMOTE USER TO LANDLORD
-- ============================================
-- This script changes a user's role from 'tenant' to 'landlord'
-- ============================================

-- METHOD 1: Promote user by email
-- Replace 'user@example.com' with the actual user's email
UPDATE profiles
SET role = 'landlord'
WHERE email = 'user@example.com';

-- METHOD 2: Promote user by user ID
-- Replace 'user-uuid-here' with the actual user's UUID
-- UPDATE profiles
-- SET role = 'landlord'
-- WHERE id = 'user-uuid-here';

-- METHOD 3: Promote user by full name
-- Replace 'John Doe' with the actual user's name
-- UPDATE profiles
-- SET role = 'landlord'
-- WHERE full_name = 'John Doe';

-- ============================================
-- PROMOTE MULTIPLE USERS AT ONCE
-- ============================================
-- Uncomment and modify the emails list below
-- UPDATE profiles
-- SET role = 'landlord'
-- WHERE email IN (
--   'user1@example.com',
--   'user2@example.com',
--   'user3@example.com'
-- );

-- ============================================
-- VIEW ALL USERS AND THEIR CURRENT ROLES
-- ============================================
-- Run this query first to see all users and their roles
-- This helps you identify which user to promote
SELECT 
  id,
  email,
  full_name,
  role,
  created_at
FROM profiles
ORDER BY created_at DESC;

-- ============================================
-- VERIFY THE CHANGE
-- ============================================
-- After running the UPDATE, check if it worked:
-- Replace 'user@example.com' with the email you just updated
SELECT 
  email,
  full_name,
  role,
  'Successfully promoted to landlord!' as status
FROM profiles
WHERE email = 'user@example.com';
