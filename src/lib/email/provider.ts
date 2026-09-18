import { sendCertificateEmail as sendViaResend } from "./resend";
import { sendCertificateEmail as sendViaGmail, type SendCertificateEmailContext } from "./gmail";
import { getEmailConnectionForOrganization } from "./connections";
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
 * Pure, non-throwing PLATFORM-level configuration check: does this
 * deployment have the provider's shared app-level configuration at all
 * (Resend's API key/sending domain; Gmail's shared OAuth client
 * id/secret/redirect URI)? This deliberately does NOT know about any one
 * organization's Gmail connection -- since per-workspace Gmail (item 12 of
 * the architecture report), "is Gmail connected" is no longer a single
 * global yes/no. Use getOrganizationEmailSendError for the full,
 * org-aware check a send actually needs.
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

  // provider === "gmail" -- platform-level (shared OAuth app) config only.
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REDIRECT_URI) {
    return "Gmail sending is not configured on this deployment. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI in your environment.";
  }
  return null;
}

/**
 * The full, organization-aware pre-flight check a real send needs: platform
 * config first, then (for Gmail) whether THIS organization has connected
 * an account. Used by the campaign email-start/test-email routes instead
 * of getEmailProviderConfigError alone, so "Gmail is configured on this
 * deployment but Club B never connected an account" is reported precisely
 * -- never silently falls back to any other organization's connection or
 * a global account (architecture report, item 19).
 */
export async function getOrganizationEmailSendError(organizationId: string): Promise<string | null> {
  const platformError = getEmailProviderConfigError();
  if (platformError) return platformError;

  const provider = resolveEmailProvider();
  if (provider !== "gmail") return null;

  const connection = await getEmailConnectionForOrganization(organizationId);
  if (!connection) return "Connect a Gmail account in Settings before sending certificates.";
  return null;
}

/**
 * The single provider-dispatch entry point every caller (campaign email
 * batches, test-email) uses. This is the only function in the codebase that
 * knows both providers exist -- everything else calls this and never
 * branches on EMAIL_PROVIDER itself.
 *
 * `context.organizationId` MUST be the campaign's own organization_id --
 * never the caller's currently active workspace (architecture report, item
 * 18) -- so a resumable job processed later, or by a different signed-in
 * session, always sends through the same club's Gmail account regardless
 * of what's active in anyone's browser at that moment. Resend, kept
 * system-wide (item 20), ignores it.
 */
export async function sendCertificateEmail(
  input: SendCertificateEmailInput,
  context: SendCertificateEmailContext,
): Promise<SendCertificateEmailResult> {
  const provider = resolveEmailProvider();
  if (provider === "gmail") return sendViaGmail(input, context);
  return sendViaResend(input);
}
