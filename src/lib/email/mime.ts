import { randomBytes } from "crypto";

export interface MimeAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface BuildRawGmailMessageInput {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachment: MimeAttachment;
}

const ASCII_ONLY = /^[\x00-\x7f]*$/;

/** RFC 2047 encoded-word -- only wraps the value when it actually contains non-ASCII, so plain-ASCII names/subjects are left untouched and readable. */
function encodeMimeWord(value: string): string {
  if (ASCII_ONLY.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

/** RFC 2231 filename* value: UTF-8, percent-encoded. Used alongside a plain ASCII-sanitized `filename=` fallback for clients that don't parse filename*. */
function encodeRfc2231Filename(filename: string): string {
  return `UTF-8''${encodeURIComponent(filename)}`;
}

function asciiSanitizeFilename(filename: string): string {
  return filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
}

/** Wraps base64 to 76-char lines per RFC 2045 -- not required by the Gmail API itself, but keeps the raw MIME message well-formed if inspected/forwarded elsewhere. */
function wrapBase64(base64: string): string {
  return base64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Builds a complete RFC 2822 MIME message (multipart/mixed containing a
 * multipart/alternative text+html body plus one PDF attachment) and returns
 * it as the base64url string the Gmail API's users.messages.send expects in
 * its `raw` field. Pure and network-free -- fully unit-testable by decoding
 * the result back to a string.
 */
export function buildRawGmailMessage(input: BuildRawGmailMessageInput): string {
  const boundaryMixed = `mixed_${randomBytes(12).toString("hex")}`;
  const boundaryAlt = `alt_${randomBytes(12).toString("hex")}`;

  const fromHeader = `${encodeMimeWord(input.fromName)} <${input.fromEmail}>`;
  const subjectHeader = encodeMimeWord(input.subject);
  const asciiFilename = asciiSanitizeFilename(input.attachment.filename);
  const extendedFilename = encodeRfc2231Filename(input.attachment.filename);
  const attachmentContentType = input.attachment.contentType ?? "application/pdf";

  const lines: string[] = [
    `From: ${fromHeader}`,
    `To: ${input.to}`,
    `Subject: ${subjectHeader}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
    "",
    `--${boundaryMixed}`,
    `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
    "",
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(input.text, "utf-8").toString("base64")),
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(input.html, "utf-8").toString("base64")),
    `--${boundaryAlt}--`,
    `--${boundaryMixed}`,
    `Content-Type: ${attachmentContentType}; name="${asciiFilename}"`,
    `Content-Disposition: attachment; filename="${asciiFilename}"; filename*=${extendedFilename}`,
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(input.attachment.content.toString("base64")),
    `--${boundaryMixed}--`,
    "",
  ];

  const rawMessage = lines.join("\r\n");
  return base64UrlEncode(Buffer.from(rawMessage, "utf-8"));
}

/** Decodes the base64url `raw` field back to the RFC 2822 message string -- used by tests and nowhere else. */
export function decodeRawGmailMessage(raw: string): string {
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}
