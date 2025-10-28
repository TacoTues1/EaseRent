-- EaseRent Supabase schema (basic)
-- Run this in the SQL editor in Supabase or as a migration

-- Profiles table: link to auth.users
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  phone text,
  role text not null default 'tenant', -- 'tenant' or 'landlord' or 'admin'
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Properties: managed by landlords
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  landlord uuid references profiles(id) on delete set null,
  title text not null,
  description text,
  address text,
  city text,
  state text,
  zip text,
  price numeric(12,2) not null,
  currency text default 'USD',
  bedrooms int default 1,
  bathrooms numeric(3,1) default 1,
  area_sqft int,
  available boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Applications: rental applications from tenants
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  tenant uuid references profiles(id) on delete set null,
  message text,
  status text default 'pending', -- pending / accepted / rejected
  submitted_at timestamp with time zone default timezone('utc'::text, now())
);

-- Bookings / appointments
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  tenant uuid references profiles(id) on delete set null,
  landlord uuid references profiles(id) on delete set null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone,
  status text default 'scheduled', -- scheduled / completed / cancelled
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Maintenance / complaints
create table if not exists maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  tenant uuid references profiles(id) on delete set null,
  title text,
  description text,
  status text default 'open', -- open / in_progress / resolved / closed
  priority text default 'normal', -- low / normal / high
  created_at timestamp with time zone default timezone('utc'::text, now()),
  resolved_at timestamp with time zone
);

-- Payments record
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  tenant uuid references profiles(id) on delete set null,
  landlord uuid references profiles(id) on delete set null,
  amount numeric(12,2) not null,
  currency text default 'USD',
  method text, -- e.g., 'stripe', 'bank_transfer', 'cash'
  status text default 'recorded', -- recorded / pending / failed
  paid_at timestamp with time zone default timezone('utc'::text, now())
);

-- Notifications (in-app)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient uuid references profiles(id) on delete cascade,
  actor uuid references profiles(id),
  type text,
  message text,
  data jsonb,
  read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Basic report view examples (materialized or view can be added later)

-- Indexes for common queries
create index if not exists idx_properties_city on properties(city);
create index if not exists idx_properties_available on properties(available);
create index if not exists idx_maintenance_property on maintenance_requests(property_id);

-- End of schema
