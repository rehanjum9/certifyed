export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
