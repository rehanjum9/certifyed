import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { guardApiRoute } from "@/lib/auth/apiGuard";
import { getMembership } from "@/lib/organizations/organizations";
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_MAX_AGE_SECONDS } from "@/lib/organizations/activeWorkspace";
import { RATE_LIMITS } from "@/lib/rateLimit";

const bodySchema = z.object({ organizationId: z.string().uuid() });

/**
 * Sets the active-workspace cookie for the workspace switcher (architecture
 * report, item 8). The organization id is verified against the caller's
 * real memberships BEFORE the cookie is ever set -- an arbitrary/foreign
 * organization id is rejected with a 403, never written to the cookie.
 * This is the only write path for ACTIVE_ORG_COOKIE; every read of it
 * (lib/organizations/activeWorkspace.ts#pickActiveMembership) re-validates
 * it again anyway, so even a forged cookie value could never grant access
 * on its own -- this check is what keeps the cookie meaningful, not a
 * security boundary by itself.
 */
export async function POST(request: Request) {
  const guard = await guardApiRoute({ rateLimit: { key: "workspace-switch", ...RATE_LIMITS.workspaceSwitch } });
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid organizationId is required." }, { status: 400 });
  }

  const membership = await getMembership(parsed.data.organizationId, guard.user.id);
  if (!membership) {
    return NextResponse.json({ error: "You don't have access to that workspace." }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, parsed.data.organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ACTIVE_ORG_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
