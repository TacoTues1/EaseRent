-- ============================================
-- Fix Profiles RLS Policies for Chat System
-- Allow users to view other users' basic info for messaging
-- ============================================

-- Check current policies (for reference)
-- SELECT * FROM pg_policies WHERE tablename = 'profiles';

-- Drop existing SELECT policies that might be too restrictive
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;

-- Create new policy: Allow authenticated users to view all profiles
-- This is needed for the chat system to show list of users
CREATE POLICY "Authenticated users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Keep existing policies for INSERT/UPDATE/DELETE if they exist
-- Users should only be able to update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert their own profile (for signup)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "Authenticated users can view all profiles" ON profiles IS 
  'Allows all authenticated users to see basic profile information of other users for messaging and discovery';
