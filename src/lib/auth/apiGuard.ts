import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse, type RateLimitConfig } from "@/lib/rateLimit";

export interface ApiUser {
  id: string;
  email: string | null;
}

export interface GuardOptions {
  /** Route-scoped rate limit; internally keyed by `${key}:${user.id}` so each operation is limited per-operator. Omit for auth-only routes. */
  rateLimit?: RateLimitConfig & { key: string };
}

export type GuardResult = { user: ApiUser } | { response: NextResponse };

interface GuardDeps {
  getUser?: () => Promise<ApiUser | null>;
}

function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

async function defaultGetUser(): Promise<ApiUser | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * The one reusable server-side guard for every sensitive API route:
 * validates the caller has an active Supabase Auth session, then
 * (optionally) enforces a per-operator rate limit for that specific
 * operation.
 *
 * Single-operator MVP model: there is no per-resource ownership check here
 * on purpose -- any authenticated session may access any existing
 * campaign/template/job. This is intentional and documented, not an
 * oversight. Before this app supports multiple independent accounts, a
 * real ownership/RLS layer (using auth.uid() against the existing nullable
 * created_by columns) must be added -- do not fake one here.
 *
 * `deps.getUser` is injectable purely for unit testing without a real
 * cookie/session context.
 */
export async function guardApiRoute(options: GuardOptions = {}, deps: GuardDeps = {}): Promise<GuardResult> {
  const getUser = deps.getUser ?? defaultGetUser;
  const user = await getUser();

  if (!user) return { response: unauthorizedResponse() };

  if (options.rateLimit) {
    const { key, limit, windowSeconds } = options.rateLimit;
    const result = await checkRateLimit(`${key}:${user.id}`, limit, windowSeconds);
    if (!result.allowed) return { response: rateLimitResponse(result.retryAfterSeconds) };
  }

  return { user };
}
