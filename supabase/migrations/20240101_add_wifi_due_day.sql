
-- Add wifi_due_day to tenant_occupancies
ALTER TABLE public.tenant_occupancies ADD COLUMN IF NOT EXISTS wifi_due_day INTEGER;
