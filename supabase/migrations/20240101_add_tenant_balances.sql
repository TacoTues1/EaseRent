
-- Create a table to store tenant balances/credits
create table if not exists public.tenant_balances (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references public.profiles(id) not null,
  amount numeric default 0,
  last_updated timestamp with time zone default timezone('utc'::text, now()),
  unique(tenant_id)
);

-- Enable RLS
alter table public.tenant_balances enable row level security;

-- Policies
create policy "Tenants can view their own balance"
  on public.tenant_balances for select
  using (auth.uid() = tenant_id);

create policy "Landlords can view balances of their tenants"
  on public.tenant_balances for select
  using (
    exists (
      select 1 from public.tenant_occupancies
      where tenant_occupancies.tenant_id = tenant_balances.tenant_id
      and tenant_occupancies.landlord_id = auth.uid()
    )
  );

-- Only service role (backend) should modify balances for security
-- But if we want landlords to manually adjust?
create policy "Service role can all"
  on public.tenant_balances using (true) with check (true);
