import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("./organizations", () => ({ addOrganizationMember: vi.fn(), getMembership: vi.fn() }));

import { createServiceRoleClient } from "@/lib/supabase/server";
import { addOrganizationMember, getMembership } from "./organizations";
import { createInvite, acceptInvite } from "./invites";
import type { OrganizationInviteRow } from "./types";

interface MockConfig {
  existingUsers?: { id: string; email: string }[];
  inviteError?: { message: string } | null;
}

function buildMockClient(config: MockConfig) {
  const insertedInvites: Record<string, unknown>[] = [];
  const listUsers = vi.fn().mockResolvedValue({ data: { users: config.existingUsers ?? [] }, error: null });
  const inviteUserByEmail = vi.fn().mockResolvedValue({ error: config.inviteError ?? null });

  const from = vi.fn(() => ({
    insert: (row: Record<string, unknown>) => {
      insertedInvites.push(row);
      return Promise.resolve({ error: null });
    },
    update: () => ({ eq: async () => ({ error: null }) }),
  }));

  return {
    from,
    auth: { admin: { listUsers, inviteUserByEmail } },
    insertedInvites,
    listUsers,
    inviteUserByEmail,
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

    const result = await createInvite("org-a", "already@club.example", "admin", "admin-1", "https://app.example/auth/confirm");

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
