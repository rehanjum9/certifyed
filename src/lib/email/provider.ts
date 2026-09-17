import { sendCertificateEmail as sendViaResend } from "./resend";
import { sendCertificateEmail as sendViaGmail } from "./gmail";
import type { SendCertificateEmailInput, SendCertificateEmailResult } from "./types";

export type { EmailAttachment, SendCertificateEmailInput, SendCertificateEmailResult } from "./types";

export const EMAIL_PROVIDERS = ["resend", "gmail"] as const;
export type EmailProviderName = (typeof EMAIL_PROVIDERS)[number];

const DEFAULT_EMAIL_PROVIDER: EmailProviderName = "resend";

/**
 * The one place EMAIL_PROVIDER is read. Defaults safely to "resend" (the
 * provider this app already shipped with) when unset, so existing
 * deployments that never set EMAIL_PROVIDER keep working unchanged. An
 * explicitly-set but unrecognized value is a server misconfiguration, not a
 * silent fallback -- it throws so it's caught in development/deploy rather
 * than quietly sending through the wrong (or no) provider.
 */
export function resolveEmailProvider(): EmailProviderName {
  const raw = process.env.EMAIL_PROVIDER?.trim();
  if (!raw) return DEFAULT_EMAIL_PROVIDER;

  if ((EMAIL_PROVIDERS as readonly string[]).includes(raw)) {
    return raw as EmailProviderName;
  }

  throw new Error(
    `Invalid EMAIL_PROVIDER "${raw}". Set EMAIL_PROVIDER to one of: ${EMAIL_PROVIDERS.join(", ")} (or leave it unset to default to "${DEFAULT_EMAIL_PROVIDER}").`,
  );
}

/**
 * Pure, non-throwing configuration check for routes that need to show a
 * friendly 400 before attempting to send (e.g. "Start emailing" and "Send
 * test email") instead of surfacing a thrown error. Returns null when the
 * resolved provider is fully configured, otherwise a user-facing message.
 * This is the ONE place that knows which env vars each provider needs --
 * callers never inspect RESEND_* / GMAIL_* env vars directly.
 */
export function getEmailProviderConfigError(): string | null {
  let provider: EmailProviderName;
  try {
    provider = resolveEmailProvider();
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid EMAIL_PROVIDER configuration.";
  }

  if (provider === "resend") {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return "Email sending is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL (a verified Resend sending domain) in your environment before sending certificates.";
    }
    return null;
  }

  // provider === "gmail"
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REDIRECT_URI) {
    return "Gmail sending is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI in your environment.";
  }
  if (!process.env.GMAIL_REFRESH_TOKEN) {
    return "Gmail is not connected yet. Complete the Gmail connection flow (GET /api/email/gmail/connect) and set GMAIL_REFRESH_TOKEN before sending certificates.";
  }
  if (!process.env.GMAIL_FROM_EMAIL) {
    return "Gmail sending is not configured. Set GMAIL_FROM_EMAIL to the Gmail account you connected via OAuth.";
  }
  return null;
}

/**
 * The single provider-dispatch entry point every caller (campaign email
 * batches, test-email) uses. This is the only function in the codebase that
 * knows both providers exist -- everything else calls this and never
 * branches on EMAIL_PROVIDER itself.
 */
export async function sendCertificateEmail(input: SendCertificateEmailInput): Promise<SendCertificateEmailResult> {
  const provider = resolveEmailProvider();
  if (provider === "gmail") return sendViaGmail(input);
  return sendViaResend(input);
}
