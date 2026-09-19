import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/organizationGuard", () => ({ requireOrganizationContext: vi.fn() }));
vi.mock("@/lib/campaigns", () => ({ getCampaign: vi.fn() }));
vi.mock("@/lib/campaigns/jobs", () => ({
  getActiveGenerationJob: vi.fn(),
  getLatestGenerationJob: vi.fn(),
  startGenerationJob: vi.fn(),
}));
vi.mock("@/lib/campaigns/generation", () => ({ computeCampaignProgress: vi.fn() }));

import { requireOrganizationContext } from "@/lib/auth/organizationGuard";
import { getCampaign } from "@/lib/campaigns";
import { getActiveGenerationJob, startGenerationJob } from "@/lib/campaigns/jobs";
import { computeCampaignProgress } from "@/lib/campaigns/generation";
import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

function params(campaignId: string) {
  return { params: Promise.resolve({ campaignId }) };
}

const ORG_CONTEXT = { user: { id: "user-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "member" as const };

const PROGRESS = {
  eligibleTotal: 5,
  invalidImportedTotal: 0,
  generated: 0,
  failed: 0,
  pending: 5,
  generating: 0,
  progressPercent: 0,
};

describe("POST /api/campaigns/[campaignId]/generation", () => {
  it("returns 403 when the caller has no workspace/access, without touching the campaign at all", async () => {
    vi.mocked(requireOrganizationContext).mockResolvedValue({
      response: NextResponse.json({ error: "You don't belong to any workspace yet." }, { status: 403 }),
    });

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(response.status).toBe(403);
    expect(getCampaign).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    vi.mocked(requireOrganizationContext).mockResolvedValue({
      response: NextResponse.json({ error: "Too many requests." }, { status: 429 }),
    });

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(response.status).toBe(429);
    expect(getCampaign).not.toHaveBeenCalled();
  });

  it("returns 404 when the campaign doesn't belong to the caller's organization", async () => {
    vi.mocked(requireOrganizationContext).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(getCampaign).mockResolvedValue(null);

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(getCampaign).toHaveBeenCalledWith("c1", "org-a");
    expect(response.status).toBe(404);
  });

  it("starts a job and returns it when authenticated, a member of the campaign's organization, and rows are pending", async () => {
    vi.mocked(requireOrganizationContext).mockResolvedValue(ORG_CONTEXT);
    vi.mocked(getCampaign).mockResolvedValue({ id: "c1", organization_id: "org-a" } as never);
    vi.mocked(getActiveGenerationJob).mockResolvedValue(null);
    vi.mocked(computeCampaignProgress).mockResolvedValue(PROGRESS);
    vi.mocked(startGenerationJob).mockResolvedValue({
      job: {
        id: "job-1",
        status: "pending",
        attempts: 0,
        last_error: null,
        campaign_id: "c1",
        job_type: "generate_pdfs",
        batch_start: 0,
        batch_end: 10,
        locked_at: null,
        created_at: "now",
        updated_at: "now",
      },
      created: true,
    } as never);

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.created).toBe(true);
    expect(body.job.id).toBe("job-1");
  });
});
