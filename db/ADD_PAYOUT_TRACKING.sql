-- ============================================
-- ADD PAYOUT TRACKING TABLE
-- ============================================
-- Tracks payouts from system to landlords
-- and platform revenue (1% fee)
-- ============================================

CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid REFERENCES public.payment_requests(id),
  payment_id uuid REFERENCES public.payments(id),
  landlord_id uuid REFERENCES public.profiles(id),
  tenant_id uuid REFERENCES public.profiles(id),
  
  -- Amounts
  total_amount numeric(12,2) NOT NULL,          -- Total tenant paid
  platform_fee numeric(12,2) NOT NULL DEFAULT 0, -- 1% system revenue
  payout_amount numeric(12,2) NOT NULL,          -- 99% sent to landlord
  
  -- Landlord payout details
  payout_method text,           -- 'gcash' or 'maya' (what tenant used)
  payout_destination text,      -- Landlord's GCash/Maya number
  
  -- Status tracking
  status text DEFAULT 'pending', -- pending, processing, completed, failed
  paymongo_payout_id text,       -- PayMongo payout reference
  error_message text,
  
  -- Timestamps
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  completed_at timestamp with time zone
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_payouts_landlord ON public.payouts(landlord_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_payment_request ON public.payouts(payment_request_id);

COMMENT ON TABLE public.payouts IS 'Tracks system-to-landlord payouts. System keeps 1% fee, sends 99% to landlord via their GCash/Maya.';
