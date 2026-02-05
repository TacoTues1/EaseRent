CREATE OR REPLACE FUNCTION public.cancel_message_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If message is now read, cancel the reminder by marking it as sent
  IF NEW.read = TRUE AND OLD.read = FALSE THEN
    UPDATE scheduled_reminders 
    SET sent = TRUE 
    WHERE type = 'unread_message' AND target_id = NEW.id AND sent = FALSE;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop the trigger if it already exists to avoid errors
DROP TRIGGER IF EXISTS trigger_cancel_message_reminder ON messages;

-- Create the trigger to execute the function on UPDATE actions
CREATE TRIGGER trigger_cancel_message_reminder
  AFTER UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION cancel_message_reminder();
