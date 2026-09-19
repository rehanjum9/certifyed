"use client";

import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { performSetPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/setPassword";
import { Label, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Lets ANY authenticated workspace user -- owner or member alike -- change
 * their own password. Deliberately not gated by role: this reuses the same
 * validation + supabase.auth.updateUser({password}) call as
 * SetPasswordForm (see lib/auth/setPassword.ts), which always acts on the
 * CALLER's own session -- there is no user-id input anywhere in this flow,
 * so there is no way for this to be pointed at anyone else's account, and
 * no reason to restrict it to owners.
 */
export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);

    const supabase = createBrowserSupabaseClient();
    const outcome = await performSetPassword(password, confirmPassword, {
      updateUser: (newPassword) => supabase.auth.updateUser({ password: newPassword }),
    });

    if (outcome.kind !== "success") {
      setStatus("error");
      setMessage(outcome.message);
      return;
    }

    setStatus("success");
    setMessage("Password updated.");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="change-password-new">New password</Label>
        <Input
          id="change-password-new"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="change-password-confirm">Confirm new password</Label>
        <Input
          id="change-password-confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      {message && <Alert variant={status === "error" ? "error" : "success"}>{message}</Alert>}
      <Button type="submit" disabled={status === "loading"} className="self-start">
        {status === "loading" && <Spinner className="h-4 w-4" />}
        Change password
      </Button>
    </form>
  );
}
