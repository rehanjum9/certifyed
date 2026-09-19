import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/organizationGuard";
import { deleteOrganizationSafely } from "@/lib/organizations/organizations";
import { RATE_LIMITS } from "@/lib/rateLimit";

const paramsSchema = z.object({ organizationId: z.string().uuid() });

/**
 * Platform-admin-only workspace deletion (see /admin/organizations item 6
 * of the architecture report: cleaning up OLD orphan/failed-invite test
 * workspaces, now that /api/admin/organizations itself rolls back new
 * ones automatically). Blocks outright if the organization owns any
 * templates, campaigns, or custom fonts -- see
 * deleteOrganizationSafely's own doc comment for exactly what does and
 * doesn't cascade. Never deletes a Supabase Auth user; the invited/member
 * email remains usable for a future workspace either way.
 */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/admin/organizations/[organizationId]">) {
  const guard = await requirePlatformAdmin({ rateLimit: { key: "organization-delete", ...RATE_LIMITS.organizationDelete } });
  if ("response" in guard) return guard.response;

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid workspace id." }, { status: 400 });
  }

  const result = await deleteOrganizationSafely(parsedParams.data.organizationId);

  if (!result.ok && result.reason === "not_found") {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  if (!result.ok && result.reason === "has_resources") {
    return NextResponse.json(
      {
        error: "This workspace contains templates, campaigns, or custom fonts and cannot be deleted from this screen.",
        counts: result.counts,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
