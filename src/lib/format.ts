// Fixed locale + timeZone -- toLocaleDateString(undefined, ...) previously
// used the RUNTIME's own default locale, which differs between the Node.js
// server (however that host is configured) and the browser (the visitor's
// own navigator.language), producing different text for the same
// timestamp (e.g. "18 Sept 2026" vs "Sep 18, 2026") -- a React hydration
// mismatch, since this is called from both server- and client-rendered
// output. Pinning both locale and timeZone makes the result depend only on
// the input timestamp, identical on every server and every browser.
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  return DATE_FORMATTER.format(new Date(iso));
}

const RELATIVE_UNITS: [string, number][] = [
  ["y", 365 * 24 * 60 * 60 * 1000],
  ["mo", 30 * 24 * 60 * 60 * 1000],
  ["d", 24 * 60 * 60 * 1000],
  ["h", 60 * 60 * 1000],
  ["m", 60 * 1000],
];

/** Compact relative timestamp for activity feeds (e.g. "2h ago"). Falls back to "just now" under a minute. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
  if (diffMs < 60 * 1000) return "just now";

  for (const [suffix, ms] of RELATIVE_UNITS) {
    if (diffMs >= ms) {
      return `${Math.floor(diffMs / ms)}${suffix} ago`;
    }
  }
  return "just now";
}
