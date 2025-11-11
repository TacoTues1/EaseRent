-- ============================================
-- Update Bookings System for Approval Flow
-- ============================================

-- Add new columns to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS booking_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES applications(id) ON DELETE CASCADE;

-- Update status to include 'pending_approval' and 'approved'
-- Status values: pending_approval / approved / scheduled / completed / cancelled / rejected
COMMENT ON COLUMN bookings.status IS 'Status: pending_approval / approved / scheduled / completed / cancelled / rejected';

-- Create available time slots table for landlords
-- property_id is nullable to support general availability (not property-specific)
CREATE TABLE IF NOT EXISTS available_time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE, -- Nullable for general availability
  landlord_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_booked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_time_slots_property ON available_time_slots(property_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_landlord ON available_time_slots(landlord_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_available ON available_time_slots(property_id, is_booked) WHERE is_booked = false;
CREATE INDEX IF NOT EXISTS idx_bookings_application ON bookings(application_id);

-- Enable RLS
ALTER TABLE available_time_slots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for available_time_slots
DROP POLICY IF EXISTS "Anyone can view available time slots" ON available_time_slots;
DROP POLICY IF EXISTS "Landlords can manage their time slots" ON available_time_slots;

CREATE POLICY "Anyone can view available time slots" ON available_time_slots
  FOR SELECT
  USING (true);

CREATE POLICY "Landlords can manage their time slots" ON available_time_slots
  FOR ALL
  USING (auth.uid() = landlord_id)
  WITH CHECK (auth.uid() = landlord_id);

-- Update bookings policies for approval flow
DROP POLICY IF EXISTS "Users can update own bookings" ON bookings;

CREATE POLICY "Users can update own bookings" ON bookings
  FOR UPDATE
  USING (
    auth.uid() = tenant OR 
    auth.uid() = landlord
  );

-- Grant permissions
GRANT ALL ON available_time_slots TO authenticated;

COMMENT ON TABLE available_time_slots IS 'Stores available time slots set by landlords for property viewings. property_id can be null for general availability.';
COMMENT ON COLUMN available_time_slots.is_booked IS 'Whether this time slot has been booked by a tenant';
COMMENT ON COLUMN available_time_slots.property_id IS 'Optional: Specific property. NULL means landlord is generally available for any property viewing';
