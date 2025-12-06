-- ============================================
-- Fix Notifications Foreign Key Constraints
-- ============================================
-- Run this in Supabase SQL Editor to allow deleting 
-- profiles/users that have related notifications

-- First, drop the existing foreign key constraints
ALTER TABLE notifications 
  DROP CONSTRAINT IF EXISTS notifications_recipient_fkey,
  DROP CONSTRAINT IF EXISTS notifications_actor_fkey;

-- Re-add with ON DELETE CASCADE for recipient
-- and ON DELETE SET NULL for actor
ALTER TABLE notifications
  ADD CONSTRAINT notifications_recipient_fkey 
    FOREIGN KEY (recipient) REFERENCES profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT notifications_actor_fkey 
    FOREIGN KEY (actor) REFERENCES profiles(id) ON DELETE SET NULL;

-- Verify the constraints
SELECT 
  tc.constraint_name, 
  tc.table_name, 
  kcu.column_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'notifications' 
  AND tc.constraint_type = 'FOREIGN KEY';
