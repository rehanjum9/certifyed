import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = new Set(["/login"]);

/**
 * Single gate for every page in the app: refreshes the Supabase session
 * cookie on every request (required for @supabase/ssr's server client to
 * stay valid across requests) and redirects unauthenticated visitors away
 * from any page except /login.
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
  const isPublicPage = PUBLIC_PATHS.has(pathname);

  if (!user && !isApiRoute && !isPublicPage) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isPublicPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
