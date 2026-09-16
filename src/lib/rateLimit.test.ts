import { describe, expect, it } from "vitest";
import { isWithinLimit, rateLimitResponse } from "./rateLimit";

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
