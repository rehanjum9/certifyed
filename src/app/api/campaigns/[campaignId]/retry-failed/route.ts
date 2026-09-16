import { NextResponse } from "next/server";
import { retryFailedRows } from "@/lib/campaigns/generation";

/**
 * Re-queues failed rows that would now pass eligibility back to "pending"
 * (see lib/campaigns/generation.ts). Does not generate anything itself --
 * call POST .../generate afterward to actually process the requeued rows.
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/campaigns/[campaignId]/retry-failed">,
) {
  const { campaignId } = await params;

  try {
    const result = await retryFailedRows(campaignId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retry failed rows." },
      { status: 500 },
    );
  }
}
