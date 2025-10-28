-- Add DELETE policies for applications table
-- This allows tenants and landlords to delete applications

-- Drop existing delete policies if they exist
DROP POLICY IF EXISTS "Tenants can delete own applications" ON applications;
DROP POLICY IF EXISTS "Landlords can delete applications for own properties" ON applications;

-- Tenants can delete their own applications
CREATE POLICY "Tenants can delete own applications"
ON applications FOR DELETE
TO authenticated
USING (tenant = auth.uid());

-- Landlords can delete applications for their properties
CREATE POLICY "Landlords can delete applications for own properties"
ON applications FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties 
    WHERE properties.id = applications.property_id 
    AND properties.landlord = auth.uid()
  )
);
