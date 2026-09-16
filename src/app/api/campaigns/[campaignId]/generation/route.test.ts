import { describe, expect, it, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/apiGuard", () => ({ guardApiRoute: vi.fn() }));
vi.mock("@/lib/campaigns", () => ({ getCampaign: vi.fn() }));
vi.mock("@/lib/campaigns/jobs", () => ({
  getActiveGenerationJob: vi.fn(),
  getLatestGenerationJob: vi.fn(),
  startGenerationJob: vi.fn(),
}));
vi.mock("@/lib/campaigns/generation", () => ({ computeCampaignProgress: vi.fn() }));

import { guardApiRoute } from "@/lib/auth/apiGuard";
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
  it("returns 401 when unauthenticated, without touching the campaign at all", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    });

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(response.status).toBe(401);
    expect(getCampaign).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({
      response: NextResponse.json({ error: "Too many requests." }, { status: 429 }),
    });

    const response = await POST(new Request("http://x", { method: "POST" }), params("c1"));

    expect(response.status).toBe(429);
    expect(getCampaign).not.toHaveBeenCalled();
  });

  it("starts a job and returns it when authenticated and rows are pending", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({ user: { id: "operator-1", email: null } });
    vi.mocked(getCampaign).mockResolvedValue({ id: "c1" } as never);
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
