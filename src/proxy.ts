import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { DESIGN_COOKIE, isDesign } from "./lib/design";
import { getProjectSlugs } from "./lib/content";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);
// ponytail: read once per server process; a new project needs a restart (it needs a deploy anyway).
let slugs: Promise<string[]> | undefined;

export default async function proxy(req: NextRequest) {
  // ?design=x: set the cookie (valid values only) and redirect with only
  // `design` stripped; path (incl. /de) and other params (utm_*) are kept.
  const design = req.nextUrl.searchParams.get("design");
  if (design !== null) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("design");
    const res = NextResponse.redirect(url, { status: 307 });
    if (isDesign(design)) {
      res.cookies.set(DESIGN_COOKIE, design, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    return res;
  }

  // An unknown project slug becomes an unmatched URL, so it gets the server-rendered global
  // 404 (a notFound() in the page would reach the browser only as Next's client error shell).
  const project = req.nextUrl.pathname.match(/^(?:\/(de))?\/projects\/([^/]+)\/?$/);
  if (project) {
    // A failed read is not cached: the next request tries again.
    slugs ??= getProjectSlugs().catch((e) => {
      slugs = undefined;
      throw e;
    });
    if (!(await slugs).includes(project[2])) {
      const headers = new Headers(req.headers);
      headers.set("X-NEXT-INTL-LOCALE", project[1] ?? routing.defaultLocale);
      const url = req.nextUrl.clone();
      url.pathname = `/${project[1] ?? routing.defaultLocale}/projects/${project[2]}/-`;
      return NextResponse.rewrite(url, { request: { headers } });
    }
  }

  // Locale comes from the URL only (/de prefix); next-intl handles the rest.
  return intlMiddleware(req);
}

export const config = {
  // Plus dotted paths under /de and /projects (no files live there), so their 404 is designed and localized.
  matcher: ["/((?!_next|api|.*\\..*).*)", "/de/(.*\\..*)", "/projects/(.*\\..*)", "/en/projects/(.*\\..*)"],
};
