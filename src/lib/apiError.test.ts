import { describe, expect, it } from "vitest";
import { safeApiErrorMessage } from "./apiError";

describe("safeApiErrorMessage", () => {
  it("passes through a known-safe, hand-written not-found message verbatim", () => {
    expect(safeApiErrorMessage(new Error("Campaign not found."), "fallback")).toBe("Campaign not found.");
    expect(safeApiErrorMessage(new Error("Job not found."), "fallback")).toBe("Job not found.");
    expect(safeApiErrorMessage(new Error("Template not found."), "fallback")).toBe("Template not found.");
  });

  it("replaces a raw wrapped database error with the fallback", () => {
    const raw = new Error('Failed to save campaign: duplicate key value violates unique constraint "campaigns_pkey"');
    expect(safeApiErrorMessage(raw, "Failed to save the campaign.")).toBe("Failed to save the campaign.");
  });

  it("replaces a raw storage error with the fallback", () => {
    const raw = new Error("Failed to load PDF: The resource was not found (bucket certificate-outputs)");
    expect(safeApiErrorMessage(raw, "Failed to load the file.")).toBe("Failed to load the file.");
  });

  it("replaces a provider-internal error with the fallback", () => {
    const raw = new Error("invalid_grant: Token has been expired or revoked.");
    expect(safeApiErrorMessage(raw, "Failed to connect.")).toBe("Failed to connect.");
  });

  it("replaces a non-Error thrown value with the fallback", () => {
    expect(safeApiErrorMessage("some string thrown", "fallback")).toBe("fallback");
    expect(safeApiErrorMessage(undefined, "fallback")).toBe("fallback");
  });

  it("does not do partial/substring matching -- a message merely containing a safe phrase is still replaced", () => {
    const raw = new Error("Failed to load campaign: Campaign not found. (relation error)");
    expect(safeApiErrorMessage(raw, "fallback")).toBe("fallback");
  });
});
