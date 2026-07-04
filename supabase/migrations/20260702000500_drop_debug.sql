-- Clean up debug helpers used to diagnose the heartbeat RLS setup.

drop function if exists public.whoami();
drop function if exists public.debug_hb_policies();
