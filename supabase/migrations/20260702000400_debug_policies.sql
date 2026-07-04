-- Temp: dump policies for heartbeats so we can see what's actually
-- installed.

create or replace function public.debug_hb_policies()
returns table(
  policyname text,
  roles text[],
  cmd text,
  qual text,
  with_check text
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    p.policyname::text,
    p.roles::text[],
    p.cmd::text,
    p.qual::text,
    p.with_check::text
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'heartbeats';
$$;

grant execute on function public.debug_hb_policies() to public;
