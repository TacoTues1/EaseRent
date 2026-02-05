CREATE OR REPLACE FUNCTION public.update_bookings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop the trigger if it already exists to avoid errors
DROP TRIGGER IF EXISTS trigger_update_bookings_updated_at ON bookings;

-- Create the trigger to execute the function on UPDATE actions
CREATE TRIGGER trigger_update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_bookings_updated_at();
