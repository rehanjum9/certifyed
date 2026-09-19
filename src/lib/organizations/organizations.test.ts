import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  removeOrganizationMember,
  updateOrganizationMemberRole,
  createOrganization,
  deleteOrganization,
  deleteOrganizationSafely,
} from "./organizations";

interface MemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
}

function buildMockClient(members: MemberRow[]) {
  const orgInsertMock = vi.fn(() => ({
    select: () => ({
      single: async () => ({ data: { id: "org-1", name: "Club A" }, error: null }),
    }),
  }));
  const orgDeleteMock = vi.fn(() => ({ eq: async () => ({ error: null }) }));

  const memberInsertMock = vi.fn((row: Partial<MemberRow>) => {
    members.push({ id: `m-${members.length + 1}`, organization_id: row.organization_id!, user_id: row.user_id!, role: row.role! });
    return Promise.resolve({ error: null });
  });

  const from = vi.fn((table: string) => {
    if (table === "organizations") {
      return { insert: orgInsertMock, delete: orgDeleteMock };
    }
    if (table === "organization_members") {
      return {
        insert: memberInsertMock,
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count) {
            // countOwners-style head query: .select("id", {count}).eq(org).eq(role)
            const chain = {
              eq: () => chain,
              // Resolve the promise lazily once both filters are applied --
              // simplest correct behavior here is to just compute on final await.
              then: (resolve: (v: unknown) => void) => {
                resolve({ count: members.filter((m) => m.role === "owner").length, error: null });
              },
            };
            return chain as unknown as Promise<{ count: number; error: null }>;
          }
          // getMembership-style: .select("role").eq(org).eq(user).maybeSingle()
          return {
            eq: (_col: string, orgOrUser: string) => ({
              eq: (_col2: string, userOrOrg: string) => ({
                maybeSingle: async () => {
                  const match = members.find(
                    (m) => (m.organization_id === orgOrUser && m.user_id === userOrOrg) || (m.organization_id === userOrOrg && m.user_id === orgOrUser),
                  );
                  return { data: match ? { role: match.role } : null, error: null };
                },
              }),
            }),
          };
        },
        delete: () => ({
          eq: (_col: string, orgId: string) => ({
            eq: (_col2: string, userId: string) => {
              const idx = members.findIndex((m) => m.organization_id === orgId && m.user_id === userId);
              if (idx >= 0) members.splice(idx, 1);
              return Promise.resolve({ error: null });
            },
          }),
        }),
        update: (patch: Partial<MemberRow>) => ({
          eq: (_col: string, orgId: string) => ({
            eq: (_col2: string, userId: string) => {
              const row = members.find((m) => m.organization_id === orgId && m.user_id === userId);
              if (row) Object.assign(row, patch);
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("removeOrganizationMember", () => {
  it("removes a plain member with no owner restriction", async () => {
    const members: MemberRow[] = [
      { id: "m1", organization_id: "org-1", user_id: "owner-1", role: "owner" },
      { id: "m2", organization_id: "org-1", user_id: "member-1", role: "member" },
    ];
    vi.mocked(createServiceRoleClient).mockReturnValue(buildMockClient(members) as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await removeOrganizationMember("org-1", "member-1");
    expect(result).toEqual({ ok: true });
    expect(members).toHaveLength(1);
  });

  it("refuses to remove the last owner", async () => {
    const members: MemberRow[] = [{ id: "m1", organization_id: "org-1", user_id: "owner-1", role: "owner" }];
    vi.mocked(createServiceRoleClient).mockReturnValue(buildMockClient(members) as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await removeOrganizationMember("org-1", "owner-1");
    expect(result).toEqual({ ok: false, reason: "last_owner" });
    expect(members).toHaveLength(1);
  });

  it("allows removing one owner when another owner remains", async () => {
    const members: MemberRow[] = [
      { id: "m1", organization_id: "org-1", user_id: "owner-1", role: "owner" },
      { id: "m2", organization_id: "org-1", user_id: "owner-2", role: "owner" },
    ];
    vi.mocked(createServiceRoleClient).mockReturnValue(buildMockClient(members) as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await removeOrganizationMember("org-1", "owner-1");
    expect(result).toEqual({ ok: true });
    expect(members).toHaveLength(1);
  });

  it("returns not_found for a user with no membership row", async () => {
    const members: MemberRow[] = [];
    vi.mocked(createServiceRoleClient).mockReturnValue(buildMockClient(members) as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await removeOrganizationMember("org-1", "nobody");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("updateOrganizationMemberRole", () => {
  it("refuses to demote the last owner", async () => {
    const members: MemberRow[] = [{ id: "m1", organization_id: "org-1", user_id: "owner-1", role: "owner" }];
    vi.mocked(createServiceRoleClient).mockReturnValue(buildMockClient(members) as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await updateOrganizationMemberRole("org-1", "owner-1", "member");
    expect(result).toEqual({ ok: false, reason: "last_owner" });
    expect(members[0].role).toBe("owner");
  });

  it("allows demoting an owner when another owner remains", async () => {
    const members: MemberRow[] = [
      { id: "m1", organization_id: "org-1", user_id: "owner-1", role: "owner" },
      { id: "m2", organization_id: "org-1", user_id: "owner-2", role: "owner" },
    ];
    vi.mocked(createServiceRoleClient).mockReturnValue(buildMockClient(members) as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await updateOrganizationMemberRole("org-1", "owner-1", "admin");
    expect(result).toEqual({ ok: true });
    expect(members[0].role).toBe("admin");
  });

  it("allows promoting a member to admin freely", async () => {
    const members: MemberRow[] = [
      { id: "m1", organization_id: "org-1", user_id: "owner-1", role: "owner" },
      { id: "m2", organization_id: "org-1", user_id: "member-1", role: "member" },
    ];
    vi.mocked(createServiceRoleClient).mockReturnValue(buildMockClient(members) as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await updateOrganizationMemberRole("org-1", "member-1", "admin");
    expect(result).toEqual({ ok: true });
    expect(members[1].role).toBe("admin");
  });
});

describe("createOrganization", () => {
  it("creates an organization with zero members when no ownerUserId is given (platform-admin creation flow)", async () => {
    const members: MemberRow[] = [];
    const client = buildMockClient(members);
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const org = await createOrganization({ name: "Club A", createdBy: "platform-admin-1" });

    expect(org.id).toBe("org-1");
    expect(members).toHaveLength(0);
  });

  it("seeds the given owner when ownerUserId is provided", async () => {
    const members: MemberRow[] = [];
    const client = buildMockClient(members);
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    await createOrganization({ name: "Club A", createdBy: "user-1", ownerUserId: "user-1" });

    expect(members).toEqual([{ id: "m-1", organization_id: "org-1", user_id: "user-1", role: "owner" }]);
  });
});

describe("deleteOrganization", () => {
  it("deletes the organization row", async () => {
    const members: MemberRow[] = [];
    const client = buildMockClient(members);
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    await expect(deleteOrganization("org-1")).resolves.toBeUndefined();
  });
});

interface DeleteSafelyConfig {
  organizationExists?: boolean;
  templatesCount?: number;
  campaignsCount?: number;
  fontsCount?: number;
}

function buildDeleteSafelyMockClient(config: DeleteSafelyConfig) {
  const deleteUser = vi.fn();
  const orgDeleteMock = vi.fn(() => ({ eq: async () => ({ error: null }) }));
  const countsByTable: Record<string, number> = {
    templates: config.templatesCount ?? 0,
    campaigns: config.campaignsCount ?? 0,
    fonts: config.fontsCount ?? 0,
  };

  const from = vi.fn((table: string) => {
    if (table === "organizations") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data:
                config.organizationExists === false
                  ? null
                  : { id: "org-1", name: "Club B", slug: null, created_by: "platform-admin-1", created_at: "now", updated_at: "now" },
              error: null,
            }),
          }),
        }),
        delete: orgDeleteMock,
      };
    }
    if (table === "templates" || table === "campaigns" || table === "fonts") {
      return {
        select: () => ({
          eq: async () => ({ count: countsByTable[table], error: null }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from, auth: { admin: { deleteUser } }, deleteUser, orgDeleteMock };
}

describe("deleteOrganizationSafely", () => {
  it("deletes an empty workspace (no templates, campaigns, or fonts)", async () => {
    const client = buildDeleteSafelyMockClient({});
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await deleteOrganizationSafely("org-1");

    expect(result).toEqual({ ok: true });
    expect(client.orgDeleteMock).toHaveBeenCalled();
  });

  it("blocks deletion when the workspace has templates", async () => {
    const client = buildDeleteSafelyMockClient({ templatesCount: 2 });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await deleteOrganizationSafely("org-1");

    expect(result).toEqual({ ok: false, reason: "has_resources", counts: { templates: 2, campaigns: 0, fonts: 0 } });
    expect(client.orgDeleteMock).not.toHaveBeenCalled();
  });

  it("blocks deletion when the workspace has campaigns", async () => {
    const client = buildDeleteSafelyMockClient({ campaignsCount: 1 });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await deleteOrganizationSafely("org-1");

    expect(result).toEqual({ ok: false, reason: "has_resources", counts: { templates: 0, campaigns: 1, fonts: 0 } });
    expect(client.orgDeleteMock).not.toHaveBeenCalled();
  });

  it("blocks deletion when the workspace has custom fonts", async () => {
    const client = buildDeleteSafelyMockClient({ fontsCount: 3 });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await deleteOrganizationSafely("org-1");

    expect(result).toEqual({ ok: false, reason: "has_resources", counts: { templates: 0, campaigns: 0, fonts: 3 } });
    expect(client.orgDeleteMock).not.toHaveBeenCalled();
  });

  it("reports not_found for a workspace id that doesn't exist, without counting anything", async () => {
    const client = buildDeleteSafelyMockClient({ organizationExists: false });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await deleteOrganizationSafely("org-missing");

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(client.orgDeleteMock).not.toHaveBeenCalled();
  });

  it("never deletes the Supabase Auth user account for an empty workspace it does delete", async () => {
    const client = buildDeleteSafelyMockClient({});
    vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

    const result = await deleteOrganizationSafely("org-1");

    expect(result).toEqual({ ok: true });
    expect(client.deleteUser).not.toHaveBeenCalled();
  });

  it(
    "never queries organization_members or counts owners itself -- allowing a workspace's final-owner membership to be " +
      "cascade-deleted is enforced entirely at the database level (0010_allow_workspace_delete_cascade.sql's " +
      "prevent_last_owner_removal exception), not duplicated here",
    async () => {
      const client = buildDeleteSafelyMockClient({});
      vi.mocked(createServiceRoleClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceRoleClient>);

      const result = await deleteOrganizationSafely("org-1");

      expect(result).toEqual({ ok: true });
      expect(client.from).not.toHaveBeenCalledWith("organization_members");
    },
  );

  it("deletes cleanly regardless of member count -- a single-owner workspace and a multi-member workspace both just issue the same DELETE and rely on the DB cascade", async () => {
    // This function has no member-count branch of its own; both scenarios
    // exercise the exact same code path. The distinction (single owner vs.
    // several members) only matters at the database level, where the
    // ON DELETE CASCADE fans out to however many organization_members rows
    // actually exist -- see 0010's migration test for the trigger-level
    // proof that the cascade itself is no longer blocked.
    const singleOwnerClient = buildDeleteSafelyMockClient({});
    vi.mocked(createServiceRoleClient).mockReturnValue(singleOwnerClient as unknown as ReturnType<typeof createServiceRoleClient>);
    await expect(deleteOrganizationSafely("org-1")).resolves.toEqual({ ok: true });
    expect(singleOwnerClient.orgDeleteMock).toHaveBeenCalled();

    const multiMemberClient = buildDeleteSafelyMockClient({});
    vi.mocked(createServiceRoleClient).mockReturnValue(multiMemberClient as unknown as ReturnType<typeof createServiceRoleClient>);
    await expect(deleteOrganizationSafely("org-1")).resolves.toEqual({ ok: true });
    expect(multiMemberClient.orgDeleteMock).toHaveBeenCalled();
  });
});
