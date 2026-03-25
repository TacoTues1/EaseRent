-- Stores login history per user for Settings > Security
create table if not exists public.user_login_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  provider text,
  login_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_user_login_records_user_id_login_at
  on public.user_login_records (user_id, login_at desc);

alter table public.user_login_records enable row level security;

-- Users can view only their own login records.
create policy if not exists "Users can view own login records"
  on public.user_login_records
  for select
  using (auth.uid() = user_id);

-- Users can insert their own login records.
create policy if not exists "Users can insert own login records"
  on public.user_login_records
  for insert
  with check (auth.uid() = user_id);
