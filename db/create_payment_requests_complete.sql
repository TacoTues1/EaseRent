-- Ensure function exists first
CREATE OR REPLACE FUNCTION update_payment_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create table
create table if not exists public.payment_requests (
  id uuid not null default gen_random_uuid (),
  landlord uuid not null,
  tenant uuid not null,
  property_id uuid null,
  application_id uuid null,
  rent_amount numeric(12, 2) not null default 0,
  water_bill numeric(12, 2) null default 0,
  electrical_bill numeric(12, 2) null default 0,
  other_bills numeric(12, 2) null default 0,
  bills_description text null,
  due_date timestamp with time zone null,
  status text null default 'pending'::text,
  paid_at timestamp with time zone null,
  payment_method text null,
  payment_id uuid null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone null default timezone ('utc'::text, now()),
  qr_code_url text null,
  bill_receipt_url text null,
  tenant_proof_url text null,
  tenant_reference_number text null,
  water_due_date date null,
  electrical_due_date date null,
  wifi_due_date date null,
  wifi_bill numeric null,
  other_due_date date null,
  occupancy_id uuid null,
  security_deposit_amount numeric(12, 2) null default 0,
  advance_amount numeric(12, 2) null default 0,
  is_first_payment boolean null default false,
  is_renewal_payment boolean null default false,
  is_move_in_payment boolean null default false,
  amount_paid numeric(12, 2) null default 0,
  is_advance_payment boolean null default false,
  constraint payment_requests_pkey primary key (id),
  constraint payment_requests_landlord_fkey foreign KEY (landlord) references profiles (id) on delete CASCADE,
  constraint payment_requests_occupancy_id_fkey foreign KEY (occupancy_id) references tenant_occupancies (id) on delete CASCADE,
  constraint payment_requests_application_id_fkey foreign KEY (application_id) references applications (id) on delete set null,
  constraint payment_requests_property_id_fkey foreign KEY (property_id) references properties (id) on delete CASCADE,
  constraint payment_requests_tenant_fkey foreign KEY (tenant) references profiles (id) on delete CASCADE,
  constraint payment_requests_payment_id_fkey foreign KEY (payment_id) references payments (id) on delete set null
) TABLESPACE pg_default;

-- Create indexes
create index IF not exists idx_payment_requests_tenant on public.payment_requests using btree (tenant) TABLESPACE pg_default;
create index IF not exists idx_payment_requests_landlord on public.payment_requests using btree (landlord) TABLESPACE pg_default;
create index IF not exists idx_payment_requests_status on public.payment_requests using btree (status) TABLESPACE pg_default;
create index IF not exists idx_payment_requests_due_date on public.payment_requests using btree (due_date) TABLESPACE pg_default;
create index IF not exists idx_payment_requests_occupancy on public.payment_requests using btree (occupancy_id) TABLESPACE pg_default;

-- Create trigger
DROP TRIGGER IF EXISTS update_payment_requests_updated_at ON payment_requests;
create trigger update_payment_requests_updated_at BEFORE
update on payment_requests for EACH row
execute FUNCTION update_payment_requests_updated_at ();
