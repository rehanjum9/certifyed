/**
 * Provider-agnostic shape every email provider (Resend, Gmail, ...) sends
 * and returns. Both src/lib/email/resend.ts and src/lib/email/gmail.ts
 * implement exactly this contract so src/lib/email/provider.ts can dispatch
 * between them without either provider module knowing the other exists.
 */
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
  /** The provider's own id for this send -- acceptance by the provider, not confirmed inbox delivery. */
  messageId: string;
}
