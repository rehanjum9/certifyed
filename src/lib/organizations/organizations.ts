import { createServiceRoleClient } from "@/lib/supabase/server";
import type { OrganizationRole, OrganizationRow } from "./types";
import type { Membership, OrganizationMemberSummary } from "./types";

/** Every organization a user belongs to, with their role in each -- the full input a workspace switcher / active-workspace resolver needs, in one query pair. Ordered oldest-membership-first so "first org a user ever joined" is a stable, deterministic default active workspace. */
export async function listMembershipsForUser(userId: string): Promise<Membership[]> {
  const supabase = createServiceRoleClient();

  const { data: memberRows, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (memberError) throw new Error(`Failed to load organization memberships: ${memberError.message}`);
  if (!memberRows || memberRows.length === 0) return [];

  const orgIds = memberRows.map((row) => row.organization_id);
  const { data: orgRows, error: orgError } = await supabase.from("organizations").select("id, name").in("id", orgIds);

  if (orgError) throw new Error(`Failed to load organizations: ${orgError.message}`);
  const nameById = new Map((orgRows ?? []).map((row) => [row.id, row.name]));

  return memberRows.map((row) => ({
    organizationId: row.organization_id,
    organizationName: nameById.get(row.organization_id) ?? "(deleted workspace)",
    role: row.role,
  }));
}

export async function getOrganization(organizationId: string): Promise<OrganizationRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("organizations").select("*").eq("id", organizationId).maybeSingle();
  if (error) throw new Error(`Failed to load organization: ${error.message}`);
  return data;
}

/** A specific user's membership row for one organization, or null if they don't belong to it -- the one query every org-scoped authorization check ultimately reduces to. */
export async function getMembership(
  organizationId: string,
  userId: string,
): Promise<{ role: OrganizationRole } | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load membership: ${error.message}`);
  return data ? { role: data.role } : null;
}

export interface CreateOrganizationInput {
  name: string;
  createdBy: string;
  /**
   * Optional initial owner. Deliberately optional: the platform-admin
   * "create a workspace" flow (see /api/admin/organizations) creates the
   * organization with NO members at all and immediately invites its real
   * owner -- the platform admin who created it is never seeded as a
   * member themselves (the privacy rule, architecture report item 2:
   * platform admin status must never silently grant workspace access).
   * A brand-new organization_members-less organization is a safe,
   * inert state: nothing (no RLS policy, no application route) grants
   * access to an organization's data without a real membership row, and
   * prevent_last_owner_removal (0007_organizations.sql) only guards
   * DELETE/UPDATE, never blocking this zero-member creation.
   */
  ownerUserId?: string;
}

export async function createOrganization(input: CreateOrganizationInput): Promise<OrganizationRow> {
  const supabase = createServiceRoleClient();

  const { data: org, error } = await supabase
    .from("organizations")
    .insert({ name: input.name, created_by: input.createdBy })
    .select()
    .single();

  if (error) throw new Error(`Failed to create organization: ${error.message}`);

  if (input.ownerUserId) {
    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({ organization_id: org.id, user_id: input.ownerUserId, role: "owner" });

    if (memberError) {
      await supabase.from("organizations").delete().eq("id", org.id);
      throw new Error(`Failed to add the initial owner: ${memberError.message}`);
    }
  }

  return org;
}

/**
 * Deletes an organization outright (cascades to organization_members/
 * organization_invites/email_connections/gmail_oauth_states via their FKs
 * -- see 0007_organizations.sql). NEVER touches Supabase Auth -- no user
 * account is ever deleted by this, so the same email remains usable for a
 * future invite/workspace. Deliberately does NOT cascade to
 * templates/campaigns/fonts (0008_organization_ownership.sql gives those a
 * plain FK with no ON DELETE clause -- Postgres's default NO ACTION/RESTRICT
 * behavior -- so a delete would fail loudly if any existed; see
 * deleteOrganizationSafely, which checks first and never even attempts it).
 *
 * Two callers, both rollback/cleanup of a workspace that never got (or
 * lost) a real, resourced owner: createOrganization's own ownerUserId
 * rollback, /api/admin/organizations' rollback when the owner invite
 * itself fails, and deleteOrganizationSafely below (the platform-admin
 * "Delete workspace" action, for OLD orphaned/test workspaces already in
 * the database). Never called directly from a route -- every route goes
 * through deleteOrganizationSafely's resource check first.
 */
export async function deleteOrganization(organizationId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("organizations").delete().eq("id", organizationId);
  if (error) throw new Error(`Failed to delete organization: ${error.message}`);
}

export interface OrganizationResourceCounts {
  templates: number;
  campaigns: number;
  fonts: number;
}

async function countOrganizationRows(
  supabase: ReturnType<typeof createServiceRoleClient>,
  table: "templates" | "campaigns" | "fonts",
  organizationId: string,
): Promise<number> {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return count ?? 0;
}

/** The platform-admin "Delete workspace" resource check (see /admin/organizations): counts only, never row content -- listAllOrganizations already documents why platform admin never sees a workspace's actual template/campaign/font content, and this preserves that. */
export async function getOrganizationResourceCounts(organizationId: string): Promise<OrganizationResourceCounts> {
  const supabase = createServiceRoleClient();
  const [templates, campaigns, fonts] = await Promise.all([
    countOrganizationRows(supabase, "templates", organizationId),
    countOrganizationRows(supabase, "campaigns", organizationId),
    countOrganizationRows(supabase, "fonts", organizationId),
  ]);
  return { templates, campaigns, fonts };
}

export type DeleteOrganizationSafelyResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "has_resources"; counts: OrganizationResourceCounts };

/**
 * Platform-admin "Delete workspace" (see /api/admin/organizations/[organizationId]).
 * Blocks outright if the organization owns any templates, campaigns, or
 * custom fonts -- this app never cascade-deletes certificate/campaign
 * data via a workspace-cleanup action; an operator who actually wants that
 * gone must delete those resources individually first, through the
 * ordinary workspace UI. Safe for the common case this action exists for:
 * an old orphaned or failed-invite test workspace with zero real usage
 * (organization_members/organization_invites/email_connections/
 * gmail_oauth_states all cascade harmlessly -- see deleteOrganization).
 * Never deletes a Supabase Auth user.
 */
export async function deleteOrganizationSafely(organizationId: string): Promise<DeleteOrganizationSafelyResult> {
  const existing = await getOrganization(organizationId);
  if (!existing) return { ok: false, reason: "not_found" };

  const counts = await getOrganizationResourceCounts(organizationId);
  if (counts.templates > 0 || counts.campaigns > 0 || counts.fonts > 0) {
    return { ok: false, reason: "has_resources", counts };
  }

  await deleteOrganization(organizationId);
  return { ok: true };
}

export interface OrganizationWithMemberCount extends OrganizationRow {
  memberCount: number;
}

/** Platform-admin listing only -- names, member counts, created dates. Never recipient/certificate/template content (see /admin/organizations, item 11 of the architecture report). */
export async function listAllOrganizations(): Promise<OrganizationWithMemberCount[]> {
  const supabase = createServiceRoleClient();

  const { data: orgs, error } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load organizations: ${error.message}`);
  if (!orgs || orgs.length === 0) return [];

  const { data: memberRows, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .in(
      "organization_id",
      orgs.map((o) => o.id),
    );

  if (memberError) throw new Error(`Failed to load member counts: ${memberError.message}`);
  const countByOrg = new Map<string, number>();
  for (const row of memberRows ?? []) {
    countByOrg.set(row.organization_id, (countByOrg.get(row.organization_id) ?? 0) + 1);
  }

  return orgs.map((org) => ({ ...org, memberCount: countByOrg.get(org.id) ?? 0 }));
}

/** Member list for the Settings "Workspace" section / future admin drill-down -- resolves each member's email from Supabase Auth (organization_members only stores user_id). Small org sizes are assumed (a university club roster, not a consumer product); this is O(members) admin API calls, fine at that scale. */
export async function listOrganizationMembers(organizationId: string): Promise<OrganizationMemberSummary[]> {
  const supabase = createServiceRoleClient();

  const { data: rows, error } = await supabase
    .from("organization_members")
    .select("user_id, role, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load members: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const emails = await Promise.all(
    rows.map(async (row) => {
      try {
        const { data } = await supabase.auth.admin.getUserById(row.user_id);
        return data.user?.email ?? null;
      } catch {
        return null;
      }
    }),
  );

  return rows.map((row, index) => ({
    userId: row.user_id,
    email: emails[index],
    role: row.role,
    createdAt: row.created_at,
  }));
}

export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: OrganizationRole,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("organization_members").insert({ organization_id: organizationId, user_id: userId, role });
  if (error) throw new Error(`Failed to add member: ${error.message}`);
}

export type RemoveMemberResult = { ok: true } | { ok: false; reason: "owner" } | { ok: false; reason: "not_found" };

/**
 * Removes a member from a workspace. Owner-only action (see
 * requireOrganizationOwner) -- a member can never remove themselves or
 * anyone else through this. The workspace owner can never be removed
 * through this generic endpoint at all, regardless of who's calling
 * (including the owner trying to remove themselves): with the two-role
 * model (owner/member -- 0011_simplify_workspace_roles.sql) every
 * organization has EXACTLY one owner at all times, enforced at the
 * database level (0007's prevent_last_owner_removal trigger, plus 0011's
 * deferred exactly-one-owner constraint trigger) -- leadership change goes
 * through transferOrganizationOwnership instead, explicitly, never as a
 * side effect of removing someone.
 */
export async function removeOrganizationMember(organizationId: string, userId: string): Promise<RemoveMemberResult> {
  const supabase = createServiceRoleClient();

  const membership = await getMembership(organizationId, userId);
  if (!membership) return { ok: false, reason: "not_found" };
  if (membership.role === "owner") return { ok: false, reason: "owner" };

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to remove member: ${error.message}`);
  return { ok: true };
}

export type TransferOwnershipResult =
  | { ok: true }
  | { ok: false; reason: "current_owner_mismatch" }
  | { ok: false; reason: "new_owner_not_found" }
  | { ok: false; reason: "same_user" };

/**
 * Atomically transfers workspace ownership: the current owner becomes a
 * plain member, and the chosen existing member becomes the new owner.
 * Delegates to the transfer_organization_ownership Postgres function
 * (0011_simplify_workspace_roles.sql) so both role changes happen inside
 * ONE database transaction -- two separate application-level UPDATE calls
 * would each be their own transaction, and a failure between them could
 * leave a real, persisted two-owner (or briefly zero-owner) state. See
 * that function's own doc comment for the full safety argument (why
 * promote-then-demote in that order is safe, and how 0011's deferred
 * exactly-one-owner trigger tolerates it).
 *
 * `currentOwnerUserId` must come from the caller's own authenticated
 * identity (requireOrganizationOwner), never from request input -- this
 * function still re-verifies it server-side (via the RPC's own checks)
 * rather than trusting it blindly.
 */
export async function transferOrganizationOwnership(
  organizationId: string,
  currentOwnerUserId: string,
  newOwnerUserId: string,
): Promise<TransferOwnershipResult> {
  if (currentOwnerUserId === newOwnerUserId) return { ok: false, reason: "same_user" };

  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("transfer_organization_ownership", {
    p_organization_id: organizationId,
    p_current_owner_id: currentOwnerUserId,
    p_new_owner_id: newOwnerUserId,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("not the current owner")) return { ok: false, reason: "current_owner_mismatch" };
    if (message.includes("not a member")) return { ok: false, reason: "new_owner_not_found" };
    throw new Error(`Failed to transfer ownership: ${error.message}`);
  }

  return { ok: true };
}

/** Platform-admin check -- see lib/auth/organizationGuard.ts#requirePlatformAdmin. Deliberately a single-row existence check against a short explicit allowlist table, never a claim/flag on the user's own session. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Failed to check platform admin status: ${error.message}`);
  return data !== null;
}
