import { NextResponse } from "next/server";
import { retryFailedRows } from "@/lib/campaigns/generation";
import { getCampaign } from "@/lib/campaigns";
import { requireOrganizationContext } from "@/lib/auth/organizationGuard";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { safeApiErrorMessage } from "@/lib/apiError";

/**
 * Re-queues failed rows that would now pass eligibility back to "pending"
 * (see lib/campaigns/generation.ts). Does not generate anything itself --
 * call POST .../generate afterward to actually process the requeued rows.
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/campaigns/[campaignId]/retry-failed">,
) {
  const guard = await requireOrganizationContext({ rateLimit: { key: "retry-generation", ...RATE_LIMITS.retryGeneration } });
  if ("response" in guard) return guard.response;

  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId, guard.organizationId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  try {
    const result = await retryFailedRows(campaignId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Failed to retry failed rows. Please try again.") },
      { status: 500 },
    );
  }
}
