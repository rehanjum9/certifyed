import { Resend } from "resend";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendCertificateEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachment: EmailAttachment;
}

export interface SendCertificateEmailResult {
  /** The provider's own id for this send. Acceptance by Resend, not confirmed inbox delivery -- see the Phase 7 report. */
  messageId: string;
}

/**
 * Minimal shape this module actually needs from the Resend SDK. Kept
 * narrow and separately typed so unit tests can pass a mock object instead
 * of the real client -- automated tests never call the real Resend API.
 */
export interface ResendLikeClient {
  emails: {
    send(params: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      attachments: { filename: string; content: Buffer }[];
    }): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
  };
}

let cachedClient: ResendLikeClient | null = null;

function getResendClient(): ResendLikeClient {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Email delivery is not configured: RESEND_API_KEY is missing. Set it in your environment before sending certificate emails.",
    );
  }
  if (!cachedClient) {
    cachedClient = new Resend(apiKey) as unknown as ResendLikeClient;
  }
  return cachedClient;
}

function resolveFromHeader(): string {
  const email = process.env.RESEND_FROM_EMAIL;
  const name = process.env.RESEND_FROM_NAME?.trim() || "CERTIFYED_";
  if (!email) {
    throw new Error(
      "Email delivery is not configured: RESEND_FROM_EMAIL is missing. Configure a verified Resend sending domain/address before sending certificate emails.",
    );
  }
  return `${name} <${email}>`;
}

/**
 * Sends one certificate email with its PDF attached. Accepts an injectable
 * client (real Resend client by default) purely so tests can supply a mock
 * -- automated test runs never call the real Resend API.
 */
export async function sendCertificateEmail(
  input: SendCertificateEmailInput,
  client: ResendLikeClient = getResendClient(),
): Promise<SendCertificateEmailResult> {
  const from = resolveFromHeader();

  const { data, error } = await client.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: [{ filename: input.attachment.filename, content: input.attachment.content }],
  });

  if (error || !data) {
    throw new Error(error?.message ?? "Resend did not return a message id.");
  }

  return { messageId: data.id };
}
