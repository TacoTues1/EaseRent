-- ============================================
-- Add QR Code and Bill Receipt Fields to Payment System
-- ============================================
-- Run this in Supabase SQL Editor

-- Add new columns to payment_requests table
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS qr_code_url TEXT,
  ADD COLUMN IF NOT EXISTS bill_receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS tenant_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS tenant_reference_number TEXT;

-- Comments for the new columns
COMMENT ON COLUMN payment_requests.qr_code_url IS 'URL to QR code image uploaded by landlord for payment';
COMMENT ON COLUMN payment_requests.bill_receipt_url IS 'URL to bill receipt/screenshot uploaded by landlord as proof of actual bills';
COMMENT ON COLUMN payment_requests.tenant_proof_url IS 'URL to payment proof (screenshot) uploaded by tenant after scanning QR';
COMMENT ON COLUMN payment_requests.tenant_reference_number IS 'Reference number entered by tenant after making payment via QR';

-- Create storage bucket for payment files if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-files', 'payment-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for payment-files bucket
-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload payment files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-files');

-- Allow authenticated users to view payment files
CREATE POLICY "Anyone can view payment files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'payment-files');

-- Allow users to update their own uploads
CREATE POLICY "Users can update own payment files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'payment-files');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own payment files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'payment-files');
