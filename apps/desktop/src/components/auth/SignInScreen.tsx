import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { toast } from "sonner";

export function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    }
  }

  const canSubmit = email.length > 0 && password.length > 0 && !submitting;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg)]">
      <form
        onSubmit={signIn}
        className="w-[420px] max-w-[92vw] rounded-2xl bg-[var(--card)] p-8 shadow-lg"
      >
        <h1 className="mb-1 font-serif text-3xl text-[var(--fg)]">Paperplate</h1>
        <p className="mb-6 text-sm text-[var(--muted-fg)]">
          Sign in to your shared household account.
        </p>

        <div className="mb-4">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
        </div>

        <div className="mb-6">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <Button
          type="submit"
          disabled={!canSubmit}
          className="w-full"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
