-- The `to anon` policy target didn't match our publishable key's
-- resolved role in RLS evaluation (the new sb_publishable_... key
-- format doesn't decode to the classic anon JWT). Widen the policy to
-- `to public` so any caller with a valid API key can INSERT, and rely
-- entirely on the source='github-heartbeat' check to keep spam out.
-- Reads stay locked down to authenticated.

drop policy if exists heartbeats_anon_insert on public.heartbeats;

create policy heartbeats_public_insert
  on public.heartbeats
  for insert
  to public
  with check (source = 'github-heartbeat');

grant insert on public.heartbeats to public;
