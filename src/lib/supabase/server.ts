import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Session-aware server client: reads/refreshes the caller's own Supabase
 * Auth session from cookies. This is what guardApiRoute's defaultGetUser,
 * lib/organizations/pageContext.ts, and every server component/route that
 * needs to know WHO is calling use -- it is subject to RLS as that user,
 * never a privileged client (see createServiceRoleClient below for that).
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component with no request to attach to;
            // safe to ignore as long as a proxy/middleware refreshes sessions.
          }
        },
      },
    },
  );
}

/**
 * P1 hardening: fails with one clear, actionable error instead of letting
 * `!`-asserted undefined env vars reach the Supabase SDK, which would
 * otherwise surface as a confusing generic error (e.g. "Invalid URL") with
 * no indication of which env var is actually missing. Never includes the
 * secret's own value -- only whether it's present. This is a server
 * misconfiguration error; it must never be forwarded verbatim to an API
 * response (see lib/apiError.ts's route-boundary sanitization).
 */
function requireServiceRoleEnv(): { url: string; secretKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !secretKey && "SUPABASE_SECRET_KEY",
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0) {
    throw new Error(
      `Server misconfiguration: ${missing.join(" and ")} must be set. This is a deployment configuration issue, not a request-specific error.`,
    );
  }

  return { url: url!, secretKey: secretKey! };
}

/**
 * Privileged client that bypasses Row Level Security entirely. Real
 * per-user auth exists (Supabase Auth, see createServerSupabaseClient
 * above) -- this client is used anyway for every actual read/write because
 * organization-level isolation in this app is enforced primarily at the
 * APPLICATION layer (every query explicitly filtered by organization_id --
 * see lib/organizations/organizations.ts, lib/templates.ts, etc. -- with
 * RLS as defense-in-depth, not the primary boundary; see
 * supabase/migrations/0009_enforce_organization_ownership.sql). Never
 * import this from a Client Component; the secret key it uses must never
 * reach the browser.
 */
export function createServiceRoleClient() {
  const { url, secretKey } = requireServiceRoleEnv();
  return createClient<Database>(url, secretKey, { auth: { persistSession: false } });
}
