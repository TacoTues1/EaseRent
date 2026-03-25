-- Login records table for Settings > Security
create table if not exists public.user_login_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  provider text,
  login_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_user_login_records_user_id_login_at
  on public.user_login_records (user_id, login_at desc);

grant select, insert on table public.user_login_records to authenticated;

alter table public.user_login_records enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_login_records'
      and policyname = 'Users can view own login records'
  ) then
    create policy "Users can view own login records"
      on public.user_login_records
      for select
      using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_login_records'
      and policyname = 'Users can insert own login records'
  ) then
    create policy "Users can insert own login records"
      on public.user_login_records
      for insert
      with check (auth.uid() = user_id);
  end if;
end
$$;
