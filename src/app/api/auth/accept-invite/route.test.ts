import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/apiGuard", () => ({ guardApiRoute: vi.fn() }));
vi.mock("@/lib/organizations/invites", () => ({ finalizeInviteAcceptance: vi.fn() }));

const cookieSetMock = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ set: cookieSetMock }) }));

import { guardApiRoute } from "@/lib/auth/apiGuard";
import { finalizeInviteAcceptance } from "@/lib/organizations/invites";
import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/accept-invite", () => {
  it("requires authentication -- returns the guard's own response and never calls finalizeInviteAcceptance", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(finalizeInviteAcceptance).not.toHaveBeenCalled();
  });

  it("derives identity from the authenticated session -- never from a request body (none is even read)", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({ user: { id: "user-1", email: "person@club.example" } });
    vi.mocked(finalizeInviteAcceptance).mockResolvedValue({ status: "accepted", organizationId: "org-a" });

    await POST();

    expect(finalizeInviteAcceptance).toHaveBeenCalledWith("user-1", "person@club.example");
  });

  it("sets the active-workspace cookie to the invite's own organization on success", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({ user: { id: "user-1", email: "person@club.example" } });
    vi.mocked(finalizeInviteAcceptance).mockResolvedValue({ status: "accepted", organizationId: "org-a" });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(cookieSetMock).toHaveBeenCalledWith("active_org_id", "org-a", expect.objectContaining({ httpOnly: true }));
  });

  it("returns a safe, non-technical 404 and sets no cookie when there is no pending invite and no existing membership", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({ user: { id: "user-1", email: "nobody@club.example" } });
    vi.mocked(finalizeInviteAcceptance).mockResolvedValue({ status: "no_pending_invite" });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/invalid or has expired/i);
    expect(body.error).not.toMatch(/token|jwt|supabase/i);
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("treats an already-member re-visit as a 200 success without touching the active-workspace cookie", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({ user: { id: "user-1", email: "person@club.example" } });
    vi.mocked(finalizeInviteAcceptance).mockResolvedValue({ status: "already_member" });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("rejects when the authenticated session somehow has no email, without calling finalizeInviteAcceptance", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({ user: { id: "user-1", email: null } });

    const response = await POST();

    expect(response.status).toBe(400);
    expect(finalizeInviteAcceptance).not.toHaveBeenCalled();
  });

  it("never includes a raw access_token or refresh_token in the response body", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({ user: { id: "user-1", email: "person@club.example" } });
    vi.mocked(finalizeInviteAcceptance).mockResolvedValue({ status: "accepted", organizationId: "org-a" });

    const response = await POST();
    const raw = JSON.stringify(await response.json());

    expect(raw).not.toMatch(/access_token|refresh_token/i);
  });
});
