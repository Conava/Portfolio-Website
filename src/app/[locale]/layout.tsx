import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getDesign } from "@/lib/design";
import { socialFor } from "@/lib/seo";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/types";
import { SiteShell } from "../site-shell";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/** Site-wide defaults per locale. No `alternates` here: a layout canonical would leak to every child page. */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  if (!routing.locales.includes(locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: t("siteTitle"), template: "%s | Marlon Kranz" },
    description: t("siteDescription"),
    ...socialFor({
      title: t("siteTitle"),
      description: t("siteDescription"),
      locale,
      image: { url: "/images/og/home.jpg", alt: t("ogImageAlt"), width: 1200, height: 630 },
    }),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) notFound();
  return (
    <SiteShell locale={locale as Locale} design={await getDesign()}>
      {children}
    </SiteShell>
  );
}
