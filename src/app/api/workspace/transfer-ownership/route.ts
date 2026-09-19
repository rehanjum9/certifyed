import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganizationOwner } from "@/lib/auth/organizationGuard";
import { transferOrganizationOwnership } from "@/lib/organizations/organizations";
import { RATE_LIMITS } from "@/lib/rateLimit";

const bodySchema = z.object({ newOwnerUserId: z.string().uuid() });

/**
 * Workspace-owner-only: the sole supported way to change who owns a
 * workspace (see Settings -> Workspace -> "Transfer ownership"). Only the
 * CURRENT owner may initiate this -- requireOrganizationOwner already
 * guarantees the caller is the active workspace's owner; the current
 * owner's id passed to transferOrganizationOwnership always comes from
 * that authenticated identity, never from the request body. Platform
 * admin status alone grants nothing here: a platform admin who is not
 * actually this workspace's owner (the ordinary case -- see the privacy
 * rule, architecture report item 2) gets the exact same 403 a plain
 * member would.
 *
 * Atomic: delegates to transferOrganizationOwnership, which runs both the
 * promote and demote steps inside a single database transaction (a
 * Postgres RPC function, 0011_simplify_workspace_roles.sql) -- the
 * workspace never observably has zero or two owners.
 */
export async function POST(request: Request) {
  const guard = await requireOrganizationOwner({ rateLimit: { key: "transfer-ownership", ...RATE_LIMITS.transferOwnership } });
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid member id is required." }, { status: 400 });
  }

  const result = await transferOrganizationOwnership(guard.organizationId, guard.user.id, parsed.data.newOwnerUserId);

  if (!result.ok && result.reason === "same_user") {
    return NextResponse.json({ error: "You are already the workspace owner." }, { status: 400 });
  }
  if (!result.ok && result.reason === "new_owner_not_found") {
    return NextResponse.json({ error: "That person is not a member of this workspace." }, { status: 404 });
  }
  if (!result.ok && result.reason === "current_owner_mismatch") {
    // Defense in depth only -- requireOrganizationOwner already guarantees
    // this above; this branch exists in case that ever changes underneath
    // this route without this check being updated too.
    return NextResponse.json({ error: "Only the current workspace owner can transfer ownership." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
