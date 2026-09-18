import type { Membership } from "./types";

/**
 * HttpOnly, server-only cookie holding which workspace the browser last
 * selected. Never trusted on its own -- see pickActiveMembership, which
 * always re-validates it against the caller's real memberships before it's
 * allowed to become the active organization for a request. A stale/forged/
 * arbitrary value here can therefore never grant access to a workspace the
 * user doesn't actually belong to; at worst it's ignored and the deterministic
 * fallback (first membership) is used instead.
 */
export const ACTIVE_ORG_COOKIE = "active_org_id";
export const ACTIVE_ORG_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Pure selection logic, split out from any cookie/DB I/O so it's directly
 * unit-testable: given the user's real memberships and whatever the cookie
 * currently says, decides which one is "active" for this request.
 *
 * - Zero memberships: null (caller must show "no workspace" rather than
 *   ever fabricate one).
 * - Cookie names a real membership: use it.
 * - Cookie missing, or names a workspace the user is no longer a member of
 *   (left, removed, cookie forged/stale): fall back to the first membership
 *   (oldest-joined, per listMembershipsForUser's ordering) -- deterministic,
 *   and never silently grants the forged organization id itself.
 */
export function pickActiveMembership(memberships: Membership[], cookieOrgId: string | null): Membership | null {
  if (memberships.length === 0) return null;
  if (cookieOrgId) {
    const match = memberships.find((m) => m.organizationId === cookieOrgId);
    if (match) return match;
  }
  return memberships[0];
}
