import { NextResponse } from "next/server";
import { requireOrganizationOwner } from "@/lib/auth/organizationGuard";
import { removeOrganizationMember } from "@/lib/organizations/organizations";

/**
 * Workspace-owner-only member removal, scoped to the caller's ACTIVE
 * workspace. Two-role model (owner/member -- see
 * 0011_simplify_workspace_roles.sql): there is no generic role-change
 * endpoint anymore (PATCH was removed entirely along with the "admin"
 * role) -- the only role transition this app supports is ownership
 * transfer (POST /api/workspace/transfer-ownership, owner-only, atomic).
 * The workspace owner can never be removed through this endpoint at all,
 * not even by themselves -- removeOrganizationMember refuses outright
 * (application layer), and the database's own triggers
 * (prevent_last_owner_removal from 0007, plus 0011's deferred
 * exactly-one-owner constraint trigger) guarantee it even against a bug
 * here. A plain member can never reach this route at all
 * (requireOrganizationOwner), so "members cannot remove themselves or
 * anyone else" holds by construction, not by an extra check here.
 */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/workspace/members/[userId]">) {
  const guard = await requireOrganizationOwner();
  if ("response" in guard) return guard.response;

  const { userId } = await params;
  const result = await removeOrganizationMember(guard.organizationId, userId);

  if (!result.ok && result.reason === "not_found") {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }
  if (!result.ok && result.reason === "owner") {
    return NextResponse.json({ error: "The workspace owner cannot be removed. Transfer ownership first." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
