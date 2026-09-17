import { OAuth2Client } from "google-auth-library";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
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
 * and exchanges the authorization code.
 */
export function createGmailOAuthClient(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = requiredOAuthEnv();
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

let cachedSendingClient: OAuth2Client | null = null;

/**
 * Builds (and caches) the OAuth2Client used for actually sending mail:
 * credentials are seeded with GMAIL_REFRESH_TOKEN so the library
 * transparently exchanges it for a fresh access token on every call that
 * needs one -- callers never handle access tokens directly.
 */
function getSendingOAuth2Client(): OAuth2Client {
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error(
      "Gmail sending is not configured: GMAIL_REFRESH_TOKEN is missing. Complete the Gmail connection flow " +
        "(GET /api/email/gmail/connect) and add the refresh token it prints to your environment.",
    );
  }
  if (!cachedSendingClient) {
    cachedSendingClient = createGmailOAuthClient();
    cachedSendingClient.setCredentials({ refresh_token: refreshToken });
  }
  return cachedSendingClient;
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
      "Gmail authorization has expired or was revoked. Reconnect via GET /api/email/gmail/connect and update GMAIL_REFRESH_TOKEN.",
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
      "Gmail access was revoked or no longer includes the gmail.send scope. Reconnect via GET /api/email/gmail/connect.",
    );
  }
  if (status === 403) {
    return new Error(
      "Gmail rejected this request as forbidden -- the connected account may have revoked access. Reconnect via GET /api/email/gmail/connect.",
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
    throw new Error("Failed to obtain a Gmail access token from the configured refresh token.");
  }
  return token;
}

/**
 * The real Gmail send client: refreshes an access token from
 * GMAIL_REFRESH_TOKEN, then calls users.messages.send directly via fetch.
 * A thin wrapper rather than the full googleapis SDK -- this app only ever
 * needs this one endpoint, so google-auth-library (Google's official OAuth
 * client) handles token refresh while the REST call stays dependency-light.
 */
export function getGmailSendClient(): GmailSendClient {
  const oauth2Client = getSendingOAuth2Client();

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
