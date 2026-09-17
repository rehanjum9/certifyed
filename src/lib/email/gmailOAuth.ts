import { randomBytes } from "crypto";

/** HttpOnly cookie holding the pending OAuth CSRF state -- never read by client JS, scoped to the Gmail OAuth routes only, and cleared as soon as the callback consumes it. */
export const GMAIL_OAUTH_STATE_COOKIE = "gmail_oauth_state";
export const GMAIL_OAUTH_COOKIE_PATH = "/api/email/gmail";
export const GMAIL_OAUTH_STATE_MAX_AGE_SECONDS = 600;

export function generateOAuthState(): string {
  return randomBytes(32).toString("hex");
}
