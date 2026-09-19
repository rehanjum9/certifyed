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
 * organization_invites/email_connections via their FKs -- see
 * 0007_organizations.sql). Only ever called to roll back a workspace that
 * failed to acquire a real owner: createOrganization's own ownerUserId
 * rollback, and /api/admin/organizations' rollback when the owner invite
 * itself fails (see that route). Never exposed as a general "delete a live
 * workspace" operation -- no route lets anyone delete a workspace that
 * already has real members.
 */
export async function deleteOrganization(organizationId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("organizations").delete().eq("id", organizationId);
  if (error) throw new Error(`Failed to delete organization: ${error.message}`);
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

export async function countOwners(organizationId: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const { count, error } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("role", "owner");

  if (error) throw new Error(`Failed to count owners: ${error.message}`);
  return count ?? 0;
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

export type RemoveMemberResult = { ok: true } | { ok: false; reason: "last_owner" } | { ok: false; reason: "not_found" };

/**
 * Removes a member. The "cannot remove the last owner" rule is enforced
 * both here (a clean, specific application-level result) and in the
 * database itself (prevent_last_owner_removal trigger, 0007_organizations.sql)
 * as defense in depth -- the trigger is what actually guarantees the
 * invariant even against a bug elsewhere.
 */
export async function removeOrganizationMember(organizationId: string, userId: string): Promise<RemoveMemberResult> {
  const supabase = createServiceRoleClient();

  const membership = await getMembership(organizationId, userId);
  if (!membership) return { ok: false, reason: "not_found" };

  if (membership.role === "owner") {
    const owners = await countOwners(organizationId);
    if (owners <= 1) return { ok: false, reason: "last_owner" };
  }

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (error) {
    if (error.message.toLowerCase().includes("last owner")) return { ok: false, reason: "last_owner" };
    throw new Error(`Failed to remove member: ${error.message}`);
  }
  return { ok: true };
}

export type UpdateMemberRoleResult = { ok: true } | { ok: false; reason: "last_owner" } | { ok: false; reason: "not_found" };

export async function updateOrganizationMemberRole(
  organizationId: string,
  userId: string,
  role: OrganizationRole,
): Promise<UpdateMemberRoleResult> {
  const supabase = createServiceRoleClient();

  const membership = await getMembership(organizationId, userId);
  if (!membership) return { ok: false, reason: "not_found" };

  if (membership.role === "owner" && role !== "owner") {
    const owners = await countOwners(organizationId);
    if (owners <= 1) return { ok: false, reason: "last_owner" };
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (error) {
    if (error.message.toLowerCase().includes("last owner")) return { ok: false, reason: "last_owner" };
    throw new Error(`Failed to update member role: ${error.message}`);
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
