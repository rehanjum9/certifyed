import { NextResponse } from "next/server";
import { guardApiRoute } from "@/lib/auth/apiGuard";
import { createGmailOAuthClient, GMAIL_SEND_SCOPE } from "@/lib/email/gmailClient";
import { GMAIL_OAUTH_STATE_COOKIE, GMAIL_OAUTH_COOKIE_PATH, GMAIL_OAUTH_STATE_MAX_AGE_SECONDS, generateOAuthState } from "@/lib/email/gmailOAuth";

/**
 * Operator-only: starts the Gmail OAuth consent flow. Requests the minimum
 * sending scope (gmail.send) and offline access (so Google issues a refresh
 * token), and pins a CSRF state value in an HttpOnly cookie that
 * /api/email/gmail/callback must see echoed back unchanged.
 */
export async function GET() {
  const guard = await guardApiRoute();
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

  const state = generateOAuthState();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [GMAIL_SEND_SCOPE],
    prompt: "consent",
    state,
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: GMAIL_OAUTH_STATE_MAX_AGE_SECONDS,
    path: GMAIL_OAUTH_COOKIE_PATH,
  });
  return response;
}
