import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getDesign } from "@/lib/design";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/types";
import NotFound from "./[locale]/(site)/not-found";
import { SiteChrome } from "./site-chrome";
import { SiteShell } from "./site-shell";

// Unmatched URLs render here, as a full server-rendered document with status 404. A notFound()
// thrown inside the [locale] tree only reaches the browser as Next's client-rendered error shell,
// because that layout reads a cookie and so renders dynamically.

async function requestLocale(): Promise<Locale> {
  // The proxy (next-intl) passes the locale from the URL prefix.
  const l = await getLocale();
  return routing.locales.includes(l as Locale) ? (l as Locale) : routing.defaultLocale;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await requestLocale(), namespace: "notFound" });
  return { metadataBase: new URL(siteConfig.url), title: `${t("message")} | ${siteConfig.name}` };
}

export default async function GlobalNotFound() {
  const locale = await requestLocale();
  const design = await getDesign();
  return (
    <SiteShell locale={locale} design={design}>
      <SiteChrome locale={locale} design={design}>
        <NotFound />
      </SiteChrome>
    </SiteShell>
  );
}
