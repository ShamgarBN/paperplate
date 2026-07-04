-- Temporary debug helper. Returns the caller's Postgres role and the
-- JWT-derived role via auth.role() so we can see what the publishable
-- key actually resolves to. Drop this in the follow-up migration once
-- the heartbeat is confirmed working.

create or replace function public.whoami()
returns table(pg_role text, jwt_role text, sess text)
language sql
security invoker
set search_path = public
as $$
  select current_role::text, coalesce(auth.role(), 'null'), session_user::text;
$$;

grant execute on function public.whoami() to public, anon, authenticated;
