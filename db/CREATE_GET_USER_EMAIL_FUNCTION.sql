-- ============================================
-- Function to Get User Email from auth.users
-- ============================================
-- This function allows us to retrieve a user's email from auth.users table
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_user_email(user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = user_id;
  
  RETURN user_email;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_email(UUID) TO authenticated;

COMMENT ON FUNCTION get_user_email IS 'Returns the email address for a given user ID from auth.users';
