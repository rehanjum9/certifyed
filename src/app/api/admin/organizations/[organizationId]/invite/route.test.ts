import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/organizationGuard", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/organizations/invites", () => ({ resendPendingInvite: vi.fn(), cancelPendingInvite: vi.fn() }));

import { requirePlatformAdmin } from "@/lib/auth/organizationGuard";
import { resendPendingInvite, cancelPendingInvite } from "@/lib/organizations/invites";
import { POST, DELETE } from "./route";

const VALID_ORG_ID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.clearAllMocks();
});

function params(organizationId: string) {
  return { params: Promise.resolve({ organizationId }) };
}

describe("POST /api/admin/organizations/[organizationId]/invite (resend)", () => {
  it("rejects a non-platform-admin caller and never resends anything", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({
      response: NextResponse.json({ error: "Platform administrator access required." }, { status: 403 }),
    });

    const response = await POST(new Request("http://localhost/x", { method: "POST" }), params(VALID_ORG_ID));

    expect(response.status).toBe(403);
    expect(resendPendingInvite).not.toHaveBeenCalled();
  });

  it("resends a pending invite and points redirectTo at /auth/invite", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(resendPendingInvite).mockResolvedValue({ status: "resent" });

    const response = await POST(new Request("http://localhost/x", { method: "POST" }), params(VALID_ORG_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "resent" });
    const [orgIdArg, redirectToArg] = vi.mocked(resendPendingInvite).mock.calls[0];
    expect(orgIdArg).toBe(VALID_ORG_ID);
    expect(redirectToArg).toContain("/auth/invite");
  });

  it("returns 409 when the invite was already accepted", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(resendPendingInvite).mockResolvedValue({ status: "already_accepted" });

    const response = await POST(new Request("http://localhost/x", { method: "POST" }), params(VALID_ORG_ID));

    expect(response.status).toBe(409);
  });

  it("returns 404 when the workspace has no invite at all", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(resendPendingInvite).mockResolvedValue({ status: "not_found" });

    const response = await POST(new Request("http://localhost/x", { method: "POST" }), params(VALID_ORG_ID));

    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed workspace id without calling resendPendingInvite", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });

    const response = await POST(new Request("http://localhost/x", { method: "POST" }), params("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(resendPendingInvite).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/organizations/[organizationId]/invite (cancel)", () => {
  it("rejects a non-platform-admin caller and never cancels anything", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({
      response: NextResponse.json({ error: "Platform administrator access required." }, { status: 403 }),
    });

    const response = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params(VALID_ORG_ID));

    expect(response.status).toBe(403);
    expect(cancelPendingInvite).not.toHaveBeenCalled();
  });

  it("cancels a still-pending invite", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(cancelPendingInvite).mockResolvedValue({ status: "cancelled" });

    const response = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params(VALID_ORG_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "cancelled" });
    expect(cancelPendingInvite).toHaveBeenCalledWith(VALID_ORG_ID);
  });

  it("refuses (409) to cancel an already-accepted invite -- it must not be treated as still pending", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(cancelPendingInvite).mockResolvedValue({ status: "already_accepted" });

    const response = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params(VALID_ORG_ID));

    expect(response.status).toBe(409);
  });

  it("returns 404 when the workspace has no invite at all", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });
    vi.mocked(cancelPendingInvite).mockResolvedValue({ status: "not_found" });

    const response = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params(VALID_ORG_ID));

    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed workspace id without calling cancelPendingInvite", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({ user: { id: "platform-admin-1", email: null } });

    const response = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(cancelPendingInvite).not.toHaveBeenCalled();
  });
});
