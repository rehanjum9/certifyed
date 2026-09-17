import { describe, expect, it } from "vitest";
import {
  clampEmailBatchSize,
  summarizeEmailProgress,
  isEligibleForEmailSend,
  isEligibleForEmailRetry,
  DEFAULT_EMAIL_BATCH_SIZE,
  MIN_EMAIL_BATCH_SIZE,
  MAX_EMAIL_BATCH_SIZE,
  MAX_EMAIL_ATTEMPTS,
  type EmailCandidateRow,
} from "./emailDelivery";

describe("clampEmailBatchSize", () => {
  it("returns the default when nothing is requested", () => {
    expect(clampEmailBatchSize(undefined)).toBe(DEFAULT_EMAIL_BATCH_SIZE);
  });

  it("returns the default for non-finite/zero input", () => {
    expect(clampEmailBatchSize(Number.NaN)).toBe(DEFAULT_EMAIL_BATCH_SIZE);
    expect(clampEmailBatchSize(0)).toBe(DEFAULT_EMAIL_BATCH_SIZE);
  });

  it("passes a value already inside the bounds through unchanged", () => {
    expect(clampEmailBatchSize(3)).toBe(3);
  });

  it("clamps a too-large request down to the maximum", () => {
    expect(clampEmailBatchSize(500)).toBe(MAX_EMAIL_BATCH_SIZE);
  });

  it("clamps a too-small request up to the minimum", () => {
    expect(clampEmailBatchSize(-2)).toBe(MIN_EMAIL_BATCH_SIZE);
  });

  it("rounds fractional input", () => {
    expect(clampEmailBatchSize(4.6)).toBe(5);
  });
});

describe("isEligibleForEmailSend", () => {
  function row(overrides: Partial<EmailCandidateRow>): EmailCandidateRow {
    return {
      status: "generated",
      pdfPath: "campaigns/c1/r1.pdf",
      recipientEmail: "a@example.com",
      emailAttempts: 0,
      ...overrides,
    };
  }

  it("a generated row with a PDF and a recipient email is eligible", () => {
    expect(isEligibleForEmailSend(row({}))).toBe(true);
  });

  it("a row without a pdf_path is not eligible", () => {
    expect(isEligibleForEmailSend(row({ pdfPath: null }))).toBe(false);
  });

  it("a row without a recipient email is not eligible", () => {
    expect(isEligibleForEmailSend(row({ recipientEmail: null }))).toBe(false);
  });

  it("an already-sent row is not eligible for a first send (must be skipped, not resent)", () => {
    expect(isEligibleForEmailSend(row({ status: "sent" }))).toBe(false);
  });

  it("a row still awaiting PDF generation is not eligible", () => {
    expect(isEligibleForEmailSend(row({ status: "pending", pdfPath: null }))).toBe(false);
  });

  it("a row currently being emailed is not eligible for a second concurrent claim", () => {
    expect(isEligibleForEmailSend(row({ status: "emailing" }))).toBe(false);
  });
});

describe("isEligibleForEmailRetry", () => {
  function row(overrides: Partial<EmailCandidateRow>): EmailCandidateRow {
    return {
      status: "failed",
      pdfPath: "campaigns/c1/r1.pdf",
      recipientEmail: "a@example.com",
      emailAttempts: 1,
      ...overrides,
    };
  }

  it("a failed row that already has a PDF is retriable -- an email failure, not a generation failure", () => {
    expect(isEligibleForEmailRetry(row({}))).toBe(true);
  });

  it("a failed row with no PDF is NOT retriable here -- it never passed generation/validation", () => {
    expect(isEligibleForEmailRetry(row({ pdfPath: null }))).toBe(false);
  });

  it("a sent row is not retriable", () => {
    expect(isEligibleForEmailRetry(row({ status: "sent" }))).toBe(false);
  });

  it("a row missing a recipient email is not retriable", () => {
    expect(isEligibleForEmailRetry(row({ recipientEmail: null }))).toBe(false);
  });

  it("a row just under the attempt cap is still retriable", () => {
    expect(isEligibleForEmailRetry(row({ emailAttempts: MAX_EMAIL_ATTEMPTS - 1 }))).toBe(true);
  });

  it("a row that has reached the attempt cap is no longer retriable", () => {
    expect(isEligibleForEmailRetry(row({ emailAttempts: MAX_EMAIL_ATTEMPTS }))).toBe(false);
  });

  it("a row that has exceeded the attempt cap is no longer retriable", () => {
    expect(isEligibleForEmailRetry(row({ emailAttempts: MAX_EMAIL_ATTEMPTS + 3 }))).toBe(false);
  });
});

describe("summarizeEmailProgress", () => {
  function row(overrides: Partial<EmailCandidateRow>): EmailCandidateRow {
    return { status: "generated", pdfPath: "p.pdf", recipientEmail: "a@example.com", emailAttempts: 0, ...overrides };
  }

  it("excludes rows that have never been generated (no pdf_path) from the email universe entirely", () => {
    const summary = summarizeEmailProgress([row({ status: "pending", pdfPath: null }), row({ status: "generated" })]);
    expect(summary.eligibleTotal).toBe(1);
  });

  it("buckets by status: sent, emailing, generated (pending-to-send), failed", () => {
    const summary = summarizeEmailProgress([
      row({ status: "sent" }),
      row({ status: "sent" }),
      row({ status: "emailing" }),
      row({ status: "generated" }),
      row({ status: "failed" }),
    ]);
    expect(summary.sent).toBe(2);
    expect(summary.emailing).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.eligibleTotal).toBe(5);
  });

  it("computes an exact percentage from sent/eligibleTotal", () => {
    const summary = summarizeEmailProgress([
      row({ status: "sent" }),
      row({ status: "sent" }),
      row({ status: "generated" }),
      row({ status: "generated" }),
    ]);
    expect(summary.progressPercent).toBe(50);
  });

  it("reports 0% (not NaN) when nothing has been generated yet", () => {
    const summary = summarizeEmailProgress([row({ status: "pending", pdfPath: null })]);
    expect(summary.eligibleTotal).toBe(0);
    expect(summary.progressPercent).toBe(0);
  });
});
