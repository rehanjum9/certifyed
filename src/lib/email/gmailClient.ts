import { OAuth2Client } from "google-auth-library";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
// Minimum identity scopes needed to reliably learn which Google account the
// operator just authorized (architecture report, item 17) -- never used for
// anything beyond reading that one email address back out of the ID token.
export const GMAIL_IDENTITY_SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email"];
const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export interface GmailSendClient {
  sendRaw(rawMessage: string): Promise<{ id: string }>;
}

function requiredOAuthEnv(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Gmail is not configured: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI must all be set.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Builds a bare OAuth2Client for the connect/callback flow -- no refresh
 * token required yet, since this client only ever generates the consent URL
 * and exchanges the authorization code. These three env vars describe the
 * one shared Google Cloud OAuth application this deployment uses; they are
 * NOT per-organization (every workspace authorizes against the same OAuth
 * client, then gets its own refresh token -- see lib/email/connections.ts).
 */
export function createGmailOAuthClient(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = requiredOAuthEnv();
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

/**
 * Extracts the authorized Google account's own email from the ID token
 * Google returns alongside the access/refresh tokens (requires the
 * `openid` + `userinfo.email` scopes -- see GMAIL_IDENTITY_SCOPES). Uses
 * google-auth-library's own signature verification
 * (`OAuth2Client#verifyIdToken`) rather than a naive JWT payload decode, so
 * this can never be fooled by an unsigned/forged token. Only `email` (and
 * whether Google itself marked it verified) is read from the payload --
 * nothing else in the token is trusted or used.
 *
 * The caller must never let the user type/override this value (architecture
 * report, item 17: no From-address spoofing) -- it's always exactly the
 * account that completed OAuth consent.
 */
export async function getAuthorizedAccountEmail(oauth2Client: OAuth2Client, idToken: string): Promise<string> {
  const { clientId } = requiredOAuthEnv();
  const ticket = await oauth2Client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();

  if (!payload?.email || payload.email_verified === false) {
    throw new Error("Google did not confirm a verified email address for this account.");
  }
  return payload.email;
}

/**
 * Maps a Gmail API error response to a useful, non-sensitive row-level
 * message. Never echoes the raw response body (which is provider-internal
 * detail, not something to expose to the UI) beyond the provider's own
 * short human-readable message field.
 */
export function classifyGmailApiError(status: number, rawBody: string): Error {
  let message = "Gmail API request failed.";
  let reason = "";
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: string | { message?: string; status?: string; errors?: { reason?: string }[] };
      error_description?: string;
    };
    if (typeof parsed.error === "string") {
      // OAuth token-endpoint error shape (e.g. from getAccessToken()/getToken()): { error, error_description }.
      reason = parsed.error;
      message = parsed.error_description ?? message;
    } else if (parsed.error) {
      // Gmail/Google API error shape: { error: { message, status, errors: [{ reason }] } }.
      message = parsed.error.message ?? message;
      reason = parsed.error.errors?.[0]?.reason ?? parsed.error.status ?? "";
    }
  } catch {
    // Non-JSON body -- fall back to the generic message below.
  }

  const haystack = `${reason} ${message}`.toLowerCase();

  if (haystack.includes("invalid_grant") || haystack.includes("invalid grant")) {
    return new Error(
      "Gmail authorization has expired or was revoked. Reconnect this workspace's Gmail account in Settings.",
    );
  }
  if (
    haystack.includes("accessnotconfigured") ||
    haystack.includes("has not been used in project") ||
    haystack.includes("api has not been used")
  ) {
    return new Error("The Gmail API is disabled for this Google Cloud project. Enable it in Google Cloud Console and retry.");
  }
  if (haystack.includes("quotaexceeded") || haystack.includes("ratelimitexceeded") || haystack.includes("userratelimitexceeded")) {
    return new Error("Gmail API quota or rate limit was exceeded. Wait and retry.");
  }
  if (haystack.includes("insufficient") && haystack.includes("permission")) {
    return new Error(
      "Gmail access was revoked or no longer includes the gmail.send scope. Reconnect this workspace's Gmail account in Settings.",
    );
  }
  if (status === 403) {
    return new Error(
      "Gmail rejected this request as forbidden -- the connected account may have revoked access. Reconnect this workspace's Gmail account in Settings.",
    );
  }
  if (status === 400 && (haystack.includes("invalid to header") || haystack.includes("invalid recipient") || haystack.includes("invalid argument"))) {
    return new Error("Gmail rejected the recipient email address as malformed.");
  }

  return new Error(`Gmail API error (HTTP ${status}): ${message}`);
}

async function getAccessToken(oauth2Client: OAuth2Client): Promise<string> {
  const { token } = await oauth2Client.getAccessToken();
  if (!token) {
    throw new Error("Failed to obtain a Gmail access token from the connected account's refresh token.");
  }
  return token;
}

/**
 * The real Gmail send client: refreshes an access token from the given
 * (already-decrypted, per-organization) refresh token, then calls
 * users.messages.send directly via fetch. A thin wrapper rather than the
 * full googleapis SDK -- this app only ever needs this one endpoint, so
 * google-auth-library (Google's official OAuth client) handles token
 * refresh while the REST call stays dependency-light.
 *
 * Deliberately takes the refresh token as an explicit argument rather than
 * reading a global env var or caching a singleton client: every
 * organization has its own Gmail connection (see lib/email/connections.ts),
 * so there is no single "the" refresh token to cache process-wide.
 */
export function getGmailSendClient(refreshToken: string): GmailSendClient {
  const oauth2Client = createGmailOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return {
    async sendRaw(rawMessage: string): Promise<{ id: string }> {
      const accessToken = await getAccessToken(oauth2Client);

      const response = await fetch(GMAIL_SEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: rawMessage }),
      });

      if (!response.ok) {
        const rawBody = await response.text();
        throw classifyGmailApiError(response.status, rawBody);
      }

      const data = (await response.json()) as { id?: string };
      if (!data.id) {
        throw new Error("Gmail did not return a message id.");
      }
      return { id: data.id };
    },
  };
}
