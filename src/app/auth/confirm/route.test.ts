import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/organizations/invites", () => ({ findPendingInviteForEmail: vi.fn(), acceptInvite: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));

import { createServerClient } from "@supabase/ssr";
import { findPendingInviteForEmail, acceptInvite } from "@/lib/organizations/invites";
import { GET } from "./route";
import type { OrganizationInviteRow } from "@/lib/organizations/types";

function mockSupabase(verifyOtpResult: {
  data: { user: { id: string; email: string | null } | null };
  error: { message: string } | null;
}) {
  return { auth: { verifyOtp: vi.fn().mockResolvedValue(verifyOtpResult) } };
}

afterEach(() => {
  vi.clearAllMocks();
});

function req(url: string) {
  return new NextRequest(url);
}

const PENDING_INVITE: OrganizationInviteRow = {
  id: "invite-1",
  organization_id: "org-a",
  email: "person@club.example",
  role: "member",
  invited_by: "owner-1",
  accepted_at: null,
  expires_at: new Date(Date.now() + 100000).toISOString(),
  created_at: new Date().toISOString(),
};

describe("GET /auth/confirm", () => {
  it("redirects to /login with an error when token_hash is missing", async () => {
    const response = await GET(req("http://localhost:3000/auth/confirm?type=recovery"));
    expect(response.headers.get("location")).toContain("/login?error=invalid_confirmation_link");
  });

  it("redirects to /login with an error when type is missing", async () => {
    const response = await GET(req("http://localhost:3000/auth/confirm?token_hash=abc"));
    expect(response.headers.get("location")).toContain("/login?error=invalid_confirmation_link");
  });

  it("redirects to /login with an error for an unsupported otp type (e.g. magiclink) -- this app never sends one", async () => {
    const response = await GET(req("http://localhost:3000/auth/confirm?token_hash=abc&type=magiclink"));
    expect(response.headers.get("location")).toContain("/login?error=invalid_confirmation_link");
  });

  it("redirects to /login with an error when verifyOtp itself fails", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabase({ data: { user: null }, error: { message: "Token has expired" } }) as never);

    const response = await GET(req("http://localhost:3000/auth/confirm?token_hash=abc&type=recovery"));

    expect(response.headers.get("location")).toContain("/login?error=confirmation_failed");
  });

  describe("recovery flow compatibility", () => {
    it("a type=recovery link establishes the session and redirects to /set-password", async () => {
      vi.mocked(createServerClient).mockReturnValue(
        mockSupabase({ data: { user: { id: "user-1", email: "person@club.example" } }, error: null }) as never,
      );

      const response = await GET(req("http://localhost:3000/auth/confirm?token_hash=abc&type=recovery"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost:3000/set-password");
    });

    it("never runs invite-acceptance logic for a recovery link", async () => {
      vi.mocked(createServerClient).mockReturnValue(
        mockSupabase({ data: { user: { id: "user-1", email: "person@club.example" } }, error: null }) as never,
      );

      await GET(req("http://localhost:3000/auth/confirm?token_hash=abc&type=recovery"));

      expect(findPendingInviteForEmail).not.toHaveBeenCalled();
      expect(acceptInvite).not.toHaveBeenCalled();
    });

    it("never sets the active-workspace cookie for a recovery link", async () => {
      vi.mocked(createServerClient).mockReturnValue(
        mockSupabase({ data: { user: { id: "user-1", email: "person@club.example" } }, error: null }) as never,
      );

      const response = await GET(req("http://localhost:3000/auth/confirm?token_hash=abc&type=recovery"));

      expect(response.cookies.get("active_org_id")).toBeUndefined();
    });
  });

  describe("invite flow (unchanged by recovery support)", () => {
    it("finalizes a pending invite and sets the active-workspace cookie, then redirects to /set-password", async () => {
      vi.mocked(createServerClient).mockReturnValue(
        mockSupabase({ data: { user: { id: "user-1", email: "person@club.example" } }, error: null }) as never,
      );
      vi.mocked(findPendingInviteForEmail).mockResolvedValue(PENDING_INVITE);

      const response = await GET(req("http://localhost:3000/auth/confirm?token_hash=abc&type=invite"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost:3000/set-password");
      expect(acceptInvite).toHaveBeenCalledWith(PENDING_INVITE, "user-1");
      expect(response.cookies.get("active_org_id")?.value).toBe("org-a");
    });

    it("still redirects to /set-password even when no pending invite is found (e.g. an already-consumed link)", async () => {
      vi.mocked(createServerClient).mockReturnValue(
        mockSupabase({ data: { user: { id: "user-1", email: "person@club.example" } }, error: null }) as never,
      );
      vi.mocked(findPendingInviteForEmail).mockResolvedValue(null);

      const response = await GET(req("http://localhost:3000/auth/confirm?token_hash=abc&type=invite"));

      expect(response.headers.get("location")).toBe("http://localhost:3000/set-password");
      expect(acceptInvite).not.toHaveBeenCalled();
    });
  });
});
