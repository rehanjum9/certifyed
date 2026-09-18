import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganizationAdmin } from "@/lib/auth/organizationGuard";
import { updateOrganizationMemberRole, removeOrganizationMember } from "@/lib/organizations/organizations";

const bodySchema = z.object({ role: z.enum(["owner", "admin", "member"]) });

/**
 * Workspace-admin-only role change, scoped to the caller's ACTIVE
 * workspace. "Cannot end up with zero owners" is enforced by
 * updateOrganizationMemberRole (application layer) AND by the
 * prevent_last_owner_removal trigger (0007_organizations.sql, database
 * layer) -- see the architecture report, item 10. A normal member can
 * never reach this route at all (requireOrganizationAdmin), so "members
 * cannot promote themselves" holds by construction, not by an extra check
 * here.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/workspace/members/[userId]">) {
  const guard = await requireOrganizationAdmin();
  if ("response" in guard) return guard.response;

  const { userId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid role is required." }, { status: 400 });
  }

  const result = await updateOrganizationMemberRole(guard.organizationId, userId, parsed.data.role);

  if (!result.ok && result.reason === "not_found") {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }
  if (!result.ok && result.reason === "last_owner") {
    return NextResponse.json({ error: "A workspace must always have at least one owner." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

/** Workspace-admin-only member removal, scoped to the caller's ACTIVE workspace. Same last-owner protection as PATCH above. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/workspace/members/[userId]">) {
  const guard = await requireOrganizationAdmin();
  if ("response" in guard) return guard.response;

  const { userId } = await params;
  const result = await removeOrganizationMember(guard.organizationId, userId);

  if (!result.ok && result.reason === "not_found") {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }
  if (!result.ok && result.reason === "last_owner") {
    return NextResponse.json({ error: "A workspace must always have at least one owner." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
