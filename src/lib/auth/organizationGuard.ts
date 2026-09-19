import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { guardApiRoute, type ApiUser, type GuardOptions, type GuardDeps } from "./apiGuard";
import { listMembershipsForUser, getMembership, isPlatformAdmin } from "@/lib/organizations/organizations";
import { pickActiveMembership, ACTIVE_ORG_COOKIE } from "@/lib/organizations/activeWorkspace";
import type { Membership, OrganizationRole } from "@/lib/organizations/types";

/**
 * The shared, testable authorization layer every organization-scoped route
 * uses instead of a one-off membership check (see the architecture report,
 * item 6). Every function here is a thin, injectable wrapper around
 * guardApiRoute (authentication + rate limiting) plus a specific
 * organization/role check, so:
 *
 * - No route re-implements "am I logged in" or "is this a member of that
 *   org" by hand.
 * - Every check is unit-testable without a real Supabase session or cookie
 *   jar (see organizationGuard.test.ts) via the same `deps` injection
 *   pattern apiGuard.ts already established.
 * - The service-role client's RLS bypass (see lib/supabase/server.ts) is
 *   never the only thing standing between one organization's data and
 *   another's -- every route that touches a service-role-backed resource
 *   calls one of these first.
 */

export interface OrgGuardDeps extends GuardDeps {
  getActiveOrgCookie?: () => Promise<string | null>;
  listMemberships?: (userId: string) => Promise<Membership[]>;
  getMembership?: (organizationId: string, userId: string) => Promise<{ role: OrganizationRole } | null>;
  checkPlatformAdmin?: (userId: string) => Promise<boolean>;
}

export interface OrganizationContext {
  user: ApiUser;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
}

export type OrgContextResult = OrganizationContext | { response: NextResponse };
export type PlatformAdminResult = { user: ApiUser } | { response: NextResponse };

function forbidden(message: string): { response: NextResponse } {
  return { response: NextResponse.json({ error: message }, { status: 403 }) };
}

async function defaultGetActiveOrgCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_ORG_COOKIE)?.value ?? null;
}

/**
 * Authenticates the caller, then resolves and validates their *active*
 * workspace: the cookie is only ever a hint (see
 * lib/organizations/activeWorkspace.ts#pickActiveMembership) -- the actual
 * organization used is always re-derived from real membership rows.
 * A caller with zero memberships gets a clear 403, never a fabricated
 * organization.
 */
export async function requireOrganizationContext(
  options: GuardOptions = {},
  deps: OrgGuardDeps = {},
): Promise<OrgContextResult> {
  const guard = await guardApiRoute(options, deps);
  if ("response" in guard) return guard;

  const listMemberships = deps.listMemberships ?? listMembershipsForUser;
  const getActiveOrgCookie = deps.getActiveOrgCookie ?? defaultGetActiveOrgCookie;

  const [memberships, cookieOrgId] = await Promise.all([listMemberships(guard.user.id), getActiveOrgCookie()]);
  const active = pickActiveMembership(memberships, cookieOrgId);

  if (!active) {
    return forbidden("You don't belong to any workspace yet. Ask a platform administrator to add you to one.");
  }

  return { user: guard.user, organizationId: active.organizationId, organizationName: active.organizationName, role: active.role };
}

/**
 * Same as requireOrganizationContext, but the caller's role in the active
 * workspace must be "owner". Two-role model (owner/member -- see
 * 0011_simplify_workspace_roles.sql): every membership/Gmail/workspace-
 * management operation is owner-only, never something a plain member can
 * reach. Certificate operations (templates/campaigns/fonts/jobs) use
 * requireOrganizationContext/requireOrganizationMember instead -- any role
 * is enough for those.
 */
export async function requireOrganizationOwner(
  options: GuardOptions = {},
  deps: OrgGuardDeps = {},
): Promise<OrgContextResult> {
  const context = await requireOrganizationContext(options, deps);
  if ("response" in context) return context;

  if (context.role !== "owner") {
    return forbidden("Only the workspace owner can perform this action.");
  }
  return context;
}

export type SpecificMembershipResult = { user: ApiUser; role: OrganizationRole } | { response: NextResponse };

/**
 * Verifies the caller belongs to a SPECIFIC organization id -- independent
 * of whichever workspace they currently have active. Used where the
 * organization is determined by a resource, not by the browser's current
 * workspace selection (e.g. the Gmail OAuth callback, item 16/18 of the
 * architecture report: a campaign's email always resolves through
 * campaign.organization_id, never the caller's active-workspace cookie).
 */
export async function requireOrganizationMember(
  organizationId: string,
  options: GuardOptions = {},
  deps: OrgGuardDeps = {},
): Promise<SpecificMembershipResult> {
  const guard = await guardApiRoute(options, deps);
  if ("response" in guard) return guard;

  const getMembershipFn = deps.getMembership ?? getMembership;
  const membership = await getMembershipFn(organizationId, guard.user.id);
  if (!membership) {
    return forbidden("You don't have access to this workspace.");
  }
  return { user: guard.user, role: membership.role };
}

/** Same as requireOrganizationMember, but requires "owner" in that specific organization. */
export async function requireOrganizationOwnerOf(
  organizationId: string,
  options: GuardOptions = {},
  deps: OrgGuardDeps = {},
): Promise<SpecificMembershipResult> {
  const result = await requireOrganizationMember(organizationId, options, deps);
  if ("response" in result) return result;

  if (result.role !== "owner") {
    return forbidden("Only the workspace owner can perform this action.");
  }
  return result;
}

/**
 * Platform-admin-only routes (see /admin/organizations). Deliberately
 * separate from every organization check above: platform admin status
 * never implies membership in, or access to, any specific workspace's
 * data -- see the privacy rule in the architecture report, item 2.
 */
export async function requirePlatformAdmin(options: GuardOptions = {}, deps: OrgGuardDeps = {}): Promise<PlatformAdminResult> {
  const guard = await guardApiRoute(options, deps);
  if ("response" in guard) return guard;

  const checkPlatformAdmin = deps.checkPlatformAdmin ?? isPlatformAdmin;
  const isAdmin = await checkPlatformAdmin(guard.user.id);
  if (!isAdmin) {
    return forbidden("Platform administrator access required.");
  }
  return { user: guard.user };
}

/**
 * Pure equality check for the "does this resource actually belong to the
 * organization I resolved for this request" assertion -- used at call
 * sites that already loaded a resource some other way (e.g. a job's
 * campaign) and need one last explicit check before acting on it, even
 * though the primary defense is that every lib/*.ts lookup used in this
 * app already filters its query by organization_id server-side (see e.g.
 * lib/campaigns.ts#getCampaign). Never throws -- callers decide the
 * response (typically a 404, so a foreign resource id is indistinguishable
 * from one that never existed; see lib/apiError.ts).
 */
export function assertResourceBelongsToOrganization(
  resourceOrganizationId: string | null | undefined,
  organizationId: string,
): boolean {
  return resourceOrganizationId != null && resourceOrganizationId === organizationId;
}
