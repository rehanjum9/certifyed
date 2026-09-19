import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./resend", () => ({ sendCertificateEmail: vi.fn() }));
vi.mock("./gmail", () => ({ sendCertificateEmail: vi.fn() }));
vi.mock("./connections", () => ({ getEmailConnectionForOrganization: vi.fn() }));

import { sendCertificateEmail as sendViaResend } from "./resend";
import { sendCertificateEmail as sendViaGmail } from "./gmail";
import { getEmailConnectionForOrganization } from "./connections";
import { resolveEmailProvider, getEmailProviderConfigError, getOrganizationEmailSendError, sendCertificateEmail } from "./provider";

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
  const context = { organizationId: "org-a" };

  it("dispatches to Resend when EMAIL_PROVIDER is resend (or unset)", async () => {
    delete process.env.EMAIL_PROVIDER;
    vi.mocked(sendViaResend).mockResolvedValue({ messageId: "resend_1" });

    const result = await sendCertificateEmail(baseInput, context);

    expect(sendViaResend).toHaveBeenCalledWith(baseInput);
    expect(sendViaGmail).not.toHaveBeenCalled();
    expect(result.messageId).toBe("resend_1");
  });

  it("dispatches to Gmail when EMAIL_PROVIDER=gmail, passing the campaign's organization context through", async () => {
    process.env.EMAIL_PROVIDER = "gmail";
    vi.mocked(sendViaGmail).mockResolvedValue({ messageId: "gmail_1" });

    const result = await sendCertificateEmail(baseInput, context);

    expect(sendViaGmail).toHaveBeenCalledWith(baseInput, context);
    expect(sendViaResend).not.toHaveBeenCalled();
    expect(result.messageId).toBe("gmail_1");
  });

  it("throws without calling either provider when EMAIL_PROVIDER is invalid", async () => {
    process.env.EMAIL_PROVIDER = "mailgun";

    await expect(sendCertificateEmail(baseInput, context)).rejects.toThrow(/Invalid EMAIL_PROVIDER/);
    expect(sendViaResend).not.toHaveBeenCalled();
    expect(sendViaGmail).not.toHaveBeenCalled();
  });
});

describe("getEmailProviderConfigError (platform-level only)", () => {
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

  it("flags missing Gmail OAuth client config", () => {
    process.env.EMAIL_PROVIDER = "gmail";
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_REDIRECT_URI;
    expect(getEmailProviderConfigError()).toMatch(/GMAIL_CLIENT_ID/);
  });

  it("returns null for Gmail once the shared OAuth app is configured -- regardless of any organization's connection state", () => {
    process.env.EMAIL_PROVIDER = "gmail";
    process.env.GMAIL_CLIENT_ID = "id";
    process.env.GMAIL_CLIENT_SECRET = "secret";
    process.env.GMAIL_REDIRECT_URI = "http://localhost:3000/api/email/gmail/callback";
    expect(getEmailProviderConfigError()).toBeNull();
  });
});

describe("getOrganizationEmailSendError", () => {
  it("returns the platform config error before ever checking the organization's connection", async () => {
    process.env.EMAIL_PROVIDER = "gmail";
    delete process.env.GMAIL_CLIENT_ID;

    const result = await getOrganizationEmailSendError("org-a");
    expect(result).toMatch(/GMAIL_CLIENT_ID/);
    expect(getEmailConnectionForOrganization).not.toHaveBeenCalled();
  });

  it("returns null for the resend provider without checking any Gmail connection", async () => {
    delete process.env.EMAIL_PROVIDER;
    process.env.RESEND_API_KEY = "key";
    process.env.RESEND_FROM_EMAIL = "certs@example.com";

    expect(await getOrganizationEmailSendError("org-a")).toBeNull();
    expect(getEmailConnectionForOrganization).not.toHaveBeenCalled();
  });

  it("reports 'connect a Gmail account' for an organization with no connection", async () => {
    process.env.EMAIL_PROVIDER = "gmail";
    process.env.GMAIL_CLIENT_ID = "id";
    process.env.GMAIL_CLIENT_SECRET = "secret";
    process.env.GMAIL_REDIRECT_URI = "http://localhost:3000/api/email/gmail/callback";
    vi.mocked(getEmailConnectionForOrganization).mockResolvedValue(null);

    const result = await getOrganizationEmailSendError("org-with-no-connection");
    expect(result).toMatch(/Connect a Gmail account/);
    expect(getEmailConnectionForOrganization).toHaveBeenCalledWith("org-with-no-connection");
  });

  it("returns null once that organization has a Gmail connection", async () => {
    process.env.EMAIL_PROVIDER = "gmail";
    process.env.GMAIL_CLIENT_ID = "id";
    process.env.GMAIL_CLIENT_SECRET = "secret";
    process.env.GMAIL_REDIRECT_URI = "http://localhost:3000/api/email/gmail/callback";
    vi.mocked(getEmailConnectionForOrganization).mockResolvedValue({ senderEmail: "club@gmail.com", refreshToken: "rt" });

    expect(await getOrganizationEmailSendError("org-a")).toBeNull();
  });

  it("never lets one organization's connected state satisfy another organization's check", async () => {
    process.env.EMAIL_PROVIDER = "gmail";
    process.env.GMAIL_CLIENT_ID = "id";
    process.env.GMAIL_CLIENT_SECRET = "secret";
    process.env.GMAIL_REDIRECT_URI = "http://localhost:3000/api/email/gmail/callback";
    vi.mocked(getEmailConnectionForOrganization).mockImplementation(async (organizationId: string) =>
      organizationId === "org-a" ? { senderEmail: "club-a@gmail.com", refreshToken: "rt" } : null,
    );

    expect(await getOrganizationEmailSendError("org-a")).toBeNull();
    expect(await getOrganizationEmailSendError("org-b")).toMatch(/Connect a Gmail account/);
  });
});
