"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/Card";
import { Label, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";

const MIN_PASSWORD_LENGTH = 8;

/**
 * The final step of accepting a workspace invite (see
 * src/app/auth/confirm/route.ts): the user already has a real, verified
 * session at this point (that route set the session cookie before
 * redirecting here) -- this form only ever calls
 * supabase.auth.updateUser({ password }), never signUp/signIn, so it can
 * never itself create a new account. That's the only account-creation
 * path this app has, and it's gated entirely by a Supabase Auth invite.
 */
export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus("error");
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setStatus("error");
      setError("Passwords do not match.");
      return;
    }

    setStatus("loading");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setStatus("error");
        setError(updateError.message || "Failed to set your password. The invite link may have expired -- ask for a new one.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setStatus("error");
      setError("Failed to set your password. Check your connection and try again.");
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-password">New password</Label>
            <Input
              id="set-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-password-confirm">Confirm password</Label>
            <Input
              id="set-password-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <Button type="submit" disabled={status === "loading"}>
            {status === "loading" && <Spinner className="h-4 w-4" />}
            Set password &amp; continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
