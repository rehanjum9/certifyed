import { NextResponse, type NextRequest } from "next/server";
import { guardApiRoute } from "@/lib/auth/apiGuard";
import { createGmailOAuthClient } from "@/lib/email/gmailClient";
import { GMAIL_OAUTH_STATE_COOKIE, GMAIL_OAUTH_COOKIE_PATH } from "@/lib/email/gmailOAuth";

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

function clearStateCookie(response: NextResponse): void {
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, "", { maxAge: 0, path: GMAIL_OAUTH_COOKIE_PATH });
}

function errorPage(message: string): NextResponse {
  const response = htmlPage(
    "Gmail connection failed",
    `<h1>Gmail connection failed</h1><p>${message}</p><p>Retry from <code>GET /api/email/gmail/connect</code>.</p>`,
    400,
  );
  clearStateCookie(response);
  return response;
}

/**
 * Operator-only OAuth callback. Validates the CSRF state cookie set by
 * /connect, exchanges the authorization code for tokens, and -- since this
 * single-operator MVP has nowhere else to durably store one -- prints the
 * refresh token to the server terminal exactly once so the operator can
 * copy it into GMAIL_REFRESH_TOKEN. The token is never rendered in this
 * response, never stored in a cookie/localStorage, and never routed through
 * any app logging path.
 */
export async function GET(request: NextRequest) {
  const guard = await guardApiRoute();
  if ("response" in guard) return guard.response;

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(GMAIL_OAUTH_STATE_COOKIE)?.value;

  if (!code) return errorPage("Google did not return an authorization code.");
  if (!state || !cookieState || state !== cookieState) {
    return errorPage("Missing or mismatched OAuth state. This can happen if the link was opened twice or took too long.");
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

    // One-time, local-terminal-only handoff -- intentionally not the app's
    // logger (this app has none, and never should route secrets through
    // one). Only the operator watching `next dev`'s terminal ever sees this.
    console.log("");
    console.log("===== Gmail connected -- copy this into .env.local, then restart `npm run dev` =====");
    console.log(`GMAIL_REFRESH_TOKEN=${refreshToken}`);
    console.log("=======================================================================================");
    console.log("");

    const response = htmlPage(
      "Gmail connected",
      `<h1>Gmail connected</h1><p>Check the terminal running <code>npm run dev</code> for a one-time
       <code>GMAIL_REFRESH_TOKEN</code> value. Copy it into <code>.env.local</code>, then restart the dev server
       to finish enabling Gmail sending.</p>`,
      200,
    );
    clearStateCookie(response);
    return response;
  } catch {
    // Never echo the raw exception here -- it comes from Google's OAuth
    // token endpoint (via google-auth-library) and can carry provider
    // implementation detail that has no business in an HTTP response body.
    return errorPage(
      "Failed to complete the Gmail connection. The authorization code may have expired or already been used -- retry the connection.",
    );
  }
}
