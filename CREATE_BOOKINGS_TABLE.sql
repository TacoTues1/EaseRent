-- Update existing bookings table to add application_id, booking_date, and notes columns
-- Note: The bookings table already exists in your schema with tenant, landlord, start_time, end_time

-- Add new columns to existing bookings table
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS booking_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant);
CREATE INDEX IF NOT EXISTS idx_bookings_landlord ON bookings(landlord);
CREATE INDEX IF NOT EXISTS idx_bookings_property ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_application ON bookings(application_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_date ON bookings(booking_date);

-- Enable Row Level Security (if not already enabled)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Tenants can create bookings" ON bookings;
DROP POLICY IF EXISTS "Tenants can view their bookings" ON bookings;
DROP POLICY IF EXISTS "Landlords can view their bookings" ON bookings;
DROP POLICY IF EXISTS "Landlords can update booking status" ON bookings;
DROP POLICY IF EXISTS "Tenants can cancel their bookings" ON bookings;

-- RLS Policy: Tenants can insert their own bookings
CREATE POLICY "Tenants can create bookings"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = tenant);

-- RLS Policy: Tenants can view their own bookings
CREATE POLICY "Tenants can view their bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (auth.uid() = tenant);

-- RLS Policy: Landlords can view bookings for their properties
CREATE POLICY "Landlords can view their bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (auth.uid() = landlord);

-- RLS Policy: Landlords can update status of their bookings
CREATE POLICY "Landlords can update booking status"
  ON bookings FOR UPDATE
  TO authenticated
  USING (auth.uid() = landlord)
  WITH CHECK (auth.uid() = landlord);

-- RLS Policy: Tenants can cancel their own bookings
CREATE POLICY "Tenants can cancel their bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (auth.uid() = tenant AND status = 'scheduled')
  WITH CHECK (auth.uid() = tenant AND status = 'cancelled');

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_bookings_updated_at();
