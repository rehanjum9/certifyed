export interface CspOptions {
  isDev: boolean;
  /** Origin (scheme+host, no path) the browser needs for direct Supabase Auth calls (sign-in/sign-out run client-side). Omit when unknown/unset. */
  supabaseOrigin?: string | null;
}

/**
 * The app's Content-Security-Policy, built once at server/config-eval time
 * (not per-request -- this app does not use per-request nonces; see the P1
 * security report for why that was deliberately not chosen here).
 *
 * Deliberately allows 'unsafe-inline' for both script-src and style-src:
 * - script-src: Next.js App Router injects inline `<script>` tags for RSC
 *   streaming/hydration on every dynamically-rendered page (which is every
 *   page in this app). Without a nonce mechanism, blocking inline scripts
 *   entirely would break the app outright, not just a corner case.
 * - style-src: several components (the certificate editor's field overlay,
 *   recipient canvas, and progress bars) set inline `style={{...}}` for
 *   computed positions/percentages -- there is no nonce mechanism for
 *   inline style *attributes* (CSP nonces only cover <style> elements).
 *
 * This is a deliberate, documented tradeoff, not an oversight: the
 * meaningful protection this policy still provides is `connect-src`
 * (blocks exfiltration to any origin except this app and Supabase Auth),
 * `object-src 'none'`, `frame-ancestors 'none'`, and `base-uri'/'form-action'
 * pinned to 'self'.
 */
export function buildContentSecurityPolicy({ isDev, supabaseOrigin }: CspOptions): string {
  const connectSrc = ["'self'", supabaseOrigin].filter((v): v is string => Boolean(v)).join(" ");

  const directives = [
    `default-src 'self'`,
    // 'unsafe-eval' only in development -- React's dev-mode error
    // reconstruction uses eval(); production Next.js never does.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    // `data:` is required -- Canva SVG exports can embed raster logos as
    // base64 data URIs (see lib/svg/sanitize.ts's SAFE_DATA_IMAGE_URI).
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src ${connectSrc}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    !isDev && "upgrade-insecure-requests",
  ];

  return directives.filter((d): d is string => Boolean(d)).join("; ");
}

/** Extracts just the origin (scheme+host) from a full Supabase project URL, for connect-src -- never the full URL/path. Returns null for a missing/invalid value rather than throwing, since this runs at config-eval time. */
export function supabaseOriginFromUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}
