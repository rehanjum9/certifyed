import { NextResponse } from "next/server";
import { sendTestCertificateEmail } from "@/lib/campaigns/emailDelivery";

/**
 * Sends ONE test certificate email -- to a manually entered address, or
 * the configured RESEND_TEST_EMAIL developer default -- using an already
 * generated certificate. Never mutates the source row's status/
 * email_message_id, so it's safe to call repeatedly before a real bulk
 * send to verify sender/domain/attachment formatting.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/campaigns/[campaignId]/test-email">) {
  const { campaignId } = await params;

  let body: { testEmail?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No JSON body supplied -- fall back to the configured developer address below.
  }

  const testEmail = body.testEmail?.trim() || process.env.RESEND_TEST_EMAIL;
  if (!testEmail) {
    return NextResponse.json(
      { error: "Enter a test email address, or configure RESEND_TEST_EMAIL for a default developer address." },
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
