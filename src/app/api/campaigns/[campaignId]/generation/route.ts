import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/campaigns";
import { getActiveGenerationJob, getLatestGenerationJob, startGenerationJob } from "@/lib/campaigns/jobs";
import { computeCampaignProgress } from "@/lib/campaigns/generation";

function toJobInfo(job: { id: string; status: string; attempts: number; last_error: string | null } | null) {
  if (!job) return null;
  return { id: job.id, status: job.status, attempts: job.attempts, lastError: job.last_error };
}

/**
 * Read-only status: the latest generation job (if any) plus fresh,
 * database-derived progress. Used for the initial page load, the
 * "Refresh status" button, and by other tabs/observers -- never mutates
 * anything, so it's always safe to call regardless of whether a worker is
 * mid-batch elsewhere.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/campaigns/[campaignId]/generation">) {
  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const [job, progress] = await Promise.all([getLatestGenerationJob(campaignId), computeCampaignProgress(campaignId)]);

  return NextResponse.json({
    job: toJobInfo(job),
    campaignStatus: campaign.status,
    progress,
  });
}

/**
 * Starts certificate generation: creates one job if none is already
 * active for this campaign, or returns the existing active one
 * unchanged. Does not process anything itself -- the caller follows up
 * with POST /api/jobs/[jobId]/process to actually run batches.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/campaigns/[campaignId]/generation">) {
  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const [active, progress] = await Promise.all([
    getActiveGenerationJob(campaignId),
    computeCampaignProgress(campaignId),
  ]);

  if (!active && progress.pending === 0 && progress.generating === 0) {
    return NextResponse.json({ error: "No pending rows to generate." }, { status: 400 });
  }

  const { job, created } = await startGenerationJob(campaignId);
  return NextResponse.json({ job: toJobInfo(job), created });
}
