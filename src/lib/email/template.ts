const BRAND_NAME = "CERTIFYED_";
const BRAND_TAGLINE = "generate. personalize. deliver.";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Email headers (subject, From) can't contain newlines -- strip them so untrusted spreadsheet/campaign text can never inject extra header lines. */
function sanitizeHeaderText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export interface CertificateEmailVars {
  recipientName: string | null;
  campaignName: string;
  /** Only rendered when present -- rows without a serial_number field omit the "Certificate ID" line entirely. */
  serialNumber: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Renders the default certificate delivery email. All variable input
 * (recipient name, campaign name, serial number) comes from untrusted
 * spreadsheet/campaign data, so every value is escaped for HTML and
 * stripped of header-injection characters for the subject line.
 */
export function renderCertificateEmail({ recipientName, campaignName, serialNumber }: CertificateEmailVars): RenderedEmail {
  const greetingName = recipientName?.trim() || "there";
  const subject = `Your certificate — ${sanitizeHeaderText(campaignName)}`;

  const textLines = [
    `Hi ${greetingName},`,
    "",
    "Your certificate is ready.",
    "",
    "Please find your certificate attached as a PDF.",
  ];
  if (serialNumber) {
    textLines.push("", `Certificate ID: ${serialNumber}`);
  }
  textLines.push("", "Regards,", BRAND_NAME, BRAND_TAGLINE);
  const text = textLines.join("\n");

  const certificateIdHtml = serialNumber ? `<p style="margin:0 0 16px;">Certificate ID: ${escapeHtml(serialNumber)}</p>` : "";

  const html = `
<div style="font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 15px; line-height: 1.6; max-width: 480px;">
  <p style="margin:0 0 16px;">Hi ${escapeHtml(greetingName)},</p>
  <p style="margin:0 0 16px;">Your certificate is ready.</p>
  <p style="margin:0 0 16px;">Please find your certificate attached as a PDF.</p>
  ${certificateIdHtml}
  <p style="margin:0;">
    Regards,<br />
    <strong>${escapeHtml(BRAND_NAME)}</strong><br />
    <span style="color:#64748b;">${escapeHtml(BRAND_TAGLINE)}</span>
  </p>
</div>
  `.trim();

  return { subject, html, text };
}
