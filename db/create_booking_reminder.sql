CREATE OR REPLACE FUNCTION public.create_booking_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only create reminder for relevant booking statuses
  -- We include 'pending_approval', 'approved', 'scheduled', and legacy 'pending'/'accepted'
  IF NEW.status IN ('pending_approval', 'approved', 'scheduled', 'pending', 'accepted') AND NEW.booking_date IS NOT NULL THEN
    
    -- Schedule reminder for 12 hours before booking for the tenant
    INSERT INTO scheduled_reminders (type, target_id, recipient_id, send_at)
    VALUES ('booking_reminder', NEW.id, NEW.tenant, NEW.booking_date - INTERVAL '12 hours');

    -- Note: If you want to also remind the landlord, uncomment the following:
    -- INSERT INTO scheduled_reminders (type, target_id, recipient_id, send_at)
    -- VALUES ('booking_reminder', NEW.id, NEW.landlord, NEW.booking_date - INTERVAL '12 hours');
    
  END IF;

  RETURN NEW;
END;
$$;

-- Drop the trigger if it already exists to avoid errors
DROP TRIGGER IF EXISTS trigger_create_booking_reminder ON bookings;

-- Create the trigger to execute the function on INSERT actions
CREATE TRIGGER trigger_create_booking_reminder
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION create_booking_reminder();
