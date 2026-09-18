import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyGmailApiError, createGmailOAuthClient, getGmailSendClient } from "./gmailClient";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GMAIL_CLIENT_ID = "client-id";
  process.env.GMAIL_CLIENT_SECRET = "client-secret";
  process.env.GMAIL_REDIRECT_URI = "http://localhost:3000/api/email/gmail/callback";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("createGmailOAuthClient", () => {
  it("throws a clear configuration error when GMAIL_CLIENT_ID is missing", () => {
    delete process.env.GMAIL_CLIENT_ID;
    expect(() => createGmailOAuthClient()).toThrow(/GMAIL_CLIENT_ID/);
  });

  it("builds a client when all three OAuth env vars are present", () => {
    expect(() => createGmailOAuthClient()).not.toThrow();
  });
});

describe("getGmailSendClient", () => {
  it("builds a client from an explicit refresh token without touching any global env var", () => {
    expect(() => getGmailSendClient("some-refresh-token")).not.toThrow();
  });

  it("still requires the shared OAuth app env vars even with a refresh token supplied", () => {
    delete process.env.GMAIL_CLIENT_ID;
    expect(() => getGmailSendClient("some-refresh-token")).toThrow(/GMAIL_CLIENT_ID/);
  });
});

describe("classifyGmailApiError", () => {
  it("maps invalid_grant to a reconnect-Gmail message", () => {
    const error = classifyGmailApiError(400, JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }));
    expect(error.message).toMatch(/expired or was revoked/);
    expect(error.message).toMatch(/Reconnect this workspace's Gmail account in Settings/);
  });

  it("maps a disabled Gmail API response to an enable-the-API message", () => {
    const error = classifyGmailApiError(
      403,
      JSON.stringify({ error: { message: "Gmail API has not been used in project 123 before or it is disabled.", status: "PERMISSION_DENIED" } }),
    );
    expect(error.message).toMatch(/Gmail API is disabled/);
  });

  it("maps a quota error to a rate-limit message", () => {
    const error = classifyGmailApiError(
      429,
      JSON.stringify({ error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] } }),
    );
    expect(error.message).toMatch(/quota or rate limit/i);
  });

  it("maps a malformed recipient error to a clear message", () => {
    const error = classifyGmailApiError(400, JSON.stringify({ error: { message: "Invalid recipient" } }));
    expect(error.message).toMatch(/recipient email address as malformed/);
  });

  it("never leaks the raw response body for an unrecognized error", () => {
    const error = classifyGmailApiError(500, JSON.stringify({ error: { message: "Internal error", secretDebugInfo: "SENSITIVE" } }));
    expect(error.message).not.toContain("SENSITIVE");
    expect(error.message).toContain("Internal error");
  });

  it("falls back to a generic message for a non-JSON body", () => {
    const error = classifyGmailApiError(502, "<html>Bad Gateway</html>");
    expect(error.message).toMatch(/Gmail API error \(HTTP 502\)/);
  });
});
