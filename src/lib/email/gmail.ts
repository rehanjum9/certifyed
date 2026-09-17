import { buildRawGmailMessage } from "./mime";
import { getGmailSendClient, type GmailSendClient } from "./gmailClient";
import type { SendCertificateEmailInput, SendCertificateEmailResult } from "./types";

export type { EmailAttachment, SendCertificateEmailInput, SendCertificateEmailResult } from "./types";

function resolveFrom(): { email: string; name: string } {
  const email = process.env.GMAIL_FROM_EMAIL;
  const name = process.env.GMAIL_FROM_NAME?.trim() || "CERTIFYED_";
  if (!email) {
    throw new Error(
      "Gmail sending is not configured: GMAIL_FROM_EMAIL is missing. Set it to the Gmail account you connected via OAuth.",
    );
  }
  return { email, name };
}

/**
 * Sends one certificate email through the Gmail API. Accepts an injectable
 * client (the real Gmail client by default) purely so tests can supply a
 * mock -- automated test runs never call the real Gmail API. Mirrors
 * src/lib/email/resend.ts's shape exactly so src/lib/email/provider.ts can
 * dispatch between the two without either module needing to know about the
 * other.
 */
export async function sendCertificateEmail(
  input: SendCertificateEmailInput,
  client: GmailSendClient = getGmailSendClient(),
): Promise<SendCertificateEmailResult> {
  const from = resolveFrom();

  const raw = buildRawGmailMessage({
    fromEmail: from.email,
    fromName: from.name,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachment: input.attachment,
  });

  const result = await client.sendRaw(raw);
  return { messageId: result.id };
}
