alter table if exists public.properties
  add column if not exists country text,
  add column if not exists state_province text;

alter table if exists public.properties
  alter column country set default 'Philippines';

update public.properties
set country = 'Philippines'
where country is null or btrim(country) = '';
