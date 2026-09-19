"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { performSetPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/setPassword";
import { Card, CardContent } from "@/components/ui/Card";
import { Label, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";

/**
 * The final step of accepting a workspace invite: the user already has a
 * real, verified session at this point (established by
 * InviteLandingClient, or the legacy /auth/confirm route) -- the actual
 * decision logic lives in lib/auth/setPassword.ts (unit-tested directly);
 * this component is just the form/router glue around it. Redirects
 * straight to /dashboard on success -- no separate login step, since the
 * session set here already is the account's real session going forward.
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
    setStatus("loading");

    const supabase = createBrowserSupabaseClient();
    const outcome = await performSetPassword(password, confirmPassword, {
      updateUser: (newPassword) => supabase.auth.updateUser({ password: newPassword }),
    });

    if (outcome.kind !== "success") {
      setStatus("error");
      setError(outcome.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
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
