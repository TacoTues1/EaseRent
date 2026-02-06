-- Add notification_preferences column to profiles table if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "sms": true, "push": true}'::jsonb;

-- Comment on column
COMMENT ON COLUMN profiles.notification_preferences IS 'User preferences for different notification channels';

-- Ensure the column is accessible (usually covered by existing SELECT * policies, but good to be safe)
-- Note: existing RLS policies usually cover "Users can update own profile", which includes all columns unless restricted.
