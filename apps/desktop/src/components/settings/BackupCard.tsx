import { useState } from "react";
import { LogOut, Cloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { supabase } from "@/lib/supabase";

/**
 * Account + data card. The old "Export/Import .sqlite" flow no longer
 * applies — the canonical store lives in Supabase and is backed up by the
 * hosted service. We surface that here, plus a sign-out button so the
 * single shared household account can be rotated.
 */
export function BackupCard() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setSigningOut(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          Data & account
        </CardTitle>
        <CardDescription>
          Your library, plans, and shopping list live in Supabase and sync
          across this Mac and any iPad signed in to the same household
          account. Backups are handled by Supabase; there's no local
          database to export.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </CardContent>
    </Card>
  );
}
