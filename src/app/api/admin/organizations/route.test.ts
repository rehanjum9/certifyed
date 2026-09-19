import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/organizationGuard", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/organizations/organizations", () => ({ createOrganization: vi.fn(), deleteOrganization: vi.fn() }));
vi.mock("@/lib/organizations/invites", () => ({ createInvite: vi.fn() }));

import { requirePlatformAdmin } from "@/lib/auth/organizationGuard";
import { createOrganization, deleteOrganization } from "@/lib/organizations/organizations";
import { createInvite } from "@/lib/organizations/invites";
import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

function request(body: unknown) {
  return new Request("http://localhost/api/admin/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/organizations", () => {
  it("rejects a non-platform-admin caller and never creates anything", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({
      response: NextResponse.json({ error: "Platform administrator access required." }, { status: 403 }),
    });

    const response = await POST(request({ name: "Club A", ownerEmail: "owner@club.example" }));

    expect(response.status).toBe(403);
    expect(createOrganization).not.toHaveBeenCalled();
    expect(createInvite).not.toHaveBeenCalled();
  });

  it("creates the organization with NO members and invites the given owner -- the platform admin is never added as a member", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(createOrganization).mockResolvedValue({
      id: "org-new",
      name: "Club A",
      slug: null,
      created_by: "platform-admin-1",
      created_at: "now",
      updated_at: "now",
    });
    vi.mocked(createInvite).mockResolvedValue({ status: "invited" });

    const response = await POST(request({ name: "Club A", ownerEmail: "owner@club.example" }));

    expect(response.status).toBe(201);
    expect(createOrganization).toHaveBeenCalledWith({ name: "Club A", createdBy: "platform-admin-1" });
    expect(createOrganization).not.toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: expect.anything() }));
    expect(createInvite).toHaveBeenCalledWith("org-new", "owner@club.example", "owner", "platform-admin-1", expect.any(String));
  });

  it("points the owner invite's redirectTo at /auth/invite, not /auth/confirm", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(createOrganization).mockResolvedValue({
      id: "org-new",
      name: "Club A",
      slug: null,
      created_by: "platform-admin-1",
      created_at: "now",
      updated_at: "now",
    });
    vi.mocked(createInvite).mockResolvedValue({ status: "invited" });

    await POST(request({ name: "Club A", ownerEmail: "owner@club.example" }));

    const redirectTo = vi.mocked(createInvite).mock.calls[0][4];
    expect(redirectTo).toContain("/auth/invite");
    expect(redirectTo).not.toContain("/auth/confirm");
  });

  it("rolls back (deletes) the organization when the owner invite fails, so no 0-member workspace is left orphaned", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(createOrganization).mockResolvedValue({
      id: "org-new",
      name: "Club A",
      slug: null,
      created_by: "platform-admin-1",
      created_at: "now",
      updated_at: "now",
    });
    vi.mocked(createInvite).mockResolvedValue({ status: "error", error: "Auth invite failed" });
    vi.mocked(deleteOrganization).mockResolvedValue(undefined);

    const response = await POST(request({ name: "Club A", ownerEmail: "owner@club.example" }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("Auth invite failed");
    expect(body.organization).toBeUndefined();
    expect(deleteOrganization).toHaveBeenCalledWith("org-new");
  });

  it("still reports the invite error (not a rollback error) if the rollback delete itself fails", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(createOrganization).mockResolvedValue({
      id: "org-new",
      name: "Club A",
      slug: null,
      created_by: "platform-admin-1",
      created_at: "now",
      updated_at: "now",
    });
    vi.mocked(createInvite).mockResolvedValue({ status: "error", error: "Auth invite failed" });
    vi.mocked(deleteOrganization).mockRejectedValue(new Error("delete blew up"));

    const response = await POST(request({ name: "Club A", ownerEmail: "owner@club.example" }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("Auth invite failed");
  });

  it("rejects an invalid body without creating anything", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });

    const response = await POST(request({ name: "", ownerEmail: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(createOrganization).not.toHaveBeenCalled();
  });
});
