import { NextResponse, type NextRequest } from "next/server";
import { guardApiRoute } from "@/lib/auth/apiGuard";
import { getMembership } from "@/lib/organizations/organizations";
import { createGmailOAuthClient, getAuthorizedAccountEmail } from "@/lib/email/gmailClient";
import { consumeOAuthState } from "@/lib/email/gmailOAuth";
import { saveEmailConnection } from "@/lib/email/connections";

function htmlPage(title: string, bodyHtml: string, status: number): NextResponse {
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>${title}</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 48px auto; color: #1e293b;">
  <p style="font-family: monospace; color: #059669; font-weight: 600;">CERTIFYED_</p>
  ${bodyHtml}
</body>
</html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function errorPage(message: string): NextResponse {
  return htmlPage(
    "Gmail connection failed",
    `<h1>Gmail connection failed</h1><p>${message}</p><p>Return to <a href="/settings">Settings</a> to try again.</p>`,
    400,
  );
}

/**
 * Workspace-scoped OAuth callback (architecture report, items 15-18).
 *
 * - Requires the same authenticated session as every other route
 *   (guardApiRoute) -- an unauthenticated request never reaches the state
 *   check at all.
 * - The `state` param is validated against a short-lived, single-use,
 *   database-backed record (consumeOAuthState): it must exist, not be
 *   expired, not already be consumed, AND belong to the currently
 *   authenticated user -- `?organizationId=...` or any other
 *   client-supplied value is never trusted; the organization this
 *   connects to comes ONLY from that state record.
 * - The caller's owner role in that organization is re-checked here (not
 *   just at /connect time) in case it changed in between -- Gmail
 *   connection management is owner-only (see requireOrganizationOwner).
 * - The connected account's email is read from Google's own signed ID
 *   token (getAuthorizedAccountEmail), never typed by the user -- no
 *   From-address spoofing.
 * - The refresh token is encrypted (lib/crypto/secretBox.ts) before it
 *   ever reaches the database, and is NEVER printed, logged, or included
 *   in this response -- unlike the previous single-operator version of
 *   this route, which printed it to the server terminal for manual setup.
 *   That one-time-setup mechanism is fully removed; every workspace now
 *   connects its own account through this same self-service flow.
 */
export async function GET(request: NextRequest) {
  const guard = await guardApiRoute();
  if ("response" in guard) return guard.response;

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code) return errorPage("Google did not return an authorization code.");
  if (!state) return errorPage("Missing OAuth state. Start the connection again from Settings.");

  const stateResult = await consumeOAuthState(state, guard.user.id);
  if (!stateResult.ok) {
    const reasonMessage: Record<typeof stateResult.reason, string> = {
      not_found: "This connection request wasn't recognized.",
      expired: "This connection request has expired.",
      already_consumed: "This connection request was already used.",
      wrong_user: "This connection request belongs to a different signed-in session.",
    };
    return errorPage(`${reasonMessage[stateResult.reason]} Start the connection again from Settings.`);
  }

  const membership = await getMembership(stateResult.organizationId, guard.user.id);
  if (!membership || membership.role !== "owner") {
    return errorPage("You no longer have permission to manage this workspace's email connection.");
  }

  let oauth2Client;
  try {
    oauth2Client = createGmailOAuthClient();
  } catch (error) {
    return errorPage(error instanceof Error ? error.message : "Gmail is not configured.");
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      return errorPage(
        "Google did not return a refresh token. This usually happens when this app was already authorized before. " +
          "Remove CERTIFYED_'s access at https://myaccount.google.com/permissions, then retry the connection so Google issues a new one.",
      );
    }
    if (!tokens.id_token) {
      return errorPage("Google did not confirm the connected account's identity. Please retry the connection.");
    }

    const accountEmail = await getAuthorizedAccountEmail(oauth2Client, tokens.id_token);

    const connection = await saveEmailConnection({
      organizationId: stateResult.organizationId,
      senderEmail: accountEmail,
      refreshToken,
      connectedBy: guard.user.id,
    });

    return htmlPage(
      "Gmail connected",
      `<h1>Gmail connected</h1><p><strong>${connection.senderEmail}</strong> is now sending certificate emails for this workspace.</p><p><a href="/settings">Return to Settings</a></p>`,
      200,
    );
  } catch (error) {
    // Never echo the raw exception here -- it may come from Google's OAuth
    // token endpoint (via google-auth-library) and can carry provider
    // implementation detail that has no business in an HTTP response body.
    // Also never logged: this whole block is only ever reached with real
    // OAuth material in scope, and nothing in this route writes to the
    // server console.
    return errorPage(
      error instanceof Error && error.message.includes("did not confirm a verified email")
        ? error.message
        : "Failed to complete the Gmail connection. The authorization code may have expired or already been used -- retry the connection.",
    );
  }
}
