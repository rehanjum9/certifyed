import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./resend", () => ({ sendCertificateEmail: vi.fn() }));
vi.mock("./gmail", () => ({ sendCertificateEmail: vi.fn() }));

import { sendCertificateEmail as sendViaResend } from "./resend";
import { sendCertificateEmail as sendViaGmail } from "./gmail";
import { resolveEmailProvider, getEmailProviderConfigError, sendCertificateEmail } from "./provider";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
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

describe("resolveEmailProvider", () => {
  it("defaults to resend when EMAIL_PROVIDER is unset", () => {
    delete process.env.EMAIL_PROVIDER;
    expect(resolveEmailProvider()).toBe("resend");
  });

  it("returns resend when explicitly set", () => {
    process.env.EMAIL_PROVIDER = "resend";
    expect(resolveEmailProvider()).toBe("resend");
  });

  it("returns gmail when explicitly set", () => {
    process.env.EMAIL_PROVIDER = "gmail";
    expect(resolveEmailProvider()).toBe("gmail");
  });

  it("throws a clear configuration error for an unrecognized value", () => {
    process.env.EMAIL_PROVIDER = "sendgrid";
    expect(() => resolveEmailProvider()).toThrow(/Invalid EMAIL_PROVIDER "sendgrid"/);
  });
});

describe("sendCertificateEmail dispatch", () => {
  it("dispatches to Resend when EMAIL_PROVIDER is resend (or unset)", async () => {
    delete process.env.EMAIL_PROVIDER;
    vi.mocked(sendViaResend).mockResolvedValue({ messageId: "resend_1" });

    const result = await sendCertificateEmail(baseInput);

    expect(sendViaResend).toHaveBeenCalledWith(baseInput);
    expect(sendViaGmail).not.toHaveBeenCalled();
    expect(result.messageId).toBe("resend_1");
  });

  it("dispatches to Gmail when EMAIL_PROVIDER=gmail", async () => {
    process.env.EMAIL_PROVIDER = "gmail";
    vi.mocked(sendViaGmail).mockResolvedValue({ messageId: "gmail_1" });

    const result = await sendCertificateEmail(baseInput);

    expect(sendViaGmail).toHaveBeenCalledWith(baseInput);
    expect(sendViaResend).not.toHaveBeenCalled();
    expect(result.messageId).toBe("gmail_1");
  });

  it("throws without calling either provider when EMAIL_PROVIDER is invalid", async () => {
    process.env.EMAIL_PROVIDER = "mailgun";

    await expect(sendCertificateEmail(baseInput)).rejects.toThrow(/Invalid EMAIL_PROVIDER/);
    expect(sendViaResend).not.toHaveBeenCalled();
    expect(sendViaGmail).not.toHaveBeenCalled();
  });
});

describe("getEmailProviderConfigError", () => {
  it("returns the invalid-provider message when EMAIL_PROVIDER is invalid", () => {
    process.env.EMAIL_PROVIDER = "mailgun";
    expect(getEmailProviderConfigError()).toMatch(/Invalid EMAIL_PROVIDER/);
  });

  it("returns null for Resend when RESEND_API_KEY and RESEND_FROM_EMAIL are set", () => {
    delete process.env.EMAIL_PROVIDER;
    process.env.RESEND_API_KEY = "key";
    process.env.RESEND_FROM_EMAIL = "certs@example.com";
    expect(getEmailProviderConfigError()).toBeNull();
  });

  it("flags missing RESEND_API_KEY for the resend provider", () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_FROM_EMAIL = "certs@example.com";
    expect(getEmailProviderConfigError()).toMatch(/RESEND_API_KEY/);
  });

  it("flags missing Gmail OAuth client config before checking the refresh token", () => {
    process.env.EMAIL_PROVIDER = "gmail";
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_REDIRECT_URI;
    delete process.env.GMAIL_REFRESH_TOKEN;
    expect(getEmailProviderConfigError()).toMatch(/GMAIL_CLIENT_ID/);
  });

  it("flags a missing refresh token once OAuth client config is present", () => {
    process.env.EMAIL_PROVIDER = "gmail";
    process.env.GMAIL_CLIENT_ID = "id";
    process.env.GMAIL_CLIENT_SECRET = "secret";
    process.env.GMAIL_REDIRECT_URI = "http://localhost:3000/api/email/gmail/callback";
    delete process.env.GMAIL_REFRESH_TOKEN;
    expect(getEmailProviderConfigError()).toMatch(/not connected yet/);
  });

  it("returns null for Gmail once fully configured", () => {
    process.env.EMAIL_PROVIDER = "gmail";
    process.env.GMAIL_CLIENT_ID = "id";
    process.env.GMAIL_CLIENT_SECRET = "secret";
    process.env.GMAIL_REDIRECT_URI = "http://localhost:3000/api/email/gmail/callback";
    process.env.GMAIL_REFRESH_TOKEN = "refresh-token";
    process.env.GMAIL_FROM_EMAIL = "operator@gmail.com";
    expect(getEmailProviderConfigError()).toBeNull();
  });
});
