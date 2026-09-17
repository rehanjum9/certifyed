import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Session-aware server client. Unused until Supabase Auth is added, but
 * wired now so that future auth work is additive, not a rewrite.
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
 * Privileged client that bypasses Row Level Security. This is what all
 * current server code (route handlers, the job worker) uses, since there is
 * no per-user auth yet. Never import this from a Client Component.
 */
export function createServiceRoleClient() {
  const { url, secretKey } = requireServiceRoleEnv();
  return createClient<Database>(url, secretKey, { auth: { persistSession: false } });
}
