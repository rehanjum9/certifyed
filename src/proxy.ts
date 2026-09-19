import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Freely viewable by anyone, signed in or not -- never redirected away
// either direction. Real campaign/template/recipient data must never be
// fetched from these routes (see src/app/page.tsx, src/app/about/page.tsx,
// src/app/how-to-use/page.tsx, src/app/privacy/page.tsx -- all static/demo
// content only).
const PUBLIC_SITE_PATHS = new Set(["/", "/about", "/how-to-use", "/privacy"]);
// Viewable only while signed out; an authenticated visitor is sent to the
// real app instead of these forms.
const LOGIN_PATH = "/login";
const SIGNED_OUT_AUTH_PATHS = new Set([LOGIN_PATH, "/forgot-password"]);

/**
 * Single gate for every page in the app: refreshes the Supabase session
 * cookie on every request (required for @supabase/ssr's server client to
 * stay valid across requests), keeps the public marketing pages open to
 * everyone, and redirects unauthenticated visitors away from the
 * authenticated app (/dashboard, /templates, /campaigns, /settings, ...)
 * to /login.
 *
 * API routes are intentionally NOT redirected here -- they enforce their
 * own 401 via guardApiRoute (src/lib/auth/apiGuard.ts), which returns JSON
 * instead of an HTML redirect. This proxy still refreshes their session
 * cookie, which is harmless and keeps sessions alive for API calls made
 * from the browser.
 *
 * Named `proxy` (not `middleware`) per Next.js 16's renamed file
 * convention -- same file location and `config.matcher`, same behavior,
 * only the export name changed. See the P1 security report.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const isPublicSitePage = PUBLIC_SITE_PATHS.has(pathname);
  // /login and /forgot-password are both signed-out-only forms -- neither
  // needs (or should show) a real session.
  const isSignedOutAuthPage = SIGNED_OUT_AUTH_PATHS.has(pathname);
  // /auth/confirm establishes the session itself (via verifyOtp) -- the
  // visitor is never authenticated yet when this request arrives, so it
  // must never be redirected to /login the way other authenticated-app
  // pages are. It performs its own token_hash validation regardless.
  const isAuthRoute = pathname.startsWith("/auth/");

  // An authenticated visitor doesn't need the sign-in/forgot-password
  // forms -- send them straight to the real app. They may still freely
  // browse the public marketing pages (home/about/how-to-use) while
  // signed in.
  if (user && isSignedOutAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!user && !isApiRoute && !isAuthRoute && !isPublicSitePage && !isSignedOutAuthPage) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
