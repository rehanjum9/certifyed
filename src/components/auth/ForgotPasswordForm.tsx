"use client";

import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { requestPasswordReset } from "@/lib/auth/forgotPassword";
import { Card, CardContent } from "@/components/ui/Card";
import { Label, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";

/** Always the same message regardless of outcome -- see lib/auth/forgotPassword.ts#requestPasswordReset for why this must never reveal whether an account exists for the entered email. */
const GENERIC_SUCCESS_MESSAGE = "If an account exists for that email, a password reset link has been sent.";

/**
 * Public /forgot-password form. Never authenticates or creates a session --
 * it only ever asks Supabase to email a recovery link (if a matching
 * account exists), which lands the recipient on /auth/confirm
 * (type=recovery), then /set-password. The redirect target is built from
 * this browser's own origin (window.location.origin), never a
 * hardcoded host, so this is correct in local dev and in production alike.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");

    const supabase = createBrowserSupabaseClient();
    await requestPasswordReset(email, window.location.origin, {
      resetPasswordForEmail: (address, options) => supabase.auth.resetPasswordForEmail(address, options),
    });

    // Always the same success state -- see requestPasswordReset's own doc
    // comment; there is no error state for this form to show at all.
    setStatus("done");
  }

  if (status === "done") {
    return <Alert variant="success">{GENERIC_SUCCESS_MESSAGE}</Alert>;
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forgot-password-email">Email</Label>
            <Input
              id="forgot-password-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={status === "loading"}>
            {status === "loading" && <Spinner className="h-4 w-4" />}
            Send reset link
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
