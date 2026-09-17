import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, supabaseOriginFromUrl } from "./csp";

describe("buildContentSecurityPolicy", () => {
  it("pins default-src, object-src, frame-ancestors, base-uri, and form-action to safe values", () => {
    const csp = buildContentSecurityPolicy({ isDev: false });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("includes 'unsafe-eval' in development only", () => {
    expect(buildContentSecurityPolicy({ isDev: true })).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy({ isDev: false })).not.toContain("'unsafe-eval'");
  });

  it("includes upgrade-insecure-requests in production only (dev runs over plain http)", () => {
    expect(buildContentSecurityPolicy({ isDev: false })).toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy({ isDev: true })).not.toContain("upgrade-insecure-requests");
  });

  it("allows connecting to self and the configured Supabase origin only", () => {
    const csp = buildContentSecurityPolicy({ isDev: false, supabaseOrigin: "https://project.supabase.co" });
    const connectSrc = csp.split("; ").find((d) => d.startsWith("connect-src"));
    expect(connectSrc).toBe("connect-src 'self' https://project.supabase.co");
  });

  it("falls back to connect-src 'self' only when no Supabase origin is known", () => {
    const csp = buildContentSecurityPolicy({ isDev: false });
    const connectSrc = csp.split("; ").find((d) => d.startsWith("connect-src"));
    expect(connectSrc).toBe("connect-src 'self'");
  });

  it("never contains a raw newline (safe to send as a single header value)", () => {
    const csp = buildContentSecurityPolicy({ isDev: false, supabaseOrigin: "https://project.supabase.co" });
    expect(csp).not.toContain("\n");
  });
});

describe("supabaseOriginFromUrl", () => {
  it("extracts scheme+host, dropping any path", () => {
    expect(supabaseOriginFromUrl("https://abcdefgh.supabase.co")).toBe("https://abcdefgh.supabase.co");
    expect(supabaseOriginFromUrl("https://abcdefgh.supabase.co/rest/v1")).toBe("https://abcdefgh.supabase.co");
  });

  it("returns null for a missing value", () => {
    expect(supabaseOriginFromUrl(undefined)).toBeNull();
  });

  it("returns null for an invalid URL instead of throwing", () => {
    expect(supabaseOriginFromUrl("not a url")).toBeNull();
  });
});
