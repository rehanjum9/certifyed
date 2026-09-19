"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/Card";
import { Label, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setStatus("error");
        setError("Invalid email or password.");
        return;
      }

      // Only ever a same-origin path, never an absolute/protocol-relative
      // URL an attacker could set via a crafted /login?redirectTo=... link
      // -- defense in depth (Next.js's client-side router.push can't
      // actually navigate cross-origin regardless, since it's built on
      // history.pushState, but this keeps the value honest either way).
      // Backslashes are rejected too: some URL parsers normalize a leading
      // "/\" into "//", which browsers then treat as protocol-relative.
      const requestedRedirect = searchParams.get("redirectTo");
      const isSafeRedirect =
        !!requestedRedirect &&
        requestedRedirect.startsWith("/") &&
        !requestedRedirect.startsWith("//") &&
        !requestedRedirect.includes("\\");
      const redirectTo = isSafeRedirect ? requestedRedirect : "/dashboard";
      router.push(redirectTo);
      router.refresh();
    } catch {
      setStatus("error");
      setError("Failed to log in. Check your connection and try again.");
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <Button type="submit" disabled={status === "loading"}>
            {status === "loading" && <Spinner className="h-4 w-4" />}
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
