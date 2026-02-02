-- ============================================================
-- MIGRATION: Add Cleanliness, Communication, Location Ratings
-- ============================================================
-- Run this SQL in your Supabase SQL Editor

-- Step 1: Add new rating columns to reviews table
-- These columns store individual ratings for each category (1-5 stars)
ALTER TABLE reviews 
  ADD COLUMN IF NOT EXISTS cleanliness_rating INTEGER CHECK (cleanliness_rating >= 1 AND cleanliness_rating <= 5),
  ADD COLUMN IF NOT EXISTS communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
  ADD COLUMN IF NOT EXISTS location_rating INTEGER CHECK (location_rating >= 1 AND location_rating <= 5);

-- Step 2: Backfill existing reviews (optional)
-- This sets old reviews' new category ratings to match their original overall rating
UPDATE reviews 
SET cleanliness_rating = rating,
    communication_rating = rating,
    location_rating = rating
WHERE cleanliness_rating IS NULL;

-- Step 3: Drop and recreate the property_stats view with new columns
-- The overall rating (avg_rating) is now calculated as the average of all 3 categories
DROP VIEW IF EXISTS property_stats;

CREATE OR REPLACE VIEW property_stats AS
SELECT 
  p.id as property_id,
  COUNT(DISTINCT f.id) as favorite_count,
  -- Overall rating = (cleanliness + communication + location) / 3
  COALESCE(
    AVG((COALESCE(r.cleanliness_rating, 0) + COALESCE(r.communication_rating, 0) + COALESCE(r.location_rating, 0)) / 3.0), 
    0
  ) as avg_rating,
  COUNT(DISTINCT r.id) as review_count,
  -- Individual category averages for display in property details
  COALESCE(AVG(r.cleanliness_rating), 0) as avg_cleanliness,
  COALESCE(AVG(r.communication_rating), 0) as avg_communication,
  COALESCE(AVG(r.location_rating), 0) as avg_location
FROM properties p
LEFT JOIN favorites f ON p.id = f.property_id
LEFT JOIN reviews r ON p.id = r.property_id
GROUP BY p.id;

-- Step 4: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reviews_cleanliness ON reviews(cleanliness_rating);
CREATE INDEX IF NOT EXISTS idx_reviews_communication ON reviews(communication_rating);
CREATE INDEX IF NOT EXISTS idx_reviews_location ON reviews(location_rating);
