/**
 * A small, explicit allowlist of internal error messages that are already
 * safe to return to a client verbatim -- short, hand-written, and never
 * derived from a raw database/storage/provider error object. Everything
 * else caught at a route boundary is replaced with a generic, route-chosen
 * fallback: throw sites throughout lib/ routinely wrap raw Postgres/Storage
 * errors as `Failed to X: ${error.message}`, and that raw suffix
 * (constraint names, SQL detail, storage internals, provider responses)
 * must never reach an HTTP response body.
 *
 * This deliberately does NOT touch campaign_rows.error_message or
 * jobs.last_error -- those are kept detailed on purpose for an
 * authenticated operator deciding whether/how to retry a specific row or
 * job (see lib/campaigns/emailDelivery.ts), a fundamentally different,
 * intentionally-informative surface from a one-shot API error response.
 */
const SAFE_ERROR_MESSAGES = new Set<string>(["Job not found.", "Campaign not found.", "Template not found."]);

export function safeApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && SAFE_ERROR_MESSAGES.has(error.message)) {
    return error.message;
  }
  return fallback;
}
