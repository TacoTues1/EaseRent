-- Clean up trailing whitespace from existing messages
-- Run this once to fix all existing messages in the database

UPDATE messages
SET message = TRIM(message)
WHERE message IS NOT NULL
  AND message != TRIM(message);

-- Verify the cleanup
SELECT COUNT(*) as cleaned_messages
FROM messages
WHERE message IS NOT NULL
  AND message != TRIM(message);
