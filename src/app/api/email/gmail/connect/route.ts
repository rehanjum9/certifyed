import { NextResponse } from "next/server";
import { requireOrganizationAdmin } from "@/lib/auth/organizationGuard";
import { createGmailOAuthClient, GMAIL_SEND_SCOPE, GMAIL_IDENTITY_SCOPES } from "@/lib/email/gmailClient";
import { createOAuthState } from "@/lib/email/gmailOAuth";
import { RATE_LIMITS } from "@/lib/rateLimit";

/**
 * Workspace-admin-only: starts the Gmail OAuth consent flow for the
 * caller's ACTIVE workspace. Requests the minimum sending scope
 * (gmail.send) plus the minimum identity scopes needed to read back which
 * Google account was actually authorized (openid + userinfo.email -- see
 * lib/email/gmailClient.ts#getAuthorizedAccountEmail), and binds a
 * short-lived, single-use, database-backed state token (see
 * lib/email/gmailOAuth.ts) to this organization + this user, replacing the
 * previous cookie-only CSRF token (architecture report, item 16).
 */
export async function GET() {
  const guard = await requireOrganizationAdmin({ rateLimit: { key: "gmail-connect", ...RATE_LIMITS.gmailConnect } });
  if ("response" in guard) return guard.response;

  let oauth2Client;
  try {
    oauth2Client = createGmailOAuthClient();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gmail is not configured." },
      { status: 400 },
    );
  }

  const state = await createOAuthState(guard.organizationId, guard.user.id);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [GMAIL_SEND_SCOPE, ...GMAIL_IDENTITY_SCOPES],
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(authUrl);
}
