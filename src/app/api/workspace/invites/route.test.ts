import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/organizationGuard", () => ({ requireOrganizationAdmin: vi.fn() }));
vi.mock("@/lib/organizations/invites", () => ({ createInvite: vi.fn() }));

import { requireOrganizationAdmin } from "@/lib/auth/organizationGuard";
import { createInvite } from "@/lib/organizations/invites";
import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

const ORG_CONTEXT = { user: { id: "admin-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "admin" as const };

function request(body: unknown) {
  return new Request("http://localhost/api/workspace/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/workspace/invites", () => {
  it("rejects a normal member (requireOrganizationAdmin's own 403) and never sends an invite", async () => {
    vi.mocked(requireOrganizationAdmin).mockResolvedValue({
      response: NextResponse.json({ error: "Only a workspace owner or admin can perform this action." }, { status: 403 }),
    });

    const response = await POST(request({ email: "new@club.example", role: "member" }));

    expect(response.status).toBe(403);
    expect(createInvite).not.toHaveBeenCalled();
  });

  it("invites into the caller's own active organization -- never a caller-supplied organization id", async () => {
    vi.mocked(requireOrganizationAdmin).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(createInvite).mockResolvedValue({ status: "invited" });

    // Even if the client tried to smuggle an organizationId in the body, the
    // route never reads one -- it only ever uses guard.organizationId.
    const response = await POST(request({ email: "new@club.example", role: "member", organizationId: "org-b" }));

    expect(response.status).toBe(201);
    expect(createInvite).toHaveBeenCalledWith("org-a", "new@club.example", "member", "admin-1", expect.any(String));
  });

  it("points the invite's redirectTo at /auth/invite -- Supabase's default invite email uses the implicit token flow, which /auth/confirm cannot handle", async () => {
    vi.mocked(requireOrganizationAdmin).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(createInvite).mockResolvedValue({ status: "invited" });

    await POST(request({ email: "new@club.example", role: "member" }));

    const redirectTo = vi.mocked(createInvite).mock.calls[0][4];
    expect(redirectTo).toContain("/auth/invite");
    expect(redirectTo).not.toContain("/auth/confirm");
  });

  it("rejects an invalid email without inviting anything", async () => {
    vi.mocked(requireOrganizationAdmin).mockResolvedValue(ORG_CONTEXT);

    const response = await POST(request({ email: "not-an-email", role: "member" }));

    expect(response.status).toBe(400);
    expect(createInvite).not.toHaveBeenCalled();
  });

  it("reports a 409 when the invitee is already a member, without erroring", async () => {
    vi.mocked(requireOrganizationAdmin).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(createInvite).mockResolvedValue({ status: "already_member" });

    const response = await POST(request({ email: "existing@club.example", role: "member" }));

    expect(response.status).toBe(409);
  });
});
