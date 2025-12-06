-- ============================================
-- Clean Up Orphaned Applications
-- ============================================
-- Delete applications where the tenant no longer exists

-- Check orphaned applications (tenant = null or profile deleted)
SELECT a.id, a.property_id, a.tenant, a.status, a.submitted_at
FROM applications a
LEFT JOIN profiles p ON a.tenant = p.id
WHERE a.tenant IS NULL OR p.id IS NULL;

-- Delete applications with null tenants
DELETE FROM applications
WHERE tenant IS NULL;

-- Delete applications where tenant profile was deleted
DELETE FROM applications a
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = a.tenant
);

-- Verify cleanup
SELECT COUNT(*) as total_applications FROM applications;
SELECT COUNT(*) as applications_with_valid_tenants 
FROM applications a
INNER JOIN profiles p ON a.tenant = p.id;
