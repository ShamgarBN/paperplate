/**
 * Wrap the entire app. If there's no Supabase session, show the sign-in
 * screen instead of the router. When a session arrives (or vanishes),
 * the gate flips between the two without remounting the router config.
 */
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { SignInScreen } from "@/components/auth/SignInScreen";

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBootstrapped(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!bootstrapped) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)]">
        <div className="text-[var(--muted-fg)]">Loading…</div>
      </div>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  return <>{children}</>;
}
