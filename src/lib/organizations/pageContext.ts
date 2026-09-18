import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listMembershipsForUser, isPlatformAdmin as checkIsPlatformAdmin } from "./organizations";
import { pickActiveMembership, ACTIVE_ORG_COOKIE } from "./activeWorkspace";
import type { Membership, OrganizationRole } from "./types";

export interface AuthenticatedPageUser {
  id: string;
  email: string | null;
  isPlatformAdmin: boolean;
  memberships: Membership[];
}

/**
 * Per-request-memoized (React `cache()`) resolution of the signed-in user,
 * every workspace they belong to, and their platform-admin status.
 * Memoization means the root layout (which needs this for the
 * sidebar/workspace switcher) and whatever page is rendering underneath it
 * (which needs it again for its own data) share one real query pair per
 * request instead of duplicating it -- this is the standard Next.js App
 * Router pattern for request-scoped, cross-Server-Component data.
 *
 * Redirects to /login if somehow reached without a session -- proxy.ts
 * already guarantees this for every authenticated-app route, so this is
 * defense in depth, not the primary gate.
 */
export const getAuthenticatedPageUser = cache(async (): Promise<AuthenticatedPageUser> => {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");

  const [memberships, platformAdmin] = await Promise.all([listMembershipsForUser(user.id), checkIsPlatformAdmin(user.id)]);

  return { id: user.id, email: user.email ?? null, isPlatformAdmin: platformAdmin, memberships };
});

export interface PageWorkspaceContext {
  userId: string;
  userEmail: string | null;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
  memberships: Membership[];
  isPlatformAdmin: boolean;
}

export type PageWorkspaceResult = PageWorkspaceContext | { noWorkspace: true; userEmail: string | null; isPlatformAdmin: boolean };

export interface LayoutWorkspaceInfo {
  userEmail: string | null;
  isPlatformAdmin: boolean;
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  memberships: Membership[];
}

/**
 * Non-redirecting sibling of resolvePageWorkspaceContext, for the root
 * layout (src/app/layout.tsx): that layout also wraps the public
 * marketing pages and /login, which render with no session at all, so it
 * can never use a function that redirects to /login on its own. Returns
 * all-empty/null fields for a signed-out visitor instead -- the sidebar is
 * never even rendered on those paths (see components/layout/AppShell.tsx),
 * so this data is simply unused there.
 */
export async function getLayoutWorkspaceInfo(): Promise<LayoutWorkspaceInfo> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return { userEmail: null, isPlatformAdmin: false, activeOrganizationId: null, activeOrganizationName: null, memberships: [] };
  }

  const [memberships, platformAdmin] = await Promise.all([listMembershipsForUser(user.id), checkIsPlatformAdmin(user.id)]);
  const cookieStore = await cookies();
  const active = pickActiveMembership(memberships, cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null);

  return {
    userEmail: user.email ?? null,
    isPlatformAdmin: platformAdmin,
    activeOrganizationId: active?.organizationId ?? null,
    activeOrganizationName: active?.organizationName ?? null,
    memberships,
  };
}

/**
 * The page-level equivalent of requireOrganizationContext (see
 * lib/auth/organizationGuard.ts) for Server Component pages: resolves the
 * caller's active workspace, re-validated against their real memberships
 * (never trusting the cookie alone -- see
 * lib/organizations/activeWorkspace.ts#pickActiveMembership). Returns a
 * discriminated `{ noWorkspace: true }` result instead of throwing, so
 * every page decides for itself how to render that state (see
 * components/organizations/NoWorkspaceState.tsx) rather than a generic
 * 404/500.
 */
export async function resolvePageWorkspaceContext(): Promise<PageWorkspaceResult> {
  const user = await getAuthenticatedPageUser();
  const cookieStore = await cookies();
  const active = pickActiveMembership(user.memberships, cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null);

  if (!active) {
    return { noWorkspace: true, userEmail: user.email, isPlatformAdmin: user.isPlatformAdmin };
  }

  return {
    userId: user.id,
    userEmail: user.email,
    organizationId: active.organizationId,
    organizationName: active.organizationName,
    role: active.role,
    memberships: user.memberships,
    isPlatformAdmin: user.isPlatformAdmin,
  };
}
