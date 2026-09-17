import { describe, expect, it } from "vitest";
import {
  isWithinLimit,
  rateLimitResponse,
  shouldOpportunisticallyCleanupRateLimits,
  RATE_LIMIT_CLEANUP_PROBABILITY,
} from "./rateLimit";

describe("isWithinLimit", () => {
  it("allows a count at or below the limit", () => {
    expect(isWithinLimit(1, 5)).toBe(true);
    expect(isWithinLimit(5, 5)).toBe(true);
  });

  it("rejects a count above the limit", () => {
    expect(isWithinLimit(6, 5)).toBe(false);
  });
});

describe("rateLimitResponse", () => {
  it("returns 429 with a Retry-After header and a human-readable message", async () => {
    const response = rateLimitResponse(30);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    const body = await response.json();
    expect(body.error).toContain("30 seconds");
  });

  it("uses singular 'second' for a 1-second retry", async () => {
    const response = rateLimitResponse(1);
    const body = await response.json();
    expect(body.error).toContain("1 second.");
  });
});

describe("shouldOpportunisticallyCleanupRateLimits", () => {
  it("triggers for a random draw below the configured probability", () => {
    expect(shouldOpportunisticallyCleanupRateLimits(0)).toBe(true);
    expect(shouldOpportunisticallyCleanupRateLimits(RATE_LIMIT_CLEANUP_PROBABILITY / 2)).toBe(true);
  });

  it("does not trigger for a random draw at or above the configured probability", () => {
    expect(shouldOpportunisticallyCleanupRateLimits(RATE_LIMIT_CLEANUP_PROBABILITY)).toBe(false);
    expect(shouldOpportunisticallyCleanupRateLimits(0.5)).toBe(false);
    expect(shouldOpportunisticallyCleanupRateLimits(0.999)).toBe(false);
  });

  it("keeps the trigger rate low -- this runs inside every rate-limited request", () => {
    expect(RATE_LIMIT_CLEANUP_PROBABILITY).toBeLessThanOrEqual(0.05);
    expect(RATE_LIMIT_CLEANUP_PROBABILITY).toBeGreaterThan(0);
  });
});
