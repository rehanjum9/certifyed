import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));

import { createServiceRoleClient } from "@/lib/supabase/server";
import { removeOrganizationMember, updateOrganizationMemberRole, createOrganization, deleteOrganization } from "./organizations";

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
