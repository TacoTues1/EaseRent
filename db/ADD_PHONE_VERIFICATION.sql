-- Add phone verification columns to profiles table
-- Run this in the Supabase SQL Editor

-- Add phone_verified boolean column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS phone_verified boolean DEFAULT false;

-- Add phone_verified_at timestamp column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS phone_verified_at timestamp with time zone;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_phone_verified ON profiles(phone_verified);

-- Update existing profiles with verified phones if they match auth.users phone
-- (This is optional, only if you had verified phones through Supabase Auth before)
UPDATE profiles p
SET 
  phone_verified = true,
  phone_verified_at = u.phone_confirmed_at
FROM auth.users u
WHERE p.id = u.id 
  AND u.phone IS NOT NULL 
  AND u.phone_confirmed_at IS NOT NULL
  AND p.phone = u.phone;
