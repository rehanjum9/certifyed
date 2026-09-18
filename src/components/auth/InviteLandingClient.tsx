"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { parseInviteHash } from "@/lib/auth/inviteHash";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Never technical -- no token/Supabase-error detail, ever (see the
 * architecture report on the hash/implicit invite flow, item 5).
 */
const GENERIC_INVITE_ERROR = "This invitation is invalid or has expired. Ask your workspace administrator for a new invitation.";

/**
 * Lands here from Supabase's default "Invite user" email, which uses the
 * OLD implicit OAuth flow: tokens in the URL FRAGMENT
 * (`#access_token=...&refresh_token=...&type=invite`), which a server
 * Route Handler can never see (fragments aren't sent in the HTTP request
 * at all) -- that's why this must be a client page, not a route like
 * /auth/confirm's token_hash flow.
 *
 * Flow: parse the fragment -> scrub it from the visible URL immediately ->
 * hand the tokens to the existing Supabase browser client (the same one
 * every other client component uses, see lib/supabase/client.ts) to
 * establish a real session -> ask the server to finalize the CERTIFYED_
 * workspace invite (POST /api/auth/accept-invite, which derives identity
 * from that session -- never from anything this component sends) ->
 * /set-password.
 */
export function InviteLandingClient() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabaseClient();

    async function run() {
      const parsed = parseInviteHash(window.location.hash);

      // Scrub the fragment from the visible URL immediately -- before any
      // async work, and regardless of whether it parsed successfully.
      // Tokens must never linger in browser history, be visible during
      // screen-sharing, or leak via a Referer header on the next
      // navigation.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);

      if (!parsed) {
        if (!cancelled) setError(GENERIC_INVITE_ERROR);
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });

      if (sessionError) {
        if (!cancelled) setError(GENERIC_INVITE_ERROR);
        return;
      }

      let response: Response;
      try {
        response = await fetch("/api/auth/accept-invite", { method: "POST" });
      } catch {
        // A session now exists but nothing confirms it belongs to a real,
        // still-valid workspace invite -- don't leave the visitor
        // half-authenticated with no workspace.
        await supabase.auth.signOut();
        if (!cancelled) setError(GENERIC_INVITE_ERROR);
        return;
      }

      if (!response.ok) {
        await supabase.auth.signOut();
        if (!cancelled) setError(GENERIC_INVITE_ERROR);
        return;
      }

      if (!cancelled) {
        router.push("/set-password");
        router.refresh();
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <Alert variant="error">{error}</Alert>;
  }

  return (
    <div className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500">
      <Spinner className="h-4 w-4" />
      Confirming your invitation&hellip;
    </div>
  );
}
