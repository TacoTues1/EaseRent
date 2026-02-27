ALTER TABLE maintenance_requests 
ADD COLUMN IF NOT EXISTS is_family_member BOOLEAN DEFAULT false;

ALTER TABLE maintenance_requests 
ADD COLUMN IF NOT EXISTS primary_tenant_name TEXT;
