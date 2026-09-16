import { NextResponse } from "next/server";
import { generateCertificatesBatch } from "@/lib/campaigns/generation";

/**
 * Processes one bounded batch of pending rows for this campaign and
 * returns. Call repeatedly (manually from the UI today; a Phase 6
 * scheduler could call the same route later) until no pending rows
 * remain -- this route never loops over an entire campaign itself.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/campaigns/[campaignId]/generate">,
) {
  const { campaignId } = await params;

  let batchSize: number | undefined;
  try {
    const body = await request.json();
    batchSize = typeof body?.batchSize === "number" ? body.batchSize : undefined;
  } catch {
    // No body (or invalid JSON) is fine -- fall back to the default batch size.
  }

  try {
    const result = await generateCertificatesBatch(campaignId, batchSize);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate certificates." },
      { status: 500 },
    );
  }
}
