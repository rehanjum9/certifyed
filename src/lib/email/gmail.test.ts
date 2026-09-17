import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendCertificateEmail } from "./gmail";
import { decodeRawGmailMessage } from "./mime";
import type { GmailSendClient } from "./gmailClient";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GMAIL_FROM_EMAIL = "operator@gmail.com";
  process.env.GMAIL_FROM_NAME = "CERTIFYED_";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const baseInput = {
  to: "recipient@example.com",
  subject: "Your certificate",
  html: "<p>hi</p>",
  text: "hi",
  attachment: { filename: "cert.pdf", content: Buffer.from("pdf-bytes") },
};

function mockClient(sendRaw: GmailSendClient["sendRaw"]): GmailSendClient {
  return { sendRaw };
}

describe("gmail sendCertificateEmail", () => {
  it("sends a raw MIME message built from the input and returns the Gmail message id", async () => {
    const sendRaw = vi.fn().mockResolvedValue({ id: "gmail_msg_1" });

    const result = await sendCertificateEmail(baseInput, mockClient(sendRaw));

    expect(result.messageId).toBe("gmail_msg_1");
    expect(sendRaw).toHaveBeenCalledTimes(1);
    const raw = sendRaw.mock.calls[0][0] as string;
    const decoded = decodeRawGmailMessage(raw);
    expect(decoded).toContain("From: CERTIFYED_ <operator@gmail.com>");
    expect(decoded).toContain("To: recipient@example.com");
    expect(decoded).toContain(Buffer.from("pdf-bytes").toString("base64"));
  });

  it("falls back to the CERTIFYED_ brand name when GMAIL_FROM_NAME is not set", async () => {
    delete process.env.GMAIL_FROM_NAME;
    const sendRaw = vi.fn().mockResolvedValue({ id: "gmail_msg_2" });

    await sendCertificateEmail(baseInput, mockClient(sendRaw));

    const decoded = decodeRawGmailMessage(sendRaw.mock.calls[0][0] as string);
    expect(decoded).toContain("From: CERTIFYED_ <operator@gmail.com>");
  });

  it("throws a configuration error, without calling the client, when GMAIL_FROM_EMAIL is missing", async () => {
    delete process.env.GMAIL_FROM_EMAIL;
    const sendRaw = vi.fn();

    await expect(sendCertificateEmail(baseInput, mockClient(sendRaw))).rejects.toThrow(/GMAIL_FROM_EMAIL/);
    expect(sendRaw).not.toHaveBeenCalled();
  });

  it("propagates a Gmail API send failure instead of swallowing it", async () => {
    const sendRaw = vi.fn().mockRejectedValue(new Error("Gmail API quota or rate limit was exceeded. Wait and retry."));

    await expect(sendCertificateEmail(baseInput, mockClient(sendRaw))).rejects.toThrow(/quota or rate limit/);
  });
});
