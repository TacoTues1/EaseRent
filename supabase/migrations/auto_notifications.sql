-- =============================================================
-- SUPABASE: Create scheduled_reminders table
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================

-- Create table for scheduled reminders
CREATE TABLE IF NOT EXISTS scheduled_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL, -- 'unread_message', 'booking_reminder', etc.
  target_id UUID NOT NULL, -- message_id, booking_id, etc.
  recipient_id UUID NOT NULL,
  send_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_pending 
ON scheduled_reminders(send_at, sent) 
WHERE sent = FALSE;

-- =============================================================
-- TRIGGER: Auto-create reminder when message is inserted
-- =============================================================
CREATE OR REPLACE FUNCTION create_message_reminder()
RETURNS TRIGGER
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

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_create_message_reminder ON messages;

-- Create trigger
CREATE TRIGGER trigger_create_message_reminder
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION create_message_reminder();

-- =============================================================
-- TRIGGER: Auto-create reminder when booking is created (12 hours before)
-- =============================================================
CREATE OR REPLACE FUNCTION create_booking_reminder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only create reminder for pending/approved bookings
  IF NEW.status IN ('pending', 'approved', 'accepted') AND NEW.booking_date IS NOT NULL THEN
    -- Schedule reminder for 12 hours before booking
    INSERT INTO scheduled_reminders (type, target_id, recipient_id, send_at)
    VALUES ('booking_reminder', NEW.id, NEW.tenant, NEW.booking_date - INTERVAL '12 hours');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_create_booking_reminder ON bookings;

-- Create trigger
CREATE TRIGGER trigger_create_booking_reminder
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION create_booking_reminder();

-- =============================================================
-- CLEANUP: Function to mark message reminders as sent when message is read
-- =============================================================
CREATE OR REPLACE FUNCTION cancel_message_reminder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If message is now read, cancel the reminder
  IF NEW.read = TRUE AND OLD.read = FALSE THEN
    UPDATE scheduled_reminders 
    SET sent = TRUE 
    WHERE type = 'unread_message' AND target_id = NEW.id AND sent = FALSE;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_cancel_message_reminder ON messages;

CREATE TRIGGER trigger_cancel_message_reminder
  AFTER UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION cancel_message_reminder();
