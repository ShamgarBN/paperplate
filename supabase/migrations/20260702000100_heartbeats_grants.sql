-- The initial heartbeats migration set the RLS policy but not the
-- underlying table grants, so anon INSERT still hit
-- "row violates row-level security policy" (which in Postgres also fires
-- when the role lacks the INSERT privilege on the table itself). Grant
-- the specific operations each role needs — nothing more.

grant insert on public.heartbeats to anon;
-- The identity sequence needs a USAGE grant too, otherwise INSERT with
-- an auto-generated id fails with "permission denied for sequence".
grant usage, select on all sequences in schema public to anon;

grant select on public.heartbeats to authenticated;
