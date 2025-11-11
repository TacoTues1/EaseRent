-- DELETE ALL TEST USERS (Use with caution!)
-- This will delete all users from auth.users and their profiles

-- First, delete all profiles
DELETE FROM public.profiles;

-- Note: You cannot directly delete from auth.users via SQL
-- You must use Supabase Dashboard or Admin API

-- To delete users from Dashboard:
-- 1. Go to Authentication → Users
-- 2. Refresh the page
-- 3. Delete each user individually
-- 4. If you see "User not found", refresh again - it's already deleted

-- Alternatively, delete specific test users by email:
-- Go to SQL Editor and run (replace with your test email):
-- This requires the auth.uid() function and proper RLS policies
