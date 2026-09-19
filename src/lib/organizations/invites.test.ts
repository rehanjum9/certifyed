import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("./organizations", () => ({
  addOrganizationMember: vi.fn(),
  getMembership: vi.fn(),
  listMembershipsForUser: vi.fn(),
}));

import { createServiceRoleClient } from "@/lib/supabase/server";
import { addOrganizationMember, getMembership, listMembershipsForUser } from "./organizations";
import {
  createInvite,
  acceptInvite,
  finalizeInviteAcceptance,
  findLatestInviteForOrganization,
  listLatestInvitesForOrganizations,
  cancelPendingInvite,
  resendPendingInvite,
} from "./invites";
import type { OrganizationInviteRow } from "./types";

interface MockConfig {
  existingUsers?: { id: string; email: string }[];
  inviteError?: { message: string } | null;
  /** What findPendingInviteForEmail's / findLatestInviteForOrganization's single-row query should resolve to -- null means "no invite found". */
  pendingInvite?: OrganizationInviteRow | null;
  /** What listLatestInvitesForOrganizations' bulk query should resolve to (a raw row list, not narrowed to "latest per org" -- that reduction is the function under test). */
  inviteListResult?: OrganizationInviteRow[];
}

/**
 * Chainable stub: every filter method returns itself so any call sequence
 * works. Thenable at every step (not just after an explicit terminal call)
 * so it supports both this module's single-row lookups (...`.maybeSingle()`)
 * and listLatestInvitesForOrganizations' bulk lookup, which is awaited
 * directly after `.order()` with no terminal call at all.
 */
function selectChain(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {
    maybeSingle: async () => result,
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  for (const method of ["select", "ilike", "is", "gt", "order", "limit", "eq", "in"]) {
    node[method] = () => node;
  }
  return node;
}

function buildMockClient(config: MockConfig) {
  const insertedInvites: Record<string, unknown>[] = [];
  const updatedInviteIds: string[] = [];
  const deletedInviteIds: string[] = [];
  const listUsers = vi.fn().mockResolvedValue({ data: { users: config.existingUsers ?? [] }, error: null });
  const inviteUserByEmail = vi.fn().mockResolvedValue({ error: config.inviteError ?? null });
  const deleteUser = vi.fn();

  const from = vi.fn((table: string) => {
    if (table === "organization_invites") {
      return {
        select: () =>
          selectChain(
            config.inviteListResult !== undefined
              ? { data: config.inviteListResult, error: null }
              : { data: config.pendingInvite ?? null, error: null },
          ),
        insert: (row: Record<string, unknown>) => {
          insertedInvites.push(row);
          return Promise.resolve({ error: null });
        },
        update: () => ({
          eq: async (_col: string, id: string) => {
            updatedInviteIds.push(id);
            return { error: null };
          },
        }),
        delete: () => ({
          eq: async (_col: string, id: string) => {
            deletedInviteIds.push(id);
            return { error: null };
          },
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    from,
    auth: { admin: { listUsers, inviteUserByEmail, deleteUser } },
    insertedInvites,
    updatedInviteIds,
    deletedInviteIds,
    listUsers,
    inviteUserByEmail,
    deleteUser,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createInvite", () => {
  it("adds an existing Auth user directly as a member, without sending an invite email", async () => {
    const client = buildMockClient({ existingUsers: [{ id: "user-existing", email: "already@club.example" }] });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);
    vi.mocked(getMembership).mockResolvedValue(null);

    const result = await createInvite("org-a", "already@club.example", "member", "admin-1", "https://app.example/auth/confirm");

    expect(result).toEqual({ status: "added_existing_user" });
    expect(addOrganizationMember).toHaveBeenCalledWith("org-a", "user-existing", "member");
    expect(client.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("reports already_member instead of duplicating membership for an existing user already in the organization", async () => {
    const client = buildMockClient({ existingUsers: [{ id: "user-existing", email: "already@club.example" }] });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);
    vi.mocked(getMembership).mockResolvedValue({ role: "member" });

    const result = await createInvite("org-a", "already@club.example", "member", "admin-1", "https://app.example/auth/confirm");

    expect(result).toEqual({ status: "already_member" });
    expect(addOrganizationMember).not.toHaveBeenCalled();
  });

  it("sends a real Supabase invite email and records a pending invite for a brand-new email", async () => {
    const client = buildMockClient({ existingUsers: [] });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await createInvite("org-a", "new-person@club.example", "member", "admin-1", "https://app.example/auth/confirm");

    expect(result).toEqual({ status: "invited" });
    expect(client.inviteUserByEmail).toHaveBeenCalledWith("new-person@club.example", { redirectTo: "https://app.example/auth/confirm" });
    expect(client.insertedInvites).toHaveLength(1);
    expect(client.insertedInvites[0]).toMatchObject({ organization_id: "org-a", email: "new-person@club.example", role: "member" });
    expect(addOrganizationMember).not.toHaveBeenCalled();
  });

  it("normalizes email casing/whitespace before lookup and storage", async () => {
    const client = buildMockClient({ existingUsers: [] });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    await createInvite("org-a", "  New-Person@Club.example  ", "member", "admin-1", "https://app.example/auth/confirm");

    expect(client.inviteUserByEmail).toHaveBeenCalledWith("new-person@club.example", expect.anything());
  });

  it("reports a clean error status when the Supabase invite call itself fails", async () => {
    const client = buildMockClient({ existingUsers: [], inviteError: { message: "rate limited" } });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await createInvite("org-a", "new-person@club.example", "member", "admin-1", "https://app.example/auth/confirm");

    expect(result).toEqual({ status: "error", error: "rate limited" });
    expect(client.insertedInvites).toHaveLength(0);
  });
});

describe("acceptInvite", () => {
  const invite: OrganizationInviteRow = {
    id: "invite-1",
    organization_id: "org-a",
    email: "person@club.example",
    role: "owner",
    invited_by: "admin-1",
    accepted_at: null,
    expires_at: new Date(Date.now() + 100000).toISOString(),
    created_at: new Date().toISOString(),
  };

  it("adds the accepting user as a member with the invite's role when not already a member", async () => {
    const client = buildMockClient({});
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);
    vi.mocked(getMembership).mockResolvedValue(null);

    await acceptInvite(invite, "new-user-1");

    expect(addOrganizationMember).toHaveBeenCalledWith("org-a", "new-user-1", "owner");
  });

  it("is a harmless no-op for membership when the user is already a member (double-accept)", async () => {
    const client = buildMockClient({});
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);
    vi.mocked(getMembership).mockResolvedValue({ role: "owner" });

    await acceptInvite(invite, "new-user-1");

    expect(addOrganizationMember).not.toHaveBeenCalled();
  });
});

describe("finalizeInviteAcceptance", () => {
  const invite: OrganizationInviteRow = {
    id: "invite-1",
    organization_id: "org-a",
    email: "person@club.example",
    role: "member",
    invited_by: "admin-1",
    accepted_at: null,
    expires_at: new Date(Date.now() + 100000).toISOString(),
    created_at: new Date().toISOString(),
  };

  it("accepts a real pending invite and reports the organization it granted access to", async () => {
    const client = buildMockClient({ pendingInvite: invite });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);
    vi.mocked(getMembership).mockResolvedValue(null);

    const result = await finalizeInviteAcceptance("new-user-1", "person@club.example");

    expect(result).toEqual({ status: "accepted", organizationId: "org-a" });
    expect(addOrganizationMember).toHaveBeenCalledWith("org-a", "new-user-1", "member");
    expect(client.updatedInviteIds).toEqual(["invite-1"]);
  });

  it("grants exactly the invite's own role -- the browser has no say in it", async () => {
    const ownerInvite: OrganizationInviteRow = { ...invite, role: "owner" };
    const client = buildMockClient({ pendingInvite: ownerInvite });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);
    vi.mocked(getMembership).mockResolvedValue(null);

    await finalizeInviteAcceptance("new-user-1", "person@club.example");

    expect(addOrganizationMember).toHaveBeenCalledWith("org-a", "new-user-1", "owner");
    expect(addOrganizationMember).not.toHaveBeenCalledWith("org-a", "new-user-1", "member");
  });

  it("only ever grants membership in the invite's own organization -- never a caller-influenced one", async () => {
    const client = buildMockClient({ pendingInvite: invite });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);
    vi.mocked(getMembership).mockResolvedValue(null);

    const result = await finalizeInviteAcceptance("new-user-1", "person@club.example");

    expect(result.status === "accepted" && result.organizationId).toBe("org-a");
    expect(addOrganizationMember).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addOrganizationMember).mock.calls[0][0]).toBe("org-a");
  });

  it("treats a re-visit of an already-consumed link as a harmless no-op when the user already belongs to an organization", async () => {
    const client = buildMockClient({ pendingInvite: null });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);
    vi.mocked(listMembershipsForUser).mockResolvedValue([{ organizationId: "org-a", organizationName: "Club A", role: "member" }]);

    const result = await finalizeInviteAcceptance("existing-user-1", "person@club.example");

    expect(result).toEqual({ status: "already_member" });
    expect(addOrganizationMember).not.toHaveBeenCalled();
  });

  it("reports no_pending_invite for a genuinely invalid/expired/forged attempt -- no invite AND no existing membership", async () => {
    const client = buildMockClient({ pendingInvite: null });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);
    vi.mocked(listMembershipsForUser).mockResolvedValue([]);

    const result = await finalizeInviteAcceptance("stranger-1", "nobody@club.example");

    expect(result).toEqual({ status: "no_pending_invite" });
    expect(addOrganizationMember).not.toHaveBeenCalled();
  });

  it("rejects an expired invite (matches findPendingInviteForEmail's own expiry filter) and falls through to the membership check", async () => {
    // findPendingInviteForEmail's query already filters expires_at > now()
    // server-side -- an expired row simply never comes back as
    // `pendingInvite`, which this simulates directly.
    const client = buildMockClient({ pendingInvite: null });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);
    vi.mocked(listMembershipsForUser).mockResolvedValue([]);

    const result = await finalizeInviteAcceptance("stranger-1", "person@club.example");

    expect(result).toEqual({ status: "no_pending_invite" });
  });
});

const pendingOwnerInvite: OrganizationInviteRow = {
  id: "invite-1",
  organization_id: "org-a",
  email: "owner@club.example",
  role: "owner",
  invited_by: "platform-admin-1",
  accepted_at: null,
  expires_at: new Date(Date.now() + 100000).toISOString(),
  created_at: new Date().toISOString(),
};

const acceptedOwnerInvite: OrganizationInviteRow = { ...pendingOwnerInvite, id: "invite-2", accepted_at: new Date().toISOString() };

describe("findLatestInviteForOrganization", () => {
  it("returns the invite the query resolves, regardless of accepted status", async () => {
    const client = buildMockClient({ pendingInvite: acceptedOwnerInvite });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await findLatestInviteForOrganization("org-a");

    expect(result).toEqual(acceptedOwnerInvite);
  });

  it("returns null when the organization has never had an invite", async () => {
    const client = buildMockClient({ pendingInvite: null });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await findLatestInviteForOrganization("org-a");

    expect(result).toBeNull();
  });
});

describe("listLatestInvitesForOrganizations", () => {
  it("returns an empty map without querying anything for an empty id list", async () => {
    const result = await listLatestInvitesForOrganizations([]);
    expect(result).toEqual(new Map());
  });

  it("keeps only the latest invite per organization from a mixed, multi-org result set", async () => {
    const orgAOlder: OrganizationInviteRow = { ...pendingOwnerInvite, id: "a-older", organization_id: "org-a", created_at: "2024-01-01T00:00:00.000Z" };
    const orgANewer: OrganizationInviteRow = { ...pendingOwnerInvite, id: "a-newer", organization_id: "org-a", created_at: "2024-06-01T00:00:00.000Z" };
    const orgBOnly: OrganizationInviteRow = { ...pendingOwnerInvite, id: "b-only", organization_id: "org-b", created_at: "2024-03-01T00:00:00.000Z" };
    // Simulates the query's own `order(created_at desc)` -- newest first.
    const client = buildMockClient({ inviteListResult: [orgANewer, orgBOnly, orgAOlder] });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await listLatestInvitesForOrganizations(["org-a", "org-b"]);

    expect(result.get("org-a")).toEqual(orgANewer);
    expect(result.get("org-b")).toEqual(orgBOnly);
    expect(result.size).toBe(2);
  });
});

describe("cancelPendingInvite", () => {
  it("deletes a still-pending invite", async () => {
    const client = buildMockClient({ pendingInvite: pendingOwnerInvite });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await cancelPendingInvite("org-a");

    expect(result).toEqual({ status: "cancelled" });
    expect(client.deletedInviteIds).toEqual(["invite-1"]);
  });

  it("refuses to cancel an already-accepted invite -- an accepted invite is membership history, not a pending request", async () => {
    const client = buildMockClient({ pendingInvite: acceptedOwnerInvite });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await cancelPendingInvite("org-a");

    expect(result).toEqual({ status: "already_accepted" });
    expect(client.deletedInviteIds).toEqual([]);
  });

  it("reports not_found when the organization has no invite at all", async () => {
    const client = buildMockClient({ pendingInvite: null });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await cancelPendingInvite("org-a");

    expect(result).toEqual({ status: "not_found" });
  });

  it("never touches a Supabase Auth user account -- only the organization_invites row is removed", async () => {
    const client = buildMockClient({ pendingInvite: pendingOwnerInvite });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    await cancelPendingInvite("org-a");

    expect(client.deleteUser).not.toHaveBeenCalled();
  });
});

describe("resendPendingInvite", () => {
  it("resends the Supabase invite email and extends the SAME row's expiry -- never inserts a second row", async () => {
    const client = buildMockClient({ pendingInvite: pendingOwnerInvite });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await resendPendingInvite("org-a", "https://app.example/auth/invite");

    expect(result).toEqual({ status: "resent" });
    expect(client.inviteUserByEmail).toHaveBeenCalledWith("owner@club.example", { redirectTo: "https://app.example/auth/invite" });
    expect(client.updatedInviteIds).toEqual(["invite-1"]);
    expect(client.insertedInvites).toHaveLength(0);
  });

  it("repeated resends keep updating the same row and never accumulate duplicate active invites", async () => {
    const client = buildMockClient({ pendingInvite: pendingOwnerInvite });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    await resendPendingInvite("org-a", "https://app.example/auth/invite");
    await resendPendingInvite("org-a", "https://app.example/auth/invite");
    await resendPendingInvite("org-a", "https://app.example/auth/invite");

    expect(client.updatedInviteIds).toEqual(["invite-1", "invite-1", "invite-1"]);
    expect(client.insertedInvites).toHaveLength(0);
    expect(client.inviteUserByEmail).toHaveBeenCalledTimes(3);
  });

  it("refuses to resend an already-accepted invite", async () => {
    const client = buildMockClient({ pendingInvite: acceptedOwnerInvite });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await resendPendingInvite("org-a", "https://app.example/auth/invite");

    expect(result).toEqual({ status: "already_accepted" });
    expect(client.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("reports not_found when the organization has no invite at all", async () => {
    const client = buildMockClient({ pendingInvite: null });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await resendPendingInvite("org-a", "https://app.example/auth/invite");

    expect(result).toEqual({ status: "not_found" });
  });

  it("reports a clean error status when the Supabase invite call itself fails, without touching the invite row", async () => {
    const client = buildMockClient({ pendingInvite: pendingOwnerInvite, inviteError: { message: "rate limited" } });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await resendPendingInvite("org-a", "https://app.example/auth/invite");

    expect(result).toEqual({ status: "error", error: "rate limited" });
    expect(client.updatedInviteIds).toEqual([]);
  });
});
