import type { NextConfig } from "next";
import { buildContentSecurityPolicy, supabaseOriginFromUrl } from "./src/lib/security/csp";

const isDev = process.env.NODE_ENV === "development";
const supabaseOrigin = supabaseOriginFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

const securityHeaders = [
  { key: "Content-Security-Policy", value: buildContentSecurityPolicy({ isDev, supabaseOrigin }) },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Superseded by the CSP's frame-ancestors above for modern browsers;
  // kept alongside it for older browsers that only understand this header
  // (see Next.js's own header docs).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Browsers only honor HSTS over an already-HTTPS connection, so sending
  // it in dev (plain http://localhost) is a documented no-op, not a risk --
  // still gated to production to keep dev's header list easy to reason about.
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  /**
   * P1 security hardening: baseline security headers on every response.
   * See src/lib/security/csp.ts for the CSP itself and why it allows
   * 'unsafe-inline' for scripts/styles (a documented, deliberate tradeoff,
   * not an oversight) rather than per-request nonces.
   */
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
