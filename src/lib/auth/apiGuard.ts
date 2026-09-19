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

export interface GuardDeps {
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
 * Authentication only -- this function deliberately knows nothing about
 * organizations/workspaces. Every route that touches a specific
 * campaign/template/job/etc. layers organization-scoped authorization on
 * top of this (see lib/auth/organizationGuard.ts's
 * requireOrganizationContext/requireOrganizationMember/
 * requireOrganizationOwner, which all call this first and then add the
 * real per-workspace isolation check), or does its own explicit
 * organization lookup the same way (e.g. the job-processing and Gmail
 * OAuth callback routes). A route calling only guardApiRoute directly is
 * one that genuinely has no organization-scoped resource to check (e.g.
 * setting the active-workspace cookie, or accepting an invite).
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
