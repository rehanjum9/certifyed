import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/organizationGuard", () => ({ requireOrganizationOwner: vi.fn() }));
vi.mock("@/lib/organizations/organizations", () => ({ removeOrganizationMember: vi.fn() }));

import { requireOrganizationOwner } from "@/lib/auth/organizationGuard";
import { removeOrganizationMember } from "@/lib/organizations/organizations";
import { DELETE } from "./route";

const ORG_CONTEXT = { user: { id: "owner-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "owner" as const };

afterEach(() => {
  vi.clearAllMocks();
});

function params(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

describe("DELETE /api/workspace/members/[userId]", () => {
  it("rejects a normal member (requireOrganizationOwner's own 403) and never removes anyone -- a member cannot remove themselves or anyone else", async () => {
    vi.mocked(requireOrganizationOwner).mockResolvedValue({
      response: NextResponse.json({ error: "Only the workspace owner can perform this action." }, { status: 403 }),
    });

    const response = await DELETE(new Request("http://x", { method: "DELETE" }), params("member-1"));

    expect(response.status).toBe(403);
    expect(removeOrganizationMember).not.toHaveBeenCalled();
  });

  it("lets the owner remove a plain member", async () => {
    vi.mocked(requireOrganizationOwner).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(removeOrganizationMember).mockResolvedValue({ ok: true });

    const response = await DELETE(new Request("http://x", { method: "DELETE" }), params("member-1"));

    expect(response.status).toBe(200);
    expect(removeOrganizationMember).toHaveBeenCalledWith("org-a", "member-1");
  });

  it("refuses (409) to remove the owner through this endpoint -- ownership must be transferred first", async () => {
    vi.mocked(requireOrganizationOwner).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(removeOrganizationMember).mockResolvedValue({ ok: false, reason: "owner" });

    const response = await DELETE(new Request("http://x", { method: "DELETE" }), params("owner-1"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/transfer ownership/i);
  });

  it("returns 404 for a user with no membership row", async () => {
    vi.mocked(requireOrganizationOwner).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(removeOrganizationMember).mockResolvedValue({ ok: false, reason: "not_found" });

    const response = await DELETE(new Request("http://x", { method: "DELETE" }), params("nobody"));

    expect(response.status).toBe(404);
  });
});
