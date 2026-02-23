-- ============================================
-- ADD LANDLORD REGISTRATION FIELDS
-- ============================================
-- Adds business_name and accepted_payments to profiles
-- for landlord registration support
-- ============================================

-- Add business_name column (used only by landlords)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS business_name TEXT;

-- Add accepted_payments column (jsonb array storing payment methods + verification details)
-- Example value: { "cash": true, "gcash": { "number": "+639...", "verified": true }, "maya": { "number": "+639...", "verified": true } }
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS accepted_payments JSONB DEFAULT '{}'::jsonb;

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('business_name', 'accepted_payments');
