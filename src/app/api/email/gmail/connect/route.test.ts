import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/apiGuard", () => ({ guardApiRoute: vi.fn() }));
vi.mock("@/lib/email/gmailClient", () => ({
  createGmailOAuthClient: vi.fn(),
  GMAIL_SEND_SCOPE: "https://www.googleapis.com/auth/gmail.send",
}));

import { guardApiRoute } from "@/lib/auth/apiGuard";
import { createGmailOAuthClient, GMAIL_SEND_SCOPE } from "@/lib/email/gmailClient";
import { GET } from "./route";
import { GMAIL_OAUTH_STATE_COOKIE } from "@/lib/email/gmailOAuth";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.mocked(guardApiRoute).mockResolvedValue({ user: { id: "operator-1", email: null } });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
});

describe("GET /api/email/gmail/connect", () => {
  it("requires authentication -- returns whatever guardApiRoute's 401 response is, without touching Google", async () => {
    vi.mocked(guardApiRoute).mockResolvedValue({
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(createGmailOAuthClient).not.toHaveBeenCalled();
  });

  it("redirects to the Google consent URL, requesting only gmail.send and offline access", async () => {
    const generateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?mock=1");
    vi.mocked(createGmailOAuthClient).mockReturnValue({ generateAuthUrl } as never);

    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?mock=1");
    expect(generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: "offline",
        scope: [GMAIL_SEND_SCOPE],
        prompt: "consent",
        state: expect.any(String),
      }),
    );
  });

  it("sets an HttpOnly state cookie matching the state passed to Google", async () => {
    const generateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?mock=1");
    vi.mocked(createGmailOAuthClient).mockReturnValue({ generateAuthUrl } as never);

    const response = await GET();

    const cookie = response.cookies.get(GMAIL_OAUTH_STATE_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    const { state } = generateAuthUrl.mock.calls[0][0] as { state: string };
    expect(cookie?.value).toBe(state);
  });

  it("returns a 400 configuration error, without redirecting, when Gmail OAuth env vars are missing", async () => {
    vi.mocked(createGmailOAuthClient).mockImplementation(() => {
      throw new Error("Gmail is not configured: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI must all be set.");
    });

    const response = await GET();

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/GMAIL_CLIENT_ID/);
  });
});
