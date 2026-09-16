import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/campaigns";
import { getActiveEmailJob, getLatestEmailJob, startEmailJob } from "@/lib/campaigns/emailJobs";
import { computeEmailProgress } from "@/lib/campaigns/emailDelivery";

function toJobInfo(job: { id: string; status: string; attempts: number; last_error: string | null } | null) {
  if (!job) return null;
  return { id: job.id, status: job.status, attempts: job.attempts, lastError: job.last_error };
}

/**
 * Read-only status: the latest email job (if any) plus fresh,
 * database-derived email progress. Mirrors GET .../generation.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/campaigns/[campaignId]/email">) {
  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const [job, progress] = await Promise.all([getLatestEmailJob(campaignId), computeEmailProgress(campaignId)]);

  return NextResponse.json({ job: toJobInfo(job), progress });
}

/**
 * Starts certificate email delivery: creates one send_emails job if none
 * is already active for this campaign, or returns the existing active one
 * unchanged. Does not send anything itself -- the caller follows up with
 * POST /api/jobs/[jobId]/process to actually run batches.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/campaigns/[campaignId]/email">) {
  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const [active, progress] = await Promise.all([getActiveEmailJob(campaignId), computeEmailProgress(campaignId)]);

  if (!active && progress.pending === 0 && progress.emailing === 0) {
    return NextResponse.json({ error: "No generated certificates are ready to email yet." }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json(
      {
        error:
          "Email sending is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL (a verified Resend sending domain) in your environment before sending certificates.",
      },
      { status: 400 },
    );
  }

  const { job, created } = await startEmailJob(campaignId);
  return NextResponse.json({ job: toJobInfo(job), created });
}
