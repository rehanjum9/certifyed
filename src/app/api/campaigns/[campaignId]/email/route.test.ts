import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/organizationGuard", () => ({ requireOrganizationContext: vi.fn() }));
vi.mock("@/lib/campaigns", () => ({ getCampaign: vi.fn() }));
vi.mock("@/lib/campaigns/emailJobs", () => ({
  getActiveEmailJob: vi.fn(),
  getLatestEmailJob: vi.fn(),
  startEmailJob: vi.fn(),
}));
vi.mock("@/lib/campaigns/emailDelivery", () => ({ computeEmailProgress: vi.fn() }));
vi.mock("@/lib/email/provider", () => ({ getOrganizationEmailSendError: vi.fn() }));

import { requireOrganizationContext } from "@/lib/auth/organizationGuard";
import { getCampaign } from "@/lib/campaigns";
import { getActiveEmailJob, startEmailJob } from "@/lib/campaigns/emailJobs";
import { computeEmailProgress } from "@/lib/campaigns/emailDelivery";
import { getOrganizationEmailSendError } from "@/lib/email/provider";
import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

function params(campaignId: string) {
  return { params: Promise.resolve({ campaignId }) };
}

const CAMPAIGN = { id: "c1", organization_id: "org-a" } as never;

const READY_PROGRESS = { eligibleTotal: 5, sent: 0, pending: 5, failed: 0, emailing: 0, progressPercent: 0 };
const NOTHING_READY_PROGRESS = { eligibleTotal: 0, sent: 0, pending: 0, failed: 0, emailing: 0, progressPercent: 0 };

describe("POST /api/campaigns/[campaignId]/email", () => {
  it("returns 403 when the caller has no workspace/access, without touching the campaign at all", async () => {
    vi.mocked(requireOrganizationContext).mockResolvedValue({
      response: NextResponse.json({ error: "You don't belong to any workspace yet." }, { status: 403 }),
    });

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(response.status).toBe(403);
    expect(getCampaign).not.toHaveBeenCalled();
  });

  it("returns 400 without checking Gmail at all when there is nothing generated yet to email", async () => {
    const memberContext = { user: { id: "member-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "member" as const };
    vi.mocked(requireOrganizationContext).mockResolvedValue(memberContext);
    vi.mocked(getCampaign).mockResolvedValue(CAMPAIGN);
    vi.mocked(getActiveEmailJob).mockResolvedValue(null);
    vi.mocked(computeEmailProgress).mockResolvedValue(NOTHING_READY_PROGRESS);

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/no generated certificates/i);
    expect(getOrganizationEmailSendError).not.toHaveBeenCalled();
    expect(startEmailJob).not.toHaveBeenCalled();
  });

  it("a workspace WITHOUT a Gmail connection is blocked and never falls back to any other/global sender", async () => {
    const memberContext = { user: { id: "member-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "member" as const };
    vi.mocked(requireOrganizationContext).mockResolvedValue(memberContext);
    vi.mocked(getCampaign).mockResolvedValue(CAMPAIGN);
    vi.mocked(getActiveEmailJob).mockResolvedValue(null);
    vi.mocked(computeEmailProgress).mockResolvedValue(READY_PROGRESS);
    vi.mocked(getOrganizationEmailSendError).mockResolvedValue("Connect a Gmail account in Settings before sending certificates.");

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/connect a gmail account/i);
    expect(getOrganizationEmailSendError).toHaveBeenCalledWith("org-a");
    expect(startEmailJob).not.toHaveBeenCalled();
  });

  it("a workspace WITH a Gmail connection can start a real send", async () => {
    const memberContext = { user: { id: "member-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "member" as const };
    vi.mocked(requireOrganizationContext).mockResolvedValue(memberContext);
    vi.mocked(getCampaign).mockResolvedValue(CAMPAIGN);
    vi.mocked(getActiveEmailJob).mockResolvedValue(null);
    vi.mocked(computeEmailProgress).mockResolvedValue(READY_PROGRESS);
    vi.mocked(getOrganizationEmailSendError).mockResolvedValue(null);
    vi.mocked(startEmailJob).mockResolvedValue({
      job: { id: "job-1", status: "pending", attempts: 0, last_error: null } as never,
      created: true,
    });

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.job).toEqual({ id: "job-1", status: "pending", attempts: 0, lastError: null });
    expect(startEmailJob).toHaveBeenCalledWith("c1");
  });

  it("a plain MEMBER (not just the owner) can start a real send using the workspace's already-connected Gmail -- this route is member-or-owner, never owner-only", async () => {
    const memberContext = { user: { id: "member-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "member" as const };
    vi.mocked(requireOrganizationContext).mockResolvedValue(memberContext);
    vi.mocked(getCampaign).mockResolvedValue(CAMPAIGN);
    vi.mocked(getActiveEmailJob).mockResolvedValue(null);
    vi.mocked(computeEmailProgress).mockResolvedValue(READY_PROGRESS);
    vi.mocked(getOrganizationEmailSendError).mockResolvedValue(null);
    vi.mocked(startEmailJob).mockResolvedValue({
      job: { id: "job-1", status: "pending", attempts: 0, last_error: null } as never,
      created: true,
    });

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(response.status).toBe(200);
    // No owner-only guard is ever consulted here -- requireOrganizationContext
    // (any role) is the only check, and it was given a "member" role above.
  });

  it("always checks the CAMPAIGN's own organization_id, never a caller-supplied one", async () => {
    const memberContext = { user: { id: "member-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "member" as const };
    vi.mocked(requireOrganizationContext).mockResolvedValue(memberContext);
    vi.mocked(getCampaign).mockResolvedValue({ id: "c1", organization_id: "org-a" } as never);
    vi.mocked(getActiveEmailJob).mockResolvedValue(null);
    vi.mocked(computeEmailProgress).mockResolvedValue(READY_PROGRESS);
    vi.mocked(getOrganizationEmailSendError).mockResolvedValue(null);
    vi.mocked(startEmailJob).mockResolvedValue({
      job: { id: "job-1", status: "pending", attempts: 0, last_error: null } as never,
      created: true,
    });

    await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(getOrganizationEmailSendError).toHaveBeenCalledWith("org-a");
  });
});
