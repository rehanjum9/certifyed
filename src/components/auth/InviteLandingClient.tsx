"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { performInviteAcceptance, type InviteAcceptanceOutcome } from "@/lib/auth/inviteAcceptance";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";

/** Only for a genuinely bad link: unparseable hash, a token Supabase itself rejected, or the server confirming no invite and no membership exist. Never technical -- no token/Supabase-error detail (see the architecture report on the hash/implicit invite flow, item 5). */
const TOKEN_INVALID_ERROR = "This invitation is invalid or has expired. Ask your workspace administrator for a new invitation.";
/** For a real, already-established session where finishing the workspace join failed for an unrelated reason (network blip, a 5xx, a rate limit) -- session is kept, so "try again" can actually work. */
const JOIN_FAILED_ERROR = "You're signed in, but we couldn't finish joining your workspace. Try again below.";

/**
 * Lands here from Supabase's default "Invite user" email, which uses the
 * OLD implicit OAuth flow: tokens in the URL FRAGMENT
 * (`#access_token=...&refresh_token=...&type=invite`), which a server
 * Route Handler can never see (fragments aren't sent in the HTTP request
 * at all) -- that's why this must be a client page, not a route like
 * /auth/confirm's token_hash flow.
 *
 * Flow: parse the fragment -> scrub it from the visible URL immediately ->
 * hand the tokens to the existing Supabase browser client to establish a
 * real session -> ask the server to finalize the workspace invite (POST
 * /api/auth/accept-invite) -> /set-password. The actual decision tree
 * (what counts as a bad link vs. a recoverable post-session failure) lives
 * in lib/auth/inviteAcceptance.ts, which is unit-tested directly; this
 * component is just the DOM/router glue around it.
 *
 * `inFlightAcceptance` is a MODULE-level (not component-state) variable on
 * purpose. This fixes a real incident: React 18 Strict Mode intentionally
 * mounts every component twice in development (mount, cleanup, remount),
 * running this effect twice back-to-back. The first run scrubs the URL
 * fragment synchronously before doing any async work, so the second run
 * sees an already-empty hash. Without this guard, the second run would
 * independently conclude "no tokens here" while the first run's session
 * establishment + invite acceptance were still in flight in the
 * background -- exactly what was observed: setSession succeeded and
 * organization_invites.accepted_at got written seconds later, while the UI
 * had already (wrongly) shown "invalid or expired" and the user never
 * reached /set-password. Module-level state means every effect
 * invocation -- however many times Strict Mode (or anything else) fires
 * it -- awaits the exact same one real attempt and sees the exact same
 * outcome, instead of racing a second independent one against a URL the
 * first already consumed.
 */
let inFlightAcceptance: Promise<InviteAcceptanceOutcome> | null = null;

export function InviteLandingClient() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabaseClient();

    if (!inFlightAcceptance) {
      const hash = window.location.hash;

      // Scrub the fragment from the visible URL immediately -- before any
      // async work. Tokens must never linger in browser history, be
      // visible during screen-sharing, or leak via a Referer header on the
      // next navigation. Safe to do unconditionally even across repeated
      // effect invocations: performInviteAcceptance treats an
      // already-empty hash as "check for an existing session" rather than
      // an automatic failure.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);

      inFlightAcceptance = performInviteAcceptance(hash, {
        setSession: (tokens) => supabase.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken }),
        hasSession: async () => {
          const { data } = await supabase.auth.getSession();
          return data.session !== null;
        },
        signOut: () => supabase.auth.signOut(),
        acceptInvite: async () => {
          const response = await fetch("/api/auth/accept-invite", { method: "POST" });
          return { ok: response.ok, status: response.status };
        },
      });
    }

    inFlightAcceptance.then((outcome) => {
      if (cancelled) return;

      if (outcome.kind === "success") {
        router.push("/set-password");
        router.refresh();
        return;
      }

      setError(outcome.kind === "invalid" ? TOKEN_INVALID_ERROR : JOIN_FAILED_ERROR);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  if (error === JOIN_FAILED_ERROR) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error">{error}</Alert>
        <Button
          type="button"
          onClick={() => {
            inFlightAcceptance = null;
            setError(null);
            setRetryCount((count) => count + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

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
