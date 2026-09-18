/**
 * Parses the URL fragment Supabase's default "Invite user" email produces:
 * an implicit-flow hash like
 * `#access_token=...&refresh_token=...&type=invite&expires_in=3600&token_type=bearer`.
 *
 * Pure and DOM-free on purpose (no `window` reference) so it's directly
 * unit-testable -- the only caller with real browser access is
 * components/auth/InviteLandingClient.tsx, which passes it
 * `window.location.hash` verbatim.
 *
 * Deliberately strict: requires `type=invite` exactly (this page is
 * invite-only, never a generic magic-link/recovery landing spot) and both
 * tokens present. Any other shape -- missing type, wrong type, either
 * token absent, empty/malformed fragment -- returns null rather than
 * partially accepting it. The caller treats null as "show the generic
 * invalid/expired message," never as a reason to guess.
 */
export interface ParsedInviteHash {
  accessToken: string;
  refreshToken: string;
}

export function parseInviteHash(hash: string): ParsedInviteHash | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;

  const params = new URLSearchParams(raw);
  if (params.get("type") !== "invite") return null;

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken };
}
