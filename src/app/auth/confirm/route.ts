import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { findPendingInviteForEmail, acceptInvite } from "@/lib/organizations/invites";
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_MAX_AGE_SECONDS } from "@/lib/organizations/activeWorkspace";

/** The only Supabase Auth OTP types this app's invite links ever use. Any other value is rejected rather than passed through to verifyOtp -- this route has no "forgot password"/magic-link UI, so nothing should ever send one. */
const ALLOWED_OTP_TYPES = new Set(["invite", "recovery"]);

/**
 * Confirms a Supabase Auth email link (currently: workspace invites --
 * architecture report, item 9). This is the officially documented
 * `token_hash`/`verifyOtp` pattern for SSR apps (not the older implicit
 * `#access_token=` flow), matching how every other server client in this
 * app already reads/writes the session cookie (see
 * lib/supabase/server.ts).
 *
 * On success: establishes a real session (sets the Supabase auth cookies
 * on this response), and -- for an invite -- looks up the pending
 * organization_invites row for the now-verified email and creates the
 * matching organization_members row right here, before the user ever sees
 * a page. Public signup stays disabled: this is the ONLY way a session
 * cookie gets set for a brand-new account, and it only ever happens after
 * verifying a token Supabase itself emailed to that address.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!tokenHash || !type || !ALLOWED_OTP_TYPES.has(type)) {
    return NextResponse.redirect(new URL("/login?error=invalid_confirmation_link", request.url));
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(new URL("/set-password", request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data, error } = await supabase.auth.verifyOtp({
    type: type as "invite" | "recovery",
    token_hash: tokenHash,
  });

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login?error=confirmation_failed", request.url));
  }

  if (type === "invite" && data.user.email) {
    const pendingInvite = await findPendingInviteForEmail(data.user.email);
    if (pendingInvite) {
      await acceptInvite(pendingInvite, data.user.id);
      response.cookies.set(ACTIVE_ORG_COOKIE, pendingInvite.organization_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ACTIVE_ORG_COOKIE_MAX_AGE_SECONDS,
        path: "/",
      });
    }
  }

  return response;
}
