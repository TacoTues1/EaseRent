CREATE OR REPLACE FUNCTION public.create_message_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Schedule reminder for 6 hours from now
  INSERT INTO scheduled_reminders (type, target_id, recipient_id, send_at)
  VALUES ('unread_message', NEW.id, NEW.receiver_id, NOW() + INTERVAL '6 hours');
  
  RETURN NEW;
END;
$$;

-- Drop the trigger if it already exists to avoid errors
DROP TRIGGER IF EXISTS trigger_create_message_reminder ON messages;

-- Create the trigger to execute the function on INSERT actions
CREATE TRIGGER trigger_create_message_reminder
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION create_message_reminder();
