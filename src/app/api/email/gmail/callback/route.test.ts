import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/auth/apiGuard", () => ({ guardApiRoute: vi.fn() }));
vi.mock("@/lib/organizations/organizations", () => ({ getMembership: vi.fn() }));
vi.mock("@/lib/email/gmailClient", () => ({
  createGmailOAuthClient: vi.fn(),
  getAuthorizedAccountEmail: vi.fn(),
}));
vi.mock("@/lib/email/gmailOAuth", () => ({ consumeOAuthState: vi.fn() }));
vi.mock("@/lib/email/connections", () => ({ saveEmailConnection: vi.fn() }));

import { guardApiRoute } from "@/lib/auth/apiGuard";
import { getMembership } from "@/lib/organizations/organizations";
import { createGmailOAuthClient, getAuthorizedAccountEmail } from "@/lib/email/gmailClient";
import { consumeOAuthState } from "@/lib/email/gmailOAuth";
import { saveEmailConnection } from "@/lib/email/connections";
import { GET } from "./route";

function req(url: string): NextRequest {
  return new NextRequest(url);
}

let consoleLogSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(guardApiRoute).mockResolvedValue({ user: { id: "user-1", email: null } });
  vi.mocked(getMembership).mockResolvedValue({ role: "owner" });
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  consoleLogSpy.mockRestore();
});

const URL = "http://localhost:3000/api/email/gmail/callback?code=abc&state=xyz";

describe("GET /api/email/gmail/callback", () => {
  it("requires authentication -- returns whatever guardApiRoute's response is, without touching the OAuth state at all", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    });

    const response = await GET(req(URL));

    expect(response.status).toBe(401);
    expect(consumeOAuthState).not.toHaveBeenCalled();
  });

  it("rejects a request missing the authorization code", async () => {
    const response = await GET(req("http://localhost:3000/api/email/gmail/callback?state=xyz"));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("authorization code");
  });

  it("rejects a request missing the state param", async () => {
    const response = await GET(req("http://localhost:3000/api/email/gmail/callback?code=abc"));
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/state/i);
  });

  it("rejects an unrecognized/expired/already-consumed/wrong-user state without exchanging any code", async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue({ ok: false, reason: "expired" });

    const response = await GET(req(URL));

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/expired/i);
    expect(createGmailOAuthClient).not.toHaveBeenCalled();
  });

  it("passes the AUTHENTICATED user's id to consumeOAuthState -- never anything from the query string", async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue({ ok: false, reason: "not_found" });

    await GET(req(URL));

    expect(consumeOAuthState).toHaveBeenCalledWith("xyz", "user-1");
  });

  it("rejects the connection if the caller is no longer an admin/owner of the state's organization, even with a valid state", async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue({ ok: true, organizationId: "org-a" });
    vi.mocked(getMembership).mockResolvedValue({ role: "member" });

    const response = await GET(req(URL));

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/permission/i);
    expect(createGmailOAuthClient).not.toHaveBeenCalled();
  });

  it("encrypts and saves the connection using the ID-token-verified account email, and never prints or returns the raw refresh token", async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue({ ok: true, organizationId: "org-a" });
    const getToken = vi.fn().mockResolvedValue({ tokens: { refresh_token: "super-secret-refresh-token", id_token: "fake-id-token" } });
    vi.mocked(createGmailOAuthClient).mockReturnValue({ getToken } as never);
    vi.mocked(getAuthorizedAccountEmail).mockResolvedValue("club-a@gmail.com");
    vi.mocked(saveEmailConnection).mockResolvedValue({ organizationId: "org-a", senderEmail: "club-a@gmail.com", connectedAt: "now" });

    const response = await GET(req(URL));

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("super-secret-refresh-token");
    expect(body).toContain("club-a@gmail.com");
    expect(saveEmailConnection).toHaveBeenCalledWith({
      organizationId: "org-a",
      senderEmail: "club-a@gmail.com",
      refreshToken: "super-secret-refresh-token",
      connectedBy: "user-1",
    });
    // The old single-operator flow printed the refresh token to the server
    // terminal for manual .env setup -- that mechanism must be fully gone.
    expect(
      consoleLogSpy.mock.calls.some((call: unknown[]) => call.join(" ").includes("super-secret-refresh-token")),
    ).toBe(false);
  });

  it("shows a clear error, without saving anything, when Google returns no refresh token", async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue({ ok: true, organizationId: "org-a" });
    const getToken = vi.fn().mockResolvedValue({ tokens: { id_token: "fake-id-token" } });
    vi.mocked(createGmailOAuthClient).mockReturnValue({ getToken } as never);

    const response = await GET(req(URL));

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/did not return a refresh token/);
    expect(saveEmailConnection).not.toHaveBeenCalled();
  });

  it("shows a clear error when the code exchange itself fails, without leaking the raw error to the body", async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue({ ok: true, organizationId: "org-a" });
    const getToken = vi.fn().mockRejectedValue(new Error("invalid_grant"));
    vi.mocked(createGmailOAuthClient).mockReturnValue({ getToken } as never);

    const response = await GET(req(URL));

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Failed to complete the Gmail connection");
  });
});
