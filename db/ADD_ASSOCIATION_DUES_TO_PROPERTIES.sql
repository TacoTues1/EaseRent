-- Migration: Add association_dues column to properties table
ALTER TABLE properties
ADD COLUMN association_dues numeric;
