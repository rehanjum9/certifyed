import { parseInviteHash } from "./inviteHash";

/**
 * What InviteLandingClient should do once performInviteAcceptance resolves.
 * Deliberately three states, not two -- collapsing "recoverable_error" into
 * "invalid" is exactly the bug this type exists to prevent (see the
 * doc comment below): a transient failure AFTER a real session already
 * exists must never be presented -- or acted on -- the same way as a
 * genuinely bad invite link.
 *
 * - "invalid": the link/token itself is the problem (unparseable hash, a
 *   session Supabase itself rejected, or the server confirming there is no
 *   pending invite AND no existing membership). Safe to sign the browser
 *   back out here -- there was nothing worth keeping.
 * - "recoverable_error": a real session exists, but finishing the
 *   workspace-join step failed (network blip, 5xx, rate limit). The session
 *   must be left alone -- signing out would strand the user, since the
 *   invite's tokens are typically only good for one successful setSession.
 * - "success": proceed to /set-password.
 */
export type InviteAcceptanceOutcome = { kind: "invalid" } | { kind: "recoverable_error" } | { kind: "success" };

export interface InviteAcceptanceDeps {
  setSession(tokens: { accessToken: string; refreshToken: string }): Promise<{ error: { message: string } | null }>;
  /** Whether a Supabase session already exists in this browser -- used only when the hash carries no tokens at all, to distinguish a genuinely bad link from a harmless re-run against an already-consumed URL (see the module doc comment on InviteLandingClient's dedup wrapper). */
  hasSession(): Promise<boolean>;
  signOut(): Promise<unknown>;
  acceptInvite(): Promise<{ ok: boolean; status: number }>;
}

/**
 * The full invite-acceptance decision tree, pulled out of
 * InviteLandingClient so it's directly unit-testable without mounting a
 * React component or simulating browser effect timing (this codebase's
 * established pattern -- see inviteHash.ts). Pure aside from the injected
 * deps; no DOM, no router.
 *
 * IMPORTANT: this function assumes it is being called with the invite
 * hash's tokens *at most once* per real page load. InviteLandingClient is
 * responsible for that guarantee (a module-level in-flight/completed
 * promise, so React 18 Strict Mode's intentional double effect invocation
 * in development re-uses the same outcome rather than racing a second,
 * independent run against a URL whose hash the first run already scrubbed
 * -- see that file for the full incident writeup). This function does not
 * defend against being called twice with the same real tokens itself.
 */
export async function performInviteAcceptance(hash: string, deps: InviteAcceptanceDeps): Promise<InviteAcceptanceOutcome> {
  const parsed = parseInviteHash(hash);

  if (!parsed) {
    // No tokens in this URL. Could be a genuinely invalid/expired/forged
    // link -- or a real session already exists in this browser (e.g. the
    // user revisits /auth/invite directly after already completing
    // acceptance once). Only the latter is worth finishing.
    const hasSession = await deps.hasSession();
    if (!hasSession) return { kind: "invalid" };
    return finalize(deps);
  }

  const { error: sessionError } = await deps.setSession({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken });
  if (sessionError) return { kind: "invalid" };

  return finalize(deps);
}

async function finalize(deps: InviteAcceptanceDeps): Promise<InviteAcceptanceOutcome> {
  let response: { ok: boolean; status: number };
  try {
    response = await deps.acceptInvite();
  } catch {
    // Network-level failure calling our own API -- the session Supabase
    // just gave us is still perfectly valid. Do not sign out.
    return { kind: "recoverable_error" };
  }

  if (response.status === 404) {
    // The server itself confirms: no pending invite for this email, AND no
    // existing membership at all -- a genuinely invalid/forged/expired
    // attempt, not a transient failure. Safe (and correct) to sign out.
    await deps.signOut();
    return { kind: "invalid" };
  }

  if (!response.ok) {
    // Some other server-side hiccup (5xx, a rate limit) after a real
    // session was already established -- recoverable, session stays.
    return { kind: "recoverable_error" };
  }

  return { kind: "success" };
}
