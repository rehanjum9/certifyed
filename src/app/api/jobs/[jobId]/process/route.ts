import { NextResponse } from "next/server";
import { processJob, getJobOrganizationId } from "@/lib/jobs/processJob";
import { guardApiRoute } from "@/lib/auth/apiGuard";
import { getMembership } from "@/lib/organizations/organizations";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { safeApiErrorMessage } from "@/lib/apiError";

/**
 * Trigger-independent worker endpoint: processes exactly one bounded
 * batch for whatever job this id points to, then returns. Campaign,
 * template, and rows are all resolved server-side from the job record
 * itself, never trusted from the caller -- but WHICH organization may
 * trigger this job is still checked here, every call: the job's
 * organization is resolved fresh from its persisted campaign
 * (getJobOrganizationId), never from the caller's active-workspace cookie
 * (architecture report, item 28) -- a job started by Club A can never be
 * advanced by a Club B member who happens to guess/observe its id, even
 * though this route accepts only a bare job id as input.
 *
 * Authentication is checked FIRST, before the job is even looked up, so an
 * unauthenticated caller learns nothing about whether a given job id
 * exists (both "doesn't exist" and "exists but isn't yours" would
 * otherwise be distinguishable by response before vs. after that lookup).
 *
 * processJob dispatches to the generation or email pipeline based on the
 * job's own job_type, so this route doesn't change between phases.
 *
 * Nothing about this route assumes who or what called it. Today that's a
 * browser polling loop; later it could be Vercel Cron, another scheduler,
 * or a separate worker service hitting the same URL -- the processing
 * logic doesn't change either way.
 *
 * maxDuration: one call processes at most one bounded batch -- up to
 * MAX_BATCH_SIZE (20) certificate generations or MAX_EMAIL_BATCH_SIZE (10)
 * email sends (lib/campaigns/generation.ts / emailDelivery.ts). 60s gives
 * comfortable headroom for either (PDF rendering is typically well under a
 * second per row; email sends include a provider API round-trip) while
 * staying within Vercel's default Hobby-plan function limit, so this route
 * "just works" without requiring a paid plan or a longer-running worker.
 */
export const maxDuration = 60;

export async function POST(_request: Request, { params }: RouteContext<"/api/jobs/[jobId]/process">) {
  const guard = await guardApiRoute({ rateLimit: { key: "job-process", ...RATE_LIMITS.jobProcess } });
  if ("response" in guard) return guard.response;

  const { jobId } = await params;

  const jobOrganizationId = await getJobOrganizationId(jobId);
  if (!jobOrganizationId) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const membership = await getMembership(jobOrganizationId, guard.user.id);
  if (!membership) {
    // Deliberately the same 404 as "job not found" -- a job belonging to a
    // workspace the caller isn't a member of is indistinguishable from one
    // that never existed (see lib/apiError.ts / architecture report, item 30).
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  try {
    const result = await processJob(jobId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Failed to process job. Please try again.") },
      { status: 500 },
    );
  }
}
