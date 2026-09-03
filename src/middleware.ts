import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Login gate.
 *
 * Runs at the edge before any page is served, so a visitor without a valid
 * Supabase session never receives the application at all. It also refreshes
 * the session cookie on every request so logins don't expire mid-use.
 *
 * Excluded: the login page, Next's static assets, the icons, and the PWA
 * manifest + service worker — the OS/browser fetches those to decide
 * installability and to register offline support before any session
 * cookie exists, so gating them behind login breaks "Add to Home Screen".
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons|icon|apple-icon|favicon|manifest|sw\\.js).*)",
  ],
};

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: { headers: req.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No backend configured (local-storage mode) — nothing to gate against.
  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: { headers: req.headers } });
        cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  // getUser() revalidates against Supabase — don't trust the cookie alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = req.nextUrl.pathname === "/login";

  if (!user && !isLoginPage) {
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    const from = req.nextUrl.pathname + req.nextUrl.search;
    if (from && from !== "/") to.searchParams.set("next", from);
    return NextResponse.redirect(to);
  }

  // Already signed in and sitting on the login page — send them onward.
  if (user && isLoginPage) {
    const to = req.nextUrl.clone();
    to.pathname = req.nextUrl.searchParams.get("next") || "/";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return res;
}
