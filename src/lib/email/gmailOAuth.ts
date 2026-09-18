import { randomBytes, createHash } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Per-workspace Gmail OAuth CSRF/binding state (architecture report, item
 * 16). Replaces the previous HttpOnly-cookie-only CSRF token with a
 * short-lived, single-use, DATABASE-backed state record: the callback must
 * find this exact row (by the SHA-256 hash of the state token -- the raw
 * token itself is never stored), confirm it belongs to the requesting
 * user, hasn't expired, and hasn't already been consumed, before it's
 * allowed to attach a Gmail account to an organization. This also removes
 * any dependency on the cookie surviving the cross-site redirect through
 * Google's consent screen.
 */
export const GMAIL_OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function hashStateToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Starts a new OAuth flow: generates a random, unguessable token, stores
 * only its hash (bound to `organizationId` + `userId` + an expiry), and
 * returns the raw token to embed as the `state` query param sent to
 * Google. Nothing about which organization/user this state belongs to is
 * ever exposed to the client beyond the opaque token itself.
 */
export async function createOAuthState(organizationId: string, userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from("gmail_oauth_states").insert({
    state_token_hash: hashStateToken(token),
    organization_id: organizationId,
    user_id: userId,
    expires_at: new Date(Date.now() + GMAIL_OAUTH_STATE_TTL_MS).toISOString(),
  });

  if (error) throw new Error(`Failed to start the Gmail connection. Please try again.`);
  return token;
}

export type ConsumeOAuthStateResult =
  | { ok: true; organizationId: string }
  | { ok: false; reason: "not_found" | "expired" | "already_consumed" | "wrong_user" };

/**
 * Validates and single-use-consumes a state token from the OAuth callback.
 * The consuming UPDATE is conditioned on `consumed_at is null` and its
 * result re-checked (the same conditional-UPDATE claim pattern already
 * used for job/row claiming in lib/campaigns/generation.ts) so two
 * concurrent callbacks for the same token can never both succeed -- the
 * loser always sees "already_consumed", never a race that silently
 * connects the wrong organization or double-spends the same code.
 *
 * `requestingUserId` must be the currently authenticated caller (not
 * anything from the request body/query) -- a state token minted for one
 * user can never be completed by a different session, even if the token
 * value itself somehow leaked.
 */
export async function consumeOAuthState(token: string, requestingUserId: string): Promise<ConsumeOAuthStateResult> {
  const supabase = createServiceRoleClient();
  const hash = hashStateToken(token);

  const { data: row, error } = await supabase
    .from("gmail_oauth_states")
    .select("*")
    .eq("state_token_hash", hash)
    .maybeSingle();

  if (error) throw new Error(`Failed to verify the Gmail connection request: ${error.message}`);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumed_at) return { ok: false, reason: "already_consumed" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.user_id !== requestingUserId) return { ok: false, reason: "wrong_user" };

  const { data: claimed, error: claimError } = await supabase
    .from("gmail_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id");

  if (claimError) throw new Error(`Failed to verify the Gmail connection request: ${claimError.message}`);
  if (!claimed || claimed.length === 0) {
    // Someone else (a duplicate/racing callback request) claimed it first.
    return { ok: false, reason: "already_consumed" };
  }

  return { ok: true, organizationId: row.organization_id };
}
