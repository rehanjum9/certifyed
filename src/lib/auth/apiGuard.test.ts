import { describe, expect, it, vi, afterEach } from "vitest";
import { guardApiRoute } from "./apiGuard";

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
  rateLimitResponse: (retryAfterSeconds: number) =>
    new Response(JSON.stringify({ error: `Too many requests. Try again in ${retryAfterSeconds}s.` }), {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }),
}));

import { checkRateLimit } from "@/lib/rateLimit";

afterEach(() => {
  vi.clearAllMocks();
});

describe("guardApiRoute", () => {
  it("returns a 401 response when there is no active session", async () => {
    const result = await guardApiRoute({}, { getUser: async () => null });
    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(401);
    }
  });

  it("does not check rate limits at all for an unauthenticated caller", async () => {
    await guardApiRoute({ rateLimit: { key: "op", limit: 5, windowSeconds: 60 } }, { getUser: async () => null });
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("returns the authenticated user when no rate limit is configured", async () => {
    const result = await guardApiRoute({}, { getUser: async () => ({ id: "operator-1", email: "op@example.com" }) });
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.id).toBe("operator-1");
    }
  });

  it("keys the rate-limit check by operation and the caller's own user id", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 });
    await guardApiRoute(
      { rateLimit: { key: "test-email", limit: 5, windowSeconds: 600 } },
      { getUser: async () => ({ id: "operator-1", email: null }) },
    );
    expect(checkRateLimit).toHaveBeenCalledWith("test-email:operator-1", 5, 600);
  });

  it("returns a 429 response when the rate limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const result = await guardApiRoute(
      { rateLimit: { key: "op", limit: 5, windowSeconds: 60 } },
      { getUser: async () => ({ id: "operator-1", email: null }) },
    );
    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(429);
    }
  });

  it("returns the user when within the rate limit", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 });
    const result = await guardApiRoute(
      { rateLimit: { key: "op", limit: 5, windowSeconds: 60 } },
      { getUser: async () => ({ id: "operator-1", email: null }) },
    );
    expect("user" in result).toBe(true);
  });
});
