import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/organizationGuard", () => ({ requireOrganizationOwner: vi.fn() }));
vi.mock("@/lib/organizations/organizations", () => ({ transferOrganizationOwnership: vi.fn() }));

import { requireOrganizationOwner } from "@/lib/auth/organizationGuard";
import { transferOrganizationOwnership } from "@/lib/organizations/organizations";
import { POST } from "./route";

const ORG_CONTEXT = { user: { id: "owner-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "owner" as const };
const NEW_OWNER_ID = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  vi.clearAllMocks();
});

function request(body: unknown) {
  return new Request("http://localhost/api/workspace/transfer-ownership", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/workspace/transfer-ownership", () => {
  it("rejects a normal member -- only the current owner may initiate a transfer", async () => {
    vi.mocked(requireOrganizationOwner).mockResolvedValue({
      response: NextResponse.json({ error: "Only the workspace owner can perform this action." }, { status: 403 }),
    });

    const response = await POST(request({ newOwnerUserId: NEW_OWNER_ID }));

    expect(response.status).toBe(403);
    expect(transferOrganizationOwnership).not.toHaveBeenCalled();
  });

  it("platform admin status alone does not grant this -- requireOrganizationOwner is the only gate, and a platform admin who isn't this workspace's owner still gets 403", async () => {
    // Simulated exactly like the plain-member case above: from this route's
    // perspective there is no separate platform-admin branch at all --
    // requireOrganizationOwner (workspace membership only) is the sole
    // check, so a platform admin with no real ownership of this workspace
    // is rejected the same way anyone else would be.
    vi.mocked(requireOrganizationOwner).mockResolvedValue({
      response: NextResponse.json({ error: "Only the workspace owner can perform this action." }, { status: 403 }),
    });

    const response = await POST(request({ newOwnerUserId: NEW_OWNER_ID }));

    expect(response.status).toBe(403);
    expect(transferOrganizationOwnership).not.toHaveBeenCalled();
  });

  it("transfers ownership using the caller's own authenticated id as the current owner -- never anything from the request body", async () => {
    vi.mocked(requireOrganizationOwner).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(transferOrganizationOwnership).mockResolvedValue({ ok: true });

    const response = await POST(request({ newOwnerUserId: NEW_OWNER_ID, currentOwnerUserId: "attacker-supplied-id" }));

    expect(response.status).toBe(200);
    expect(transferOrganizationOwnership).toHaveBeenCalledWith("org-a", "owner-1", NEW_OWNER_ID);
  });

  it("rejects a malformed newOwnerUserId without calling transferOrganizationOwnership", async () => {
    vi.mocked(requireOrganizationOwner).mockResolvedValue(ORG_CONTEXT);

    const response = await POST(request({ newOwnerUserId: "not-a-uuid" }));

    expect(response.status).toBe(400);
    expect(transferOrganizationOwnership).not.toHaveBeenCalled();
  });

  it("returns 404 when the chosen new owner isn't a member of this workspace", async () => {
    vi.mocked(requireOrganizationOwner).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(transferOrganizationOwnership).mockResolvedValue({ ok: false, reason: "new_owner_not_found" });

    const response = await POST(request({ newOwnerUserId: NEW_OWNER_ID }));

    expect(response.status).toBe(404);
  });

  it("returns 400 when transferring to yourself", async () => {
    vi.mocked(requireOrganizationOwner).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(transferOrganizationOwnership).mockResolvedValue({ ok: false, reason: "same_user" });

    const response = await POST(request({ newOwnerUserId: NEW_OWNER_ID }));

    expect(response.status).toBe(400);
  });
});
