-- Row Level Security (RLS) Policies for EaseRent
-- Run this in Supabase SQL Editor to enable proper data access

-- ============================================
-- PROFILES TABLE POLICIES
-- ============================================

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Allow users to insert their own profile (for signup)
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ============================================
-- PROPERTIES TABLE POLICIES
-- ============================================

-- Enable RLS on properties
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Everyone can view available properties
CREATE POLICY "Anyone can view available properties"
ON properties FOR SELECT
TO authenticated
USING (available = true);

-- Landlords can view their own properties (even if not available)
CREATE POLICY "Landlords can view own properties"
ON properties FOR SELECT
TO authenticated
USING (
  landlord = auth.uid() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'landlord'
  )
);

-- Only landlords can insert properties
CREATE POLICY "Landlords can insert properties"
ON properties FOR INSERT
TO authenticated
WITH CHECK (
  landlord = auth.uid() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'landlord'
  )
);

-- Landlords can update their own properties
CREATE POLICY "Landlords can update own properties"
ON properties FOR UPDATE
TO authenticated
USING (landlord = auth.uid())
WITH CHECK (landlord = auth.uid());

-- Landlords can delete their own properties
CREATE POLICY "Landlords can delete own properties"
ON properties FOR DELETE
TO authenticated
USING (landlord = auth.uid());

-- ============================================
-- APPLICATIONS TABLE POLICIES
-- ============================================

-- Enable RLS on applications
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Tenants can view their own applications
CREATE POLICY "Tenants can view own applications"
ON applications FOR SELECT
TO authenticated
USING (tenant = auth.uid());

-- Landlords can view applications for their properties
CREATE POLICY "Landlords can view applications for own properties"
ON applications FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties 
    WHERE properties.id = applications.property_id 
    AND properties.landlord = auth.uid()
  )
);

-- Tenants can insert applications
CREATE POLICY "Tenants can insert applications"
ON applications FOR INSERT
TO authenticated
WITH CHECK (tenant = auth.uid());

-- Landlords can update applications for their properties
CREATE POLICY "Landlords can update applications for own properties"
ON applications FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties 
    WHERE properties.id = applications.property_id 
    AND properties.landlord = auth.uid()
  )
);

-- ============================================
-- BOOKINGS TABLE POLICIES
-- ============================================

-- Enable RLS on bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Users can view bookings they're involved in
CREATE POLICY "Users can view own bookings"
ON bookings FOR SELECT
TO authenticated
USING (
  tenant = auth.uid() 
  OR landlord = auth.uid()
);

-- Tenants can insert bookings
CREATE POLICY "Tenants can insert bookings"
ON bookings FOR INSERT
TO authenticated
WITH CHECK (tenant = auth.uid());

-- Users can update their own bookings
CREATE POLICY "Users can update own bookings"
ON bookings FOR UPDATE
TO authenticated
USING (tenant = auth.uid() OR landlord = auth.uid());

-- ============================================
-- MAINTENANCE REQUESTS TABLE POLICIES
-- ============================================

-- Enable RLS on maintenance_requests
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;

-- Tenants can view their own requests
CREATE POLICY "Tenants can view own maintenance requests"
ON maintenance_requests FOR SELECT
TO authenticated
USING (tenant = auth.uid());

-- Landlords can view requests for their properties
CREATE POLICY "Landlords can view maintenance requests for own properties"
ON maintenance_requests FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties 
    WHERE properties.id = maintenance_requests.property_id 
    AND properties.landlord = auth.uid()
  )
);

-- Tenants can insert maintenance requests
CREATE POLICY "Tenants can insert maintenance requests"
ON maintenance_requests FOR INSERT
TO authenticated
WITH CHECK (tenant = auth.uid());

-- Landlords can update maintenance requests for their properties
CREATE POLICY "Landlords can update maintenance requests for own properties"
ON maintenance_requests FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties 
    WHERE properties.id = maintenance_requests.property_id 
    AND properties.landlord = auth.uid()
  )
);

-- ============================================
-- PAYMENTS TABLE POLICIES
-- ============================================

-- Enable RLS on payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Users can view payments they're involved in
CREATE POLICY "Users can view own payments"
ON payments FOR SELECT
TO authenticated
USING (
  tenant = auth.uid() 
  OR landlord = auth.uid()
);

-- Tenants and landlords can insert payments
CREATE POLICY "Users can insert payments"
ON payments FOR INSERT
TO authenticated
WITH CHECK (
  tenant = auth.uid() 
  OR landlord = auth.uid()
);

-- Users can update their own payments
CREATE POLICY "Users can update own payments"
ON payments FOR UPDATE
TO authenticated
USING (tenant = auth.uid() OR landlord = auth.uid());

-- ============================================
-- NOTIFICATIONS TABLE POLICIES
-- ============================================

-- Enable RLS on notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON notifications FOR SELECT
TO authenticated
USING (recipient = auth.uid());

-- Anyone can insert notifications (for actors creating notifications)
CREATE POLICY "Users can insert notifications"
ON notifications FOR INSERT
TO authenticated
WITH CHECK (true);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (recipient = auth.uid())
WITH CHECK (recipient = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON notifications FOR DELETE
TO authenticated
USING (recipient = auth.uid());

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these to verify policies were created:
-- SELECT * FROM pg_policies WHERE tablename = 'profiles';
-- SELECT * FROM pg_policies WHERE tablename = 'properties';
-- SELECT * FROM pg_policies WHERE tablename = 'applications';

-- To check if RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
