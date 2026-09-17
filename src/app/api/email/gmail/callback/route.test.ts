import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/auth/apiGuard", () => ({ guardApiRoute: vi.fn() }));
vi.mock("@/lib/email/gmailClient", () => ({ createGmailOAuthClient: vi.fn() }));

import { guardApiRoute } from "@/lib/auth/apiGuard";
import { createGmailOAuthClient } from "@/lib/email/gmailClient";
import { GET } from "./route";
import { GMAIL_OAUTH_STATE_COOKIE } from "@/lib/email/gmailOAuth";

function requestWithCookie(url: string, cookieValue?: string): NextRequest {
  const headers = cookieValue ? { cookie: `${GMAIL_OAUTH_STATE_COOKIE}=${cookieValue}` } : undefined;
  return new NextRequest(url, { headers });
}

let consoleLogSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(guardApiRoute).mockResolvedValue({ user: { id: "operator-1", email: null } });
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  consoleLogSpy.mockRestore();
});

describe("GET /api/email/gmail/callback", () => {
  it("requires authentication", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    });

    const response = await GET(requestWithCookie("http://localhost:3000/api/email/gmail/callback?code=abc&state=xyz", "xyz"));

    expect(response.status).toBe(401);
    expect(createGmailOAuthClient).not.toHaveBeenCalled();
  });

  it("rejects a request missing the authorization code", async () => {
    const response = await GET(requestWithCookie("http://localhost:3000/api/email/gmail/callback?state=xyz", "xyz"));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("authorization code");
  });

  it("rejects a request with no state cookie set", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/email/gmail/callback?code=abc&state=xyz"));
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/state/i);
  });

  it("rejects a request whose state does not match the cookie", async () => {
    const response = await GET(requestWithCookie("http://localhost:3000/api/email/gmail/callback?code=abc&state=wrong", "xyz"));
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/state/i);
  });

  it("clears the state cookie after a rejected callback", async () => {
    const response = await GET(requestWithCookie("http://localhost:3000/api/email/gmail/callback?code=abc&state=wrong", "xyz"));
    const cookie = response.cookies.get(GMAIL_OAUTH_STATE_COOKIE);
    expect(cookie?.value).toBe("");
  });

  it("exchanges the code, prints the refresh token to the server console once, and never puts it in the response", async () => {
    const getToken = vi.fn().mockResolvedValue({ tokens: { refresh_token: "super-secret-refresh-token" } });
    vi.mocked(createGmailOAuthClient).mockReturnValue({ getToken } as never);

    const response = await GET(requestWithCookie("http://localhost:3000/api/email/gmail/callback?code=abc&state=xyz", "xyz"));

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("super-secret-refresh-token");
    expect(consoleLogSpy.mock.calls.some((call: unknown[]) => call.join(" ").includes("super-secret-refresh-token"))).toBe(true);
  });

  it("clears the state cookie after a successful exchange", async () => {
    const getToken = vi.fn().mockResolvedValue({ tokens: { refresh_token: "token" } });
    vi.mocked(createGmailOAuthClient).mockReturnValue({ getToken } as never);

    const response = await GET(requestWithCookie("http://localhost:3000/api/email/gmail/callback?code=abc&state=xyz", "xyz"));

    expect(response.cookies.get(GMAIL_OAUTH_STATE_COOKIE)?.value).toBe("");
  });

  it("shows a clear error, without printing anything, when Google returns no refresh token", async () => {
    const getToken = vi.fn().mockResolvedValue({ tokens: {} });
    vi.mocked(createGmailOAuthClient).mockReturnValue({ getToken } as never);

    const response = await GET(requestWithCookie("http://localhost:3000/api/email/gmail/callback?code=abc&state=xyz", "xyz"));

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/did not return a refresh token/);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("shows a clear error when the code exchange itself fails, without leaking the raw error to a stack trace in the body", async () => {
    const getToken = vi.fn().mockRejectedValue(new Error("invalid_grant"));
    vi.mocked(createGmailOAuthClient).mockReturnValue({ getToken } as never);

    const response = await GET(requestWithCookie("http://localhost:3000/api/email/gmail/callback?code=abc&state=xyz", "xyz"));

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Failed to complete the Gmail connection");
  });
});
