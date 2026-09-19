import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { guardApiRoute } from "@/lib/auth/apiGuard";
import { finalizeInviteAcceptance } from "@/lib/organizations/invites";
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_MAX_AGE_SECONDS } from "@/lib/organizations/activeWorkspace";
import { RATE_LIMITS } from "@/lib/rateLimit";

/**
 * Finalizes a workspace invite once the browser has already established a
 * real Supabase session from the invite email's tokens (see
 * src/app/auth/invite/page.tsx -- Supabase's default "Invite user" email
 * uses the implicit `#access_token=...&type=invite` flow, which only the
 * browser can read; this route is what that page calls immediately after).
 *
 * The request body is never read for identity -- `guardApiRoute` derives
 * the caller's id/email from the session cookie the browser client already
 * set, the same way every other authenticated route in this app does. No
 * organization id or role is ever accepted from the client: both come
 * exclusively from the matching organization_invites row, resolved
 * server-side by email (see lib/organizations/invites.ts#finalizeInviteAcceptance,
 * which also handles the "already accepted, harmless re-visit" case without
 * duplicating that authorization logic here).
 */
export async function POST() {
  const guard = await guardApiRoute({ rateLimit: { key: "accept-invite", ...RATE_LIMITS.acceptInvite } });
  if ("response" in guard) return guard.response;

  if (!guard.user.email) {
    return NextResponse.json(
      { error: "This invitation is invalid or has expired. Ask your workspace administrator for a new invitation." },
      { status: 400 },
    );
  }

  const result = await finalizeInviteAcceptance(guard.user.id, guard.user.email);

  if (result.status === "no_pending_invite") {
    return NextResponse.json(
      { error: "This invitation is invalid or has expired. Ask your workspace administrator for a new invitation." },
      { status: 404 },
    );
  }

  if (result.status === "accepted") {
    // Best-effort: this cookie is only a hint (pickActiveMembership always
    // re-validates it against the caller's real memberships and falls back
    // to their first membership otherwise -- see
    // lib/organizations/activeWorkspace.ts). A failure here must never turn
    // an already-successful membership grant into an error response and
    // strand the invited user before they've even set a password.
    try {
      const cookieStore = await cookies();
      cookieStore.set(ACTIVE_ORG_COOKIE, result.organizationId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ACTIVE_ORG_COOKIE_MAX_AGE_SECONDS,
        path: "/",
      });
    } catch {
      // swallow -- see comment above
    }
  }

  return NextResponse.json({ status: result.status });
}
