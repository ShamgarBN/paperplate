-- Utility function for the one-time SQLite importer. After inserting rows with
-- preserved IDs, the identity sequences need to be advanced past MAX(id) so
-- that any subsequent autonomous INSERT (from the app) doesn't collide.
--
-- Safe to call any time — idempotent and read-only outside of setval.
-- Restricted to authenticated + service_role; we don't need anonymous callers.

create or replace function public.reset_id_sequences()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  rec record;
  next_val bigint;
begin
  for rec in
    select c.table_name, c.column_name, pg_get_serial_sequence(c.table_schema || '.' || c.table_name, c.column_name) as seq
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.is_identity = 'YES'
  loop
    if rec.seq is null then
      continue;
    end if;
    execute format('select coalesce(max(%I), 0) + 1 from public.%I', rec.column_name, rec.table_name) into next_val;
    perform setval(rec.seq, next_val, false);
  end loop;
end;
$$;

revoke all on function public.reset_id_sequences() from public;
grant execute on function public.reset_id_sequences() to authenticated, service_role;
