import { NextResponse } from "next/server";
import { sendTestCertificateEmail } from "@/lib/campaigns/emailDelivery";
import { getCampaign } from "@/lib/campaigns";
import { requireOrganizationContext } from "@/lib/auth/organizationGuard";
import { RATE_LIMITS } from "@/lib/rateLimit";

/**
 * Sends ONE test certificate email to the configured RESEND_TEST_EMAIL
 * address only -- never to a caller-supplied destination. This is a
 * deliberate security boundary (see the Phase 8/P0 security report): an
 * arbitrary-destination test-send is an open email-relay primitive once
 * exposed publicly, so the destination is fixed server-side and never
 * accepted from the request body.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/campaigns/[campaignId]/test-email">) {
  const guard = await requireOrganizationContext({ rateLimit: { key: "test-email", ...RATE_LIMITS.testEmail } });
  if ("response" in guard) return guard.response;

  const { campaignId } = await params;

  const campaign = await getCampaign(campaignId, guard.organizationId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const testEmail = process.env.RESEND_TEST_EMAIL;
  if (!testEmail) {
    return NextResponse.json(
      { error: "Test sending is not configured. Set RESEND_TEST_EMAIL in your environment before sending a test email." },
      { status: 400 },
    );
  }

  try {
    const result = await sendTestCertificateEmail({ campaignId, testEmail });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send test email." },
      { status: 500 },
    );
  }
}
