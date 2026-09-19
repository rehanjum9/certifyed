import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/organizationGuard";
import { resendPendingInvite, cancelPendingInvite } from "@/lib/organizations/invites";
import { RATE_LIMITS } from "@/lib/rateLimit";

const paramsSchema = z.object({ organizationId: z.string().uuid() });

/**
 * Platform-admin pending-invite management for a specific organization
 * (see /admin/organizations). Scoped to "this organization's current
 * invite" -- resendPendingInvite/cancelPendingInvite resolve which row
 * that is server-side (the latest one for the org), so the client never
 * needs to know or send an invite id.
 */

/** Resend: re-sends the same Supabase Auth invite email and extends the existing organization_invites row's expiry -- never inserts a second active row for the same organization (see resendPendingInvite). Refuses (409) if the invite was already accepted. */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/organizations/[organizationId]/invite">) {
  const guard = await requirePlatformAdmin({ rateLimit: { key: "organization-invite-resend", ...RATE_LIMITS.organizationInviteResend } });
  if ("response" in guard) return guard.response;

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid workspace id." }, { status: 400 });
  }

  // See src/app/api/admin/organizations/route.ts / workspace/invites/route.ts
  // for why this points at /auth/invite (Supabase's default invite email's
  // implicit token flow) and why deriving it from request.url is correct in
  // both local dev and production.
  const redirectTo = new URL("/auth/invite", request.url).toString();
  const result = await resendPendingInvite(parsedParams.data.organizationId, redirectTo);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "No invitation found for this workspace." }, { status: 404 });
  }
  if (result.status === "already_accepted") {
    return NextResponse.json({ error: "This invitation has already been accepted." }, { status: 409 });
  }
  if (result.status === "error") {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ status: "resent" });
}

/** Cancel: deletes only the pending organization_invites row -- never touches Supabase Auth, never removes an existing membership. Refuses (409) if the invite was already accepted -- that's real membership history, not something to withdraw. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/admin/organizations/[organizationId]/invite">) {
  const guard = await requirePlatformAdmin({ rateLimit: { key: "organization-invite-cancel", ...RATE_LIMITS.organizationInviteCancel } });
  if ("response" in guard) return guard.response;

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid workspace id." }, { status: 400 });
  }

  const result = await cancelPendingInvite(parsedParams.data.organizationId);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "No invitation found for this workspace." }, { status: 404 });
  }
  if (result.status === "already_accepted") {
    return NextResponse.json({ error: "This invitation has already been accepted and cannot be cancelled." }, { status: 409 });
  }

  return NextResponse.json({ status: "cancelled" });
}
