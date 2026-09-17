export interface PrimaryCta {
  label: string;
  href: string;
}

/**
 * The one place that decides where the public site's primary action
 * points: signed-in visitors go straight to the real app, signed-out
 * visitors go to sign in. `unauthenticatedLabel` lets callers use the
 * site's copy ("Get started" in the hero/CTAs, "Sign in" in nav) while
 * keeping the authenticated destination/label identical everywhere.
 */
export function getPrimaryCta(isAuthenticated: boolean, unauthenticatedLabel = "Get started"): PrimaryCta {
  return isAuthenticated ? { label: "Open Dashboard", href: "/dashboard" } : { label: unauthenticatedLabel, href: "/login" };
}
