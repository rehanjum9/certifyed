import { NextResponse } from "next/server";
import { processGenerationJob } from "@/lib/campaigns/generation";

/**
 * Trigger-independent worker endpoint: processes exactly one bounded
 * batch for whatever job this id points to, then returns. The only input
 * is the job id -- campaign, template, and rows are all resolved
 * server-side from the job record itself, never trusted from the caller.
 *
 * Nothing about this route assumes who or what called it. Today that's a
 * browser polling loop; later it could be Vercel Cron, another scheduler,
 * or a separate worker service hitting the same URL -- the processing
 * logic (lib/campaigns/generation.ts) doesn't change either way.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/jobs/[jobId]/process">) {
  const { jobId } = await params;

  try {
    const result = await processGenerationJob(jobId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process job." },
      { status: 500 },
    );
  }
}
