import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/organizationGuard", () => ({ requireOrganizationContext: vi.fn() }));
vi.mock("@/lib/campaigns", () => ({ getCampaign: vi.fn() }));
vi.mock("@/lib/campaigns/emailDelivery", () => ({ sendTestCertificateEmail: vi.fn() }));

import { requireOrganizationContext } from "@/lib/auth/organizationGuard";
import { getCampaign } from "@/lib/campaigns";
import { sendTestCertificateEmail } from "@/lib/campaigns/emailDelivery";
import { POST } from "./route";

const ORIGINAL_ENV = { ...process.env };
const ORG_CONTEXT = { user: { id: "user-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "member" as const };

beforeEach(() => {
  vi.mocked(requireOrganizationContext).mockResolvedValue(ORG_CONTEXT);
  vi.mocked(getCampaign).mockResolvedValue({ id: "c1", organization_id: "org-a" } as never);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
});

function params(campaignId: string) {
  return { params: Promise.resolve({ campaignId }) };
}

describe("POST /api/campaigns/[campaignId]/test-email", () => {
  it("requires authentication/workspace membership -- returns 403 and never sends anything", async () => {
    vi.mocked(requireOrganizationContext).mockResolvedValue({
      response: NextResponse.json({ error: "You don't belong to any workspace yet." }, { status: 403 }),
    });

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(response.status).toBe(403);
    expect(sendTestCertificateEmail).not.toHaveBeenCalled();
  });

  it("returns 404 without sending when the campaign doesn't belong to the caller's organization", async () => {
    vi.mocked(getCampaign).mockResolvedValue(null);

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(getCampaign).toHaveBeenCalledWith("c1", "org-a");
    expect(response.status).toBe(404);
    expect(sendTestCertificateEmail).not.toHaveBeenCalled();
  });

  it("ignores any caller-supplied destination and always sends to RESEND_TEST_EMAIL", async () => {
    process.env.RESEND_TEST_EMAIL = "dev@example.com";
    vi.mocked(sendTestCertificateEmail).mockResolvedValue({ messageId: "msg_1" });

    const request = new Request("http://x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testEmail: "attacker@evil.com" }),
    });
    const response = await POST(request, params("c1"));

    expect(response.status).toBe(200);
    expect(sendTestCertificateEmail).toHaveBeenCalledWith({ campaignId: "c1", testEmail: "dev@example.com" });
    expect(sendTestCertificateEmail).not.toHaveBeenCalledWith(expect.objectContaining({ testEmail: "attacker@evil.com" }));
  });

  it("never echoes RESEND_TEST_EMAIL back in the response body", async () => {
    process.env.RESEND_TEST_EMAIL = "dev@example.com";
    vi.mocked(sendTestCertificateEmail).mockResolvedValue({ messageId: "msg_1" });

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain("dev@example.com");
  });

  it("returns a clear 400 when RESEND_TEST_EMAIL is not configured, without calling the sender", async () => {
    delete process.env.RESEND_TEST_EMAIL;

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(response.status).toBe(400);
    expect(sendTestCertificateEmail).not.toHaveBeenCalled();
  });
});
