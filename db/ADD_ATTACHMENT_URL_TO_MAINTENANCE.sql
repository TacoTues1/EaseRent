-- Add attachment_urls column to maintenance_requests table (supports multiple files)
ALTER TABLE maintenance_requests
ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] DEFAULT '{}';

-- Add a comment for documentation
COMMENT ON COLUMN maintenance_requests.attachment_urls IS 'Array of URLs to proof images/videos uploaded by tenant';

-- Migration: If you had the old single attachment_url column, migrate data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'maintenance_requests' AND column_name = 'attachment_url') THEN
    UPDATE maintenance_requests 
    SET attachment_urls = ARRAY[attachment_url] 
    WHERE attachment_url IS NOT NULL AND attachment_urls = '{}';
    
    ALTER TABLE maintenance_requests DROP COLUMN IF EXISTS attachment_url;
  END IF;
END $$;
