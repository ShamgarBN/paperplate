import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

// Pulled from app.json's expo.extra block. Both values are safe to ship to
// clients — the anon key is RLS-restricted by Supabase.
const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

if (!extra.supabaseUrl || !extra.supabaseAnonKey) {
  throw new Error(
    "Missing supabaseUrl/supabaseAnonKey in app.json expo.extra block",
  );
}

export const supabase = createClient(extra.supabaseUrl, extra.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
