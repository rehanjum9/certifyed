import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Per-operation limits for the single-operator MVP. Keyed by operation name
 * only -- callers combine this with the caller's user id to form the actual
 * rate-limit key (see guardApiRoute), so each operator is limited
 * independently per operation, not globally across the whole app.
 *
 * jobProcess is deliberately generous: the browser polling loop
 * (GenerationPanel/EmailDeliveryPanel) legitimately calls this route every
 * ~400-500ms while a batch is actively running, so the limit must stay well
 * above that cadence even with a couple of tabs open.
 */
export const RATE_LIMITS = {
  templateCreate: { limit: 10, windowSeconds: 600 },
  campaignCreate: { limit: 10, windowSeconds: 600 },
  testEmail: { limit: 5, windowSeconds: 600 },
  emailStart: { limit: 10, windowSeconds: 600 },
  generationStart: { limit: 20, windowSeconds: 600 },
  jobProcess: { limit: 240, windowSeconds: 60 },
  retryGeneration: { limit: 10, windowSeconds: 600 },
  retryEmail: { limit: 10, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitConfig>;

/** Pure boundary check, split out so the limit decision itself is unit-testable without a database. */
export function isWithinLimit(count: number, limit: number): boolean {
  return count <= limit;
}

/**
 * Fixed-window rate limiting backed by Postgres (via the existing Supabase
 * project) -- deliberately not in-memory, since in-memory counters don't
 * work correctly across multiple serverless function instances. The bucket
 * key already encodes the window, so `increment_rate_limit`
 * (supabase/migrations/0003_rate_limits.sql) can do one atomic
 * INSERT ... ON CONFLICT ... DO UPDATE per call -- concurrent callers in
 * the same window can never under-count each other.
 *
 * Requires that migration to be applied. If the RPC errors (e.g. the
 * migration hasn't been applied yet, or the store is briefly unavailable),
 * this fails OPEN -- allows the request through -- rather than taking the
 * whole app down over a rate-limit-store outage. This is a deliberate
 * tradeoff: rate limiting is defense-in-depth here, not the primary
 * security boundary (authentication is).
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(Date.now() / windowMs) * windowMs;
  const bucketKey = `${key}:${windowStartMs}`;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowMs - Date.now()) / 1000));

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_bucket_key: bucketKey,
    p_window_start: new Date(windowStartMs).toISOString(),
  });

  if (error) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const count = typeof data === "number" ? data : 0;
  return { allowed: isWithinLimit(count, limit), retryAfterSeconds };
}

export function rateLimitResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: `Too many requests. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
