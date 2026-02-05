-- Create scheduled_reminders table if it doesn't exist
CREATE TABLE IF NOT EXISTS scheduled_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  target_id UUID NOT NULL,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  send_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for finding unsent reminders
CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_unsent ON scheduled_reminders(sent, send_at) WHERE sent = false;

-- Function to create a reminder when a message is inserted
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

-- Function to cancel reminder if message is read
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

-- Drop the trigger if it already exists
DROP TRIGGER IF EXISTS trigger_cancel_message_reminder ON messages;

-- Create the trigger to execute the function on UPDATE actions
CREATE TRIGGER trigger_cancel_message_reminder
  AFTER UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION cancel_message_reminder();
