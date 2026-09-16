import { describe, expect, it } from "vitest";
import { renderCertificateEmail } from "./template";

describe("renderCertificateEmail", () => {
  it("renders the subject with the campaign name", () => {
    const { subject } = renderCertificateEmail({
      recipientName: "Ali Khan",
      campaignName: "2026 Graduates",
      serialNumber: "CERT-101",
    });
    expect(subject).toBe("Your certificate — 2026 Graduates");
  });

  it("greets the recipient by name and includes the certificate id when present", () => {
    const { text, html } = renderCertificateEmail({
      recipientName: "Ali Khan",
      campaignName: "X",
      serialNumber: "CERT-101",
    });
    expect(text).toContain("Hi Ali Khan,");
    expect(text).toContain("Certificate ID: CERT-101");
    expect(html).toContain("Certificate ID: CERT-101");
  });

  it("omits the certificate id line entirely when serialNumber is absent", () => {
    const { text, html } = renderCertificateEmail({ recipientName: "Ali Khan", campaignName: "X", serialNumber: null });
    expect(text).not.toContain("Certificate ID");
    expect(html).not.toContain("Certificate ID");
  });

  it("falls back to a generic greeting when no recipient name is available", () => {
    const { text } = renderCertificateEmail({ recipientName: null, campaignName: "X", serialNumber: null });
    expect(text).toContain("Hi there,");
  });

  it("falls back to a generic greeting when the recipient name is blank/whitespace", () => {
    const { text } = renderCertificateEmail({ recipientName: "   ", campaignName: "X", serialNumber: null });
    expect(text).toContain("Hi there,");
  });

  it("escapes HTML-unsafe characters in recipient name and serial number", () => {
    const { html } = renderCertificateEmail({
      recipientName: "<script>alert(1)</script>",
      campaignName: "X",
      serialNumber: '"><img onerror=alert(1)>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img onerror");
  });

  it("strips newlines from the campaign name to prevent header injection in the subject", () => {
    const { subject } = renderCertificateEmail({
      recipientName: "Ali",
      campaignName: "Line1\r\nBcc: evil@example.com",
      serialNumber: null,
    });
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("includes the CERTIFYED_ branding and tagline", () => {
    const { text, html } = renderCertificateEmail({ recipientName: "Ali", campaignName: "X", serialNumber: null });
    expect(text).toContain("CERTIFYED_");
    expect(text).toContain("generate. personalize. deliver.");
    expect(html).toContain("CERTIFYED_");
    expect(html).toContain("generate. personalize. deliver.");
  });

  it("provides a plain-text fallback alongside the HTML body", () => {
    const { text, html } = renderCertificateEmail({ recipientName: "Ali", campaignName: "X", serialNumber: null });
    expect(text.length).toBeGreaterThan(0);
    expect(html).not.toBe(text);
  });
});
