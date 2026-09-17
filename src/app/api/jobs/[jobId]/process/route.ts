import { NextResponse } from "next/server";
import { processJob } from "@/lib/jobs/processJob";
import { guardApiRoute } from "@/lib/auth/apiGuard";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { safeApiErrorMessage } from "@/lib/apiError";

/**
 * Trigger-independent worker endpoint: processes exactly one bounded
 * batch for whatever job this id points to, then returns. The only input
 * is the job id -- campaign, template, and rows are all resolved
 * server-side from the job record itself, never trusted from the caller.
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
