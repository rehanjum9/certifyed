import { describe, expect, it } from "vitest";
import { buildRawGmailMessage, decodeRawGmailMessage } from "./mime";

const baseInput = {
  fromEmail: "operator@gmail.com",
  fromName: "CERTIFYED_",
  to: "recipient@example.com",
  subject: "Your certificate",
  html: "<p>hi</p>",
  text: "hi",
  attachment: { filename: "cert.pdf", content: Buffer.from("pdf-bytes") },
};

describe("buildRawGmailMessage", () => {
  it("returns a base64url string (no +, /, or = padding)", () => {
    const raw = buildRawGmailMessage(baseInput);
    expect(raw).not.toMatch(/[+/=]/);
  });

  it("decodes back into a well-formed MIME message with all headers", () => {
    const decoded = decodeRawGmailMessage(buildRawGmailMessage(baseInput));

    expect(decoded).toContain("From: CERTIFYED_ <operator@gmail.com>");
    expect(decoded).toContain("To: recipient@example.com");
    expect(decoded).toContain("Subject: Your certificate");
    expect(decoded).toContain("MIME-Version: 1.0");
    expect(decoded).toContain("Content-Type: multipart/mixed;");
    expect(decoded).toContain("Content-Type: multipart/alternative;");
  });

  it("includes both a plain-text and an HTML part, base64-encoded", () => {
    const decoded = decodeRawGmailMessage(buildRawGmailMessage(baseInput));
    const textB64 = Buffer.from("hi", "utf-8").toString("base64");
    const htmlB64 = Buffer.from("<p>hi</p>", "utf-8").toString("base64");

    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decoded).toContain(textB64);
    expect(decoded).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(decoded).toContain(htmlB64);
  });

  it("includes the PDF attachment, base64-encoded, with a matching filename", () => {
    const decoded = decodeRawGmailMessage(buildRawGmailMessage(baseInput));
    const attachmentB64 = baseInput.attachment.content.toString("base64");

    expect(decoded).toContain("Content-Type: application/pdf;");
    expect(decoded).toContain('filename="cert.pdf"');
    expect(decoded).toContain("Content-Disposition: attachment;");
    expect(decoded).toContain(attachmentB64);
  });

  it("RFC 2047 encodes a non-ASCII From display name", () => {
    const decoded = decodeRawGmailMessage(buildRawGmailMessage({ ...baseInput, fromName: "Cértïfyëd" }));

    expect(decoded).toMatch(/From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <operator@gmail\.com>/);
    // Round-trips back to the original text.
    const match = decoded.match(/From: =\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/);
    expect(match).not.toBeNull();
    expect(Buffer.from(match![1], "base64").toString("utf-8")).toBe("Cértïfyëd");
  });

  it("RFC 2047 encodes a non-ASCII subject", () => {
    const decoded = decodeRawGmailMessage(buildRawGmailMessage({ ...baseInput, subject: "Votre certificat — Écolé" }));

    const match = decoded.match(/Subject: =\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/);
    expect(match).not.toBeNull();
    expect(Buffer.from(match![1], "base64").toString("utf-8")).toBe("Votre certificat — Écolé");
  });

  it("leaves plain-ASCII From name and subject unencoded", () => {
    const decoded = decodeRawGmailMessage(buildRawGmailMessage(baseInput));
    expect(decoded).toContain("From: CERTIFYED_ <operator@gmail.com>");
    expect(decoded).toContain("Subject: Your certificate");
  });

  it("provides an RFC 2231 filename* fallback for non-ASCII attachment names", () => {
    const decoded = decodeRawGmailMessage(
      buildRawGmailMessage({ ...baseInput, attachment: { ...baseInput.attachment, filename: "certificat-Écolé.pdf" } }),
    );

    expect(decoded).toContain(`filename*=UTF-8''${encodeURIComponent("certificat-Écolé.pdf")}`);
  });
});
