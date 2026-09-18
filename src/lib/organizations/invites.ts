import { createServiceRoleClient } from "@/lib/supabase/server";
import { addOrganizationMember, getMembership } from "./organizations";
import type { OrganizationRole, OrganizationInviteRow } from "./types";

export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Safety cap on how many existing Auth users this app will page through to find one by email (see findAuthUserByEmail). Fine for a controlled-invite club roster app; not meant to scale to a consumer-sized user base. */
const MAX_USER_LOOKUP_PAGES = 20;
const USER_LOOKUP_PAGE_SIZE = 200;

/**
 * Finds an existing Supabase Auth user by email. Supabase's admin API has
 * no direct "get user by email" call, so this pages through
 * auth.admin.listUsers() -- acceptable at this app's expected scale
 * (a handful of clubs, each with a modest roster), capped so a very large
 * project can never turn one invite into an unbounded scan.
 */
export async function findAuthUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const supabase = createServiceRoleClient();
  const target = email.trim().toLowerCase();

  for (let page = 1; page <= MAX_USER_LOOKUP_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: USER_LOOKUP_PAGE_SIZE });
    if (error) throw new Error(`Failed to look up existing users: ${error.message}`);

    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found && found.email) return { id: found.id, email: found.email };

    if (data.users.length < USER_LOOKUP_PAGE_SIZE) break; // last page
  }
  return null;
}

export type CreateInviteResult =
  | { status: "added_existing_user" }
  | { status: "invited" }
  | { status: "already_member" }
  | { status: "error"; error: string };

/**
 * Invites `email` into `organizationId` with `role`.
 *
 * Two paths, chosen automatically:
 * - The email already has a Supabase Auth account (e.g. an operator from
 *   another club, or a re-invite): they're added to organization_members
 *   immediately -- their identity is already verified, so there's nothing
 *   left to confirm. They'll see the new workspace next time they use the
 *   workspace switcher.
 * - No existing account: a real Supabase Auth invite email is sent
 *   (auth.admin.inviteUserByEmail) and an organization_invites row records
 *   the intended organization/role so /auth/confirm can create the
 *   membership once they accept (see that route).
 *
 * Public signup stays fully disabled either way -- this is the only path
 * that ever creates a new Auth user, and only a platform admin or an
 * existing workspace admin/owner can reach it (enforced by the caller via
 * lib/auth/organizationGuard.ts, not here).
 */
export async function createInvite(
  organizationId: string,
  email: string,
  role: OrganizationRole,
  invitedBy: string,
  redirectTo: string,
): Promise<CreateInviteResult> {
  const supabase = createServiceRoleClient();
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await findAuthUserByEmail(normalizedEmail);

  if (existingUser) {
    const existingMembership = await getMembership(organizationId, existingUser.id);
    if (existingMembership) return { status: "already_member" };

    await addOrganizationMember(organizationId, existingUser.id, role);
    return { status: "added_existing_user" };
  }

  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, { redirectTo });
  if (inviteError) {
    return { status: "error", error: inviteError.message };
  }

  const { error: insertError } = await supabase.from("organization_invites").insert({
    organization_id: organizationId,
    email: normalizedEmail,
    role,
    invited_by: invitedBy,
    expires_at: new Date(Date.now() + INVITE_EXPIRY_MS).toISOString(),
  });

  if (insertError) {
    return { status: "error", error: `Invite email was sent, but failed to record it: ${insertError.message}` };
  }

  return { status: "invited" };
}

/** The most recent still-valid (unaccepted, unexpired) invite for an email, if any -- what /auth/confirm resolves after a real invite link is verified. */
export async function findPendingInviteForEmail(email: string): Promise<OrganizationInviteRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("organization_invites")
    .select("*")
    .ilike("email", email.trim())
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load invite: ${error.message}`);
  return data;
}

/**
 * Accepts a pending invite for a just-verified user: creates their
 * organization_members row (if they aren't already a member -- accepting
 * twice, e.g. a double-clicked link, is a harmless no-op) and marks the
 * invite consumed. Called once, from /auth/confirm, right after Supabase
 * verifies the user actually controls the invited email address.
 */
export async function acceptInvite(invite: OrganizationInviteRow, userId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const existing = await getMembership(invite.organization_id, userId);
  if (!existing) {
    await addOrganizationMember(invite.organization_id, userId, invite.role);
  }

  const { error } = await supabase.from("organization_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
  if (error) throw new Error(`Failed to mark invite accepted: ${error.message}`);
}
