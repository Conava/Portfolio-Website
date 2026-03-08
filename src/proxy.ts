import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const LOCALES = routing.locales;
const LOCALE_COOKIE = "NEXT_LOCALE";

const intlMiddleware = createMiddleware(routing);

export default function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // 1. Redirect legacy locale-prefixed URLs — e.g. /en/projects → /projects
  const localePrefix = pathname.match(/^\/(en|de)(\/.*)?$/);
  if (localePrefix) {
    const rest = localePrefix[2] ?? "/";
    const url = req.nextUrl.clone();
    url.pathname = rest;
    return NextResponse.redirect(url, { status: 301 });
  }

  // 2. Handle ?lang= — set NEXT_LOCALE cookie, redirect to strip param
  const lang = searchParams.get("lang");
  if (lang && (LOCALES as readonly string[]).includes(lang)) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("lang");
    const res = NextResponse.redirect(url, { status: 302 });
    res.cookies.set(LOCALE_COOKIE, lang, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return res;
  }

  // 3. Delegate locale detection and internal rewrite to next-intl
  return intlMiddleware(req);
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
