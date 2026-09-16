import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendCertificateEmail, type ResendLikeClient } from "./resend";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.RESEND_FROM_EMAIL = "certificates@example.com";
  process.env.RESEND_FROM_NAME = "CERTIFYED_";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function mockClient(sendImpl: ResendLikeClient["emails"]["send"]): ResendLikeClient {
  return { emails: { send: sendImpl } };
}

const baseInput = {
  to: "recipient@example.com",
  subject: "Your certificate",
  html: "<p>hi</p>",
  text: "hi",
  attachment: { filename: "cert.pdf", content: Buffer.from("pdf-bytes") },
};

describe("sendCertificateEmail", () => {
  it("builds the From header from RESEND_FROM_NAME/RESEND_FROM_EMAIL and returns the provider message id", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "msg_123" }, error: null });

    const result = await sendCertificateEmail(baseInput, mockClient(send));

    expect(result.messageId).toBe("msg_123");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "CERTIFYED_ <certificates@example.com>",
        to: "recipient@example.com",
        attachments: [{ filename: "cert.pdf", content: baseInput.attachment.content }],
      }),
    );
  });

  it("throws a clear error when the provider returns an error instead of crashing", async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { message: "rate limited" } });

    await expect(sendCertificateEmail(baseInput, mockClient(send))).rejects.toThrow("rate limited");
  });

  it("throws a configuration error, without calling the provider, when RESEND_FROM_EMAIL is missing", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    const send = vi.fn();

    await expect(sendCertificateEmail(baseInput, mockClient(send))).rejects.toThrow(/RESEND_FROM_EMAIL/);
    expect(send).not.toHaveBeenCalled();
  });

  it("falls back to the CERTIFYED_ brand name when RESEND_FROM_NAME is not set", async () => {
    delete process.env.RESEND_FROM_NAME;
    const send = vi.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null });

    await sendCertificateEmail(baseInput, mockClient(send));

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: "CERTIFYED_ <certificates@example.com>" }));
  });
});
