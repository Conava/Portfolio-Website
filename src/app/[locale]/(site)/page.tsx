import { FlowHome } from "@/components/flow/flow-home";
import { InkHome } from "@/components/ink/ink-home";
import { TypeHome } from "@/components/type/type-home";
import { TraceHome } from "@/components/trace/trace-home";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getHomeContent, loadJson } from "@/lib/content";
import { getDesign } from "@/lib/design";
import { toYearMonth } from "@/lib/lanes";
import { alternatesFor, jsonLdHtml, personJsonLd, socialFor } from "@/lib/seo";
import { getSiteGithub } from "@/lib/site-github";
import { siteConfig } from "@/lib/site-config";
import type { Design } from "@/lib/design-values";
import type { ContactContent, Locale } from "@/lib/types";
import type { SectionProps } from "@/components/home-types";

const HOMES: Record<Design, (props: SectionProps) => React.ReactNode> = {
  keynote: InkHome,
  thread: TraceHome,
  flow: FlowHome,
  type: TypeHome,
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    alternates: alternatesFor("/", locale),
    ...socialFor({
      title: t("siteTitle"),
      description: t("siteDescription"),
      locale,
      path: "/",
      image: { url: "/images/og/home.jpg", alt: t("ogImageAlt"), width: 1200, height: 630 },
    }),
  };
}

export default async function Home({ params }: Props) {
  const locale = (await params).locale as Locale;
  const content = await getHomeContent(locale);
  const [github, design, enContact] = await Promise.all([
    getSiteGithub(locale, content),
    getDesign(),
    // JSON-LD always uses the EN address.
    locale === "en" ? content.contact : loadJson<ContactContent>("en", "contact.json"),
  ]);

  const org = (o: { name: string; url: string }) => ({ name: o.name, url: o.url });
  const current = content.work.jobs.find((j) => j.end === null);
  const jsonLd = personJsonLd({
    name: siteConfig.name,
    url: siteConfig.url,
    jobTitle: siteConfig.jobTitle,
    email: enContact.email,
    image: `${siteConfig.url}${siteConfig.photoPath}`,
    sameAs: [siteConfig.github, siteConfig.linkedin],
    worksFor: current && org({ name: current.company, url: current.url }),
    alumniOf: content.education.schools.filter((s) => s.status === "completed").map(org),
  });

  // One "today" per request, so every lane and timeline agrees.
  const props = { content, github, locale, today: toYearMonth(new Date()) };
  const DesignHome = HOMES[design];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <main id="main">
        <DesignHome {...props} />
      </main>
    </>
  );
}
