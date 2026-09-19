import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendCertificateEmail } from "./gmail";
import { decodeRawGmailMessage } from "./mime";
import type { GmailSendClient } from "./gmailClient";
import type { ResolvedEmailConnection } from "./connections";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
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

const CONNECTION: ResolvedEmailConnection = { senderEmail: "club-a@gmail.com", refreshToken: "refresh-token-club-a" };

function mockClient(sendRaw: GmailSendClient["sendRaw"]): GmailSendClient {
  return { sendRaw };
}

describe("gmail sendCertificateEmail", () => {
  it("sends a raw MIME message built from the input and returns the Gmail message id, using the resolved organization's connected account", async () => {
    const sendRaw = vi.fn().mockResolvedValue({ id: "gmail_msg_1" });

    const result = await sendCertificateEmail(baseInput, { organizationId: "org-a" }, {
      getConnection: async () => CONNECTION,
      client: mockClient(sendRaw),
    });

    expect(result.messageId).toBe("gmail_msg_1");
    expect(sendRaw).toHaveBeenCalledTimes(1);
    const raw = sendRaw.mock.calls[0][0] as string;
    const decoded = decodeRawGmailMessage(raw);
    expect(decoded).toContain("From: CERTIFYED_ <club-a@gmail.com>");
    expect(decoded).toContain("To: recipient@example.com");
    expect(decoded).toContain(Buffer.from("pdf-bytes").toString("base64"));
  });

  it("falls back to the CERTIFYED_ brand name when GMAIL_FROM_NAME is not set", async () => {
    delete process.env.GMAIL_FROM_NAME;
    const sendRaw = vi.fn().mockResolvedValue({ id: "gmail_msg_2" });

    await sendCertificateEmail(baseInput, { organizationId: "org-a" }, {
      getConnection: async () => CONNECTION,
      client: mockClient(sendRaw),
    });

    const decoded = decodeRawGmailMessage(sendRaw.mock.calls[0][0] as string);
    expect(decoded).toContain("From: CERTIFYED_ <club-a@gmail.com>");
  });

  it("throws a clear, actionable error -- without calling any client -- when the organization has no Gmail connection", async () => {
    const sendRaw = vi.fn();

    await expect(
      sendCertificateEmail(baseInput, { organizationId: "org-with-no-connection" }, { getConnection: async () => null, client: mockClient(sendRaw) }),
    ).rejects.toThrow(/Connect a Gmail account/);
    expect(sendRaw).not.toHaveBeenCalled();
  });

  it("propagates a Gmail API send failure instead of swallowing it", async () => {
    const sendRaw = vi.fn().mockRejectedValue(new Error("Gmail API quota or rate limit was exceeded. Wait and retry."));

    await expect(
      sendCertificateEmail(baseInput, { organizationId: "org-a" }, { getConnection: async () => CONNECTION, client: mockClient(sendRaw) }),
    ).rejects.toThrow(/quota or rate limit/);
  });

  it("never falls back to a different organization's connection", async () => {
    const getConnection = vi.fn(async (organizationId: string) =>
      organizationId === "org-a" ? CONNECTION : null,
    );
    const sendRaw = vi.fn().mockResolvedValue({ id: "gmail_msg_3" });

    await sendCertificateEmail(baseInput, { organizationId: "org-a" }, { getConnection, client: mockClient(sendRaw) });

    expect(getConnection).toHaveBeenCalledWith("org-a");
    expect(getConnection).not.toHaveBeenCalledWith("org-b");
  });
});
