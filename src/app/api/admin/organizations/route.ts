import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/organizationGuard";
import { createOrganization, deleteOrganization } from "@/lib/organizations/organizations";
import { createInvite } from "@/lib/organizations/invites";
import { RATE_LIMITS } from "@/lib/rateLimit";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  ownerEmail: z.string().trim().email().max(320),
});

/**
 * Platform-admin-only: creates a new workspace and invites its first
 * owner (architecture report, item 2/9). This is the ONLY route that can
 * create an organization -- there is no self-service "create your own
 * club" flow, matching "controlled invitations only, no public signup."
 * Creating the organization does NOT add the platform admin themselves as
 * a member (the privacy rule: platform admin status never implies silent
 * workspace access) -- if they need in, they go through the same invite
 * path as anyone else.
 */
export async function POST(request: Request) {
  const guard = await requirePlatformAdmin({ rateLimit: { key: "organization-create", ...RATE_LIMITS.organizationCreate } });
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  // Created with NO members -- the platform admin who creates it is never
  // automatically added (see createOrganization's doc comment / the
  // privacy rule, architecture report item 2). The organization becomes
  // usable the moment the invited owner below accepts.
  const organization = await createOrganization({ name: parsed.data.name, createdBy: guard.user.id });

  // See src/app/api/workspace/invites/route.ts for why this points at
  // /auth/invite (Supabase's default invite email's implicit token flow)
  // rather than /auth/confirm, and why deriving it from request.url is
  // correct in both local dev and production.
  const redirectTo = new URL("/auth/invite", request.url).toString();
  const inviteResult = await createInvite(organization.id, parsed.data.ownerEmail, "owner", guard.user.id, redirectTo);

  if (inviteResult.status === "error") {
    // Don't leave an ownerless, 0-member workspace behind just because the
    // owner invite failed -- roll back the organization we just created.
    // Best-effort: if the rollback delete itself fails, the original invite
    // error is still the more useful thing to report than a second error
    // about the rollback -- a platform admin re-checking the workspace list
    // will still notice a stray 0-member org if that happens.
    try {
      await deleteOrganization(organization.id);
    } catch {
      // swallow -- see comment above
    }
    return NextResponse.json(
      { error: `Failed to invite the workspace owner, so the workspace was not created: ${inviteResult.error}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ organization, invite: inviteResult.status }, { status: 201 });
}
