/**
 * Masks an email address for display, e.g. "jo***@example.com". Used only
 * to show the operator which address test sends will go to -- the full
 * configured address is never returned from a public API response, only
 * ever rendered server-side into the page itself.
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return "***";

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const visible = local.slice(0, Math.min(2, local.length));

  return `${visible}***@${domain}`;
}
