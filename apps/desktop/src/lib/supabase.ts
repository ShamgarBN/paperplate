/**
 * Supabase client for the desktop app.
 *
 * The anon key is RLS-restricted by the server and safe to ship in the
 * bundle; the service-role key is never exposed to the client. Auth tokens
 * persist in localStorage so the user stays signed in across launches.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://syoyddsbqsoptpcheuvy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RyHpQRKzMVrN0A4gp-3KTw_HB2Okve7";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
