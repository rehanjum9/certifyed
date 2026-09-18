import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganizationAdmin } from "@/lib/auth/organizationGuard";
import { createInvite } from "@/lib/organizations/invites";
import { RATE_LIMITS } from "@/lib/rateLimit";

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["owner", "admin", "member"]),
});

/**
 * Workspace-admin-only: invites a new member into the caller's ACTIVE
 * workspace. Public signup stays fully disabled -- this is the only way a
 * new person ever gets into the app (besides the platform-admin-only
 * /api/admin/organizations, which invites a workspace's first owner). See
 * lib/organizations/invites.ts for the two paths this can take (a real
 * Supabase Auth invite email for a brand-new person, or an immediate
 * membership add for someone who already has an account in another club).
 */
export async function POST(request: Request) {
  const guard = await requireOrganizationAdmin({ rateLimit: { key: "invite", ...RATE_LIMITS.invite } });
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid invite." }, { status: 400 });
  }

  // Supabase's default "Invite user" email uses the implicit
  // `#access_token=...&type=invite` flow, which only /auth/invite (a
  // client page -- fragments never reach the server) can handle -- see
  // components/auth/InviteLandingClient.tsx. Derived from the incoming
  // request's own origin, not a hardcoded host, so this resolves correctly
  // in both local dev and production without any env-specific branching.
  const redirectTo = new URL("/auth/invite", request.url).toString();

  const result = await createInvite(guard.organizationId, parsed.data.email, parsed.data.role, guard.user.id, redirectTo);

  if (result.status === "error") {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  if (result.status === "already_member") {
    return NextResponse.json({ error: "That person is already a member of this workspace." }, { status: 409 });
  }

  return NextResponse.json({ status: result.status }, { status: 201 });
}
