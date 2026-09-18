import { buildRawGmailMessage } from "./mime";
import { getGmailSendClient, type GmailSendClient } from "./gmailClient";
import { getEmailConnectionForOrganization, type ResolvedEmailConnection } from "./connections";
import type { SendCertificateEmailInput, SendCertificateEmailResult } from "./types";

export type { EmailAttachment, SendCertificateEmailInput, SendCertificateEmailResult } from "./types";

function resolveFromName(): string {
  return process.env.GMAIL_FROM_NAME?.trim() || "CERTIFYED_";
}

export interface SendCertificateEmailContext {
  /** Whose Gmail connection to send through -- always the CAMPAIGN's organization (architecture report, item 18), never the caller's currently active workspace. */
  organizationId: string;
}

export interface SendCertificateEmailDeps {
  /** Injectable purely for tests -- the real path always resolves the organization's own connection from the database. */
  getConnection?: (organizationId: string) => Promise<ResolvedEmailConnection | null>;
  client?: GmailSendClient;
}

/**
 * Sends one certificate email through the Gmail API, using the
 * organization's own connected account -- never a global/env-configured
 * Gmail account (architecture report, item 12/18/20). Mirrors
 * src/lib/email/resend.ts's shape exactly so src/lib/email/provider.ts can
 * dispatch between the two without either module needing to know about the
 * other.
 */
export async function sendCertificateEmail(
  input: SendCertificateEmailInput,
  context: SendCertificateEmailContext,
  deps: SendCertificateEmailDeps = {},
): Promise<SendCertificateEmailResult> {
  const getConnection = deps.getConnection ?? getEmailConnectionForOrganization;
  const connection = await getConnection(context.organizationId);

  if (!connection) {
    throw new Error("Connect a Gmail account in Settings before sending certificates.");
  }

  const raw = buildRawGmailMessage({
    fromEmail: connection.senderEmail,
    fromName: resolveFromName(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachment: input.attachment,
  });

  const client = deps.client ?? getGmailSendClient(connection.refreshToken);
  const result = await client.sendRaw(raw);
  return { messageId: result.id };
}
