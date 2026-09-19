import { NextResponse } from "next/server";
import { retryFailedEmails } from "@/lib/campaigns/emailDelivery";
import { getCampaign } from "@/lib/campaigns";
import { requireOrganizationContext } from "@/lib/auth/organizationGuard";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { safeApiErrorMessage } from "@/lib/apiError";

/**
 * Re-queues rows whose *email* delivery failed (see lib/campaigns/
 * emailDelivery.ts) back to "generated". Does not send anything itself --
 * call POST .../email afterward (or continue an existing job) to actually
 * process the requeued rows.
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/campaigns/[campaignId]/retry-failed-emails">,
) {
  const guard = await requireOrganizationContext({ rateLimit: { key: "retry-email", ...RATE_LIMITS.retryEmail } });
  if ("response" in guard) return guard.response;

  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId, guard.organizationId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  try {
    const result = await retryFailedEmails(campaignId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Failed to retry failed emails. Please try again.") },
      { status: 500 },
    );
  }
}
