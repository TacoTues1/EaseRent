-- Admin Account Setup Script
-- Run this in Supabase SQL Editor AFTER creating the admin user via Supabase Auth

-- STEP 1: First, create the admin user via Supabase Dashboard:
-- Go to Authentication > Users > Add User
-- Email: admin@easerent.com
-- Password: Admin@123 (or your preferred password)
-- Auto Confirm User: YES (check this box)

-- STEP 2: After creating the user, copy the User ID from the dashboard

-- STEP 3: Run this SQL (replace 'USER_ID_HERE' with the actual UUID):
/*
INSERT INTO profiles (id, full_name, role, phone)
VALUES 
  ('USER_ID_HERE', 'Admin User', 'landlord', NULL);
*/

-- Alternative: If you want to update an existing user to admin:
-- UPDATE profiles SET role = 'landlord' WHERE id = 'USER_ID_HERE';

-- To find existing users and their IDs:
-- SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC LIMIT 10;

-- To verify the profile was created:
-- SELECT * FROM profiles WHERE role = 'landlord';

-- ========================================
-- QUICK SETUP (Replace with your details)
-- ========================================
-- After you create admin@easerent.com in Supabase Auth dashboard,
-- get the UUID and run:

-- Example (replace with real UUID):
-- INSERT INTO profiles (id, full_name, role, phone)
-- VALUES 
--   ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Admin User', 'landlord', NULL);
