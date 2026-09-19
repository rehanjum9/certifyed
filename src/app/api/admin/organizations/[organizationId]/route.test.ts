import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/organizationGuard", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/organizations/organizations", () => ({ deleteOrganizationSafely: vi.fn() }));

import { requirePlatformAdmin } from "@/lib/auth/organizationGuard";
import { deleteOrganizationSafely } from "@/lib/organizations/organizations";
import { DELETE } from "./route";

const VALID_ORG_ID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.clearAllMocks();
});

function params(organizationId: string) {
  return { params: Promise.resolve({ organizationId }) };
}

describe("DELETE /api/admin/organizations/[organizationId]", () => {
  it("rejects a non-platform-admin caller and never attempts deletion", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({
      response: NextResponse.json({ error: "Platform administrator access required." }, { status: 403 }),
    });

    const response = await DELETE(new Request("http://x", { method: "DELETE" }), params(VALID_ORG_ID));

    expect(response.status).toBe(403);
    expect(deleteOrganizationSafely).not.toHaveBeenCalled();
  });

  it("deletes an empty workspace for a platform admin", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(deleteOrganizationSafely).mockResolvedValue({ ok: true });

    const response = await DELETE(new Request("http://x", { method: "DELETE" }), params(VALID_ORG_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(deleteOrganizationSafely).toHaveBeenCalledWith(VALID_ORG_ID);
  });

  it("blocks deletion and returns a clear message when the workspace owns templates/campaigns/fonts", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(deleteOrganizationSafely).mockResolvedValue({
      ok: false,
      reason: "has_resources",
      counts: { templates: 1, campaigns: 0, fonts: 0 },
    });

    const response = await DELETE(new Request("http://x", { method: "DELETE" }), params(VALID_ORG_ID));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/templates, campaigns, or custom fonts/i);
    expect(body.counts).toEqual({ templates: 1, campaigns: 0, fonts: 0 });
  });

  it("returns 404 for a workspace that doesn't exist", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(deleteOrganizationSafely).mockResolvedValue({ ok: false, reason: "not_found" });

    const response = await DELETE(new Request("http://x", { method: "DELETE" }), params(VALID_ORG_ID));

    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed workspace id without ever calling deleteOrganizationSafely", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });

    const response = await DELETE(new Request("http://x", { method: "DELETE" }), params("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(deleteOrganizationSafely).not.toHaveBeenCalled();
  });
});
