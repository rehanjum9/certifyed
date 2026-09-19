import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@supabase/ssr";
import { proxy } from "./proxy";

function mockSupabaseClient(user: { id: string } | null) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  vi.clearAllMocks();
});

describe("proxy (auth gate)", () => {
  it("redirects an unauthenticated visitor away from a protected page, preserving the intended destination", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient(null) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/campaigns"));

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("redirectTo=%2Fcampaigns");
  });

  it("lets an unauthenticated visitor reach /login without redirecting", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient(null) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/login"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("lets an unauthenticated request reach an API route without an HTML redirect -- API routes enforce their own 401", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient(null) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/api/health"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects an authenticated visitor away from /login to the dashboard", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient({ id: "operator-1" }) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/login"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it.each(["/", "/about", "/how-to-use", "/privacy"])("lets an unauthenticated visitor reach the public page %s without redirecting", async (path) => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient(null) as never);

    const response = await proxy(new NextRequest(`http://localhost:3000${path}`));

    expect(response.headers.get("location")).toBeNull();
  });

  it.each(["/", "/about", "/how-to-use", "/privacy"])(
    "lets an authenticated visitor reach the public page %s without redirecting -- they may still browse it while signed in",
    async (path) => {
      vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient({ id: "operator-1" }) as never);

      const response = await proxy(new NextRequest(`http://localhost:3000${path}`));

      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("redirects an unauthenticated visitor away from /dashboard, preserving the intended destination", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient(null) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/dashboard"));

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("redirectTo=%2Fdashboard");
  });

  it("lets an authenticated visitor reach /dashboard without redirecting", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient({ id: "operator-1" }) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/dashboard"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("lets an authenticated visitor reach a protected page without redirecting", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient({ id: "operator-1" }) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/campaigns"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("lets an authenticated request reach an API route without redirecting", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient({ id: "operator-1" }) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/api/campaigns"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("lets an unauthenticated visitor reach /auth/confirm without redirecting to /login -- that route establishes the session itself", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient(null) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/auth/confirm?token_hash=abc&type=invite"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("lets an unauthenticated visitor reach /auth/invite without redirecting to /login -- only the browser can read its URL fragment, and it establishes the session itself once it does", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient(null) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/auth/invite"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects an unauthenticated visitor away from /set-password -- it must only ever be reached with a real session already established", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient(null) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/set-password"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("lets an authenticated visitor (session already established, e.g. by /auth/invite) reach /set-password without redirecting", async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient({ id: "invited-user-1" }) as never);

    const response = await proxy(new NextRequest("http://localhost:3000/set-password"));

    expect(response.headers.get("location")).toBeNull();
  });
});
