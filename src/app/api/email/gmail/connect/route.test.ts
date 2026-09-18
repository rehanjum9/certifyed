import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/organizationGuard", () => ({ requireOrganizationAdmin: vi.fn() }));
vi.mock("@/lib/email/gmailClient", () => ({
  createGmailOAuthClient: vi.fn(),
  GMAIL_SEND_SCOPE: "https://www.googleapis.com/auth/gmail.send",
  GMAIL_IDENTITY_SCOPES: ["openid", "https://www.googleapis.com/auth/userinfo.email"],
}));
vi.mock("@/lib/email/gmailOAuth", () => ({ createOAuthState: vi.fn() }));

import { requireOrganizationAdmin } from "@/lib/auth/organizationGuard";
import { createGmailOAuthClient, GMAIL_SEND_SCOPE, GMAIL_IDENTITY_SCOPES } from "@/lib/email/gmailClient";
import { createOAuthState } from "@/lib/email/gmailOAuth";
import { GET } from "./route";

const ORIGINAL_ENV = { ...process.env };
const ORG_CONTEXT = { user: { id: "user-1", email: null }, organizationId: "org-a", organizationName: "Club A", role: "owner" as const };

beforeEach(() => {
  vi.mocked(requireOrganizationAdmin).mockResolvedValue(ORG_CONTEXT);
  vi.mocked(createOAuthState).mockResolvedValue("random-state-token");
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
});

describe("GET /api/email/gmail/connect", () => {
  it("requires workspace admin/owner access -- returns whatever the guard's response is, without touching Google or creating any state", async () => {
    vi.mocked(requireOrganizationAdmin).mockResolvedValue({
      response: NextResponse.json({ error: "Only a workspace owner or admin can perform this action." }, { status: 403 }),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(createGmailOAuthClient).not.toHaveBeenCalled();
    expect(createOAuthState).not.toHaveBeenCalled();
  });

  it("redirects to the Google consent URL, requesting gmail.send plus the minimum identity scopes, with a real database-backed state token", async () => {
    const generateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?mock=1");
    vi.mocked(createGmailOAuthClient).mockReturnValue({ generateAuthUrl } as never);

    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?mock=1");
    expect(createOAuthState).toHaveBeenCalledWith("org-a", "user-1");
    expect(generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: "offline",
        scope: [GMAIL_SEND_SCOPE, ...GMAIL_IDENTITY_SCOPES],
        prompt: "consent",
        state: "random-state-token",
      }),
    );
  });

  it("never sets a cookie for OAuth state -- the state is database-backed, not client-side", async () => {
    const generateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?mock=1");
    vi.mocked(createGmailOAuthClient).mockReturnValue({ generateAuthUrl } as never);

    const response = await GET();

    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns a 400 configuration error, without creating a state or redirecting, when Gmail OAuth env vars are missing", async () => {
    vi.mocked(createGmailOAuthClient).mockImplementation(() => {
      throw new Error("Gmail is not configured: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI must all be set.");
    });

    const response = await GET();

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/GMAIL_CLIENT_ID/);
    expect(createOAuthState).not.toHaveBeenCalled();
  });
});
