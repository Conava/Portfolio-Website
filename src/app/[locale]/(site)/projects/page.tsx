import matter from "gray-matter";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { alternatesFor, socialFor } from "@/lib/seo";
import { getProjectSlugs, getProjectSource } from "@/lib/content";
import type { Locale, ProjectFrontmatter } from "@/lib/types";
import "@/components/shared/prose.css";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateStaticParams() {
  return [{ locale: "en" }, { locale: "de" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const [t, m] = await Promise.all([
    getTranslations({ locale, namespace: "projects" }),
    getTranslations({ locale, namespace: "meta" }),
  ]);
  return {
    title: t("all"),
    alternates: alternatesFor("/projects", locale as Locale),
    ...socialFor({
      title: t("all"),
      description: m("siteDescription"),
      locale: locale as Locale,
      path: "/projects",
      image: { url: "/images/og/home.jpg", alt: m("ogImageAlt"), width: 1200, height: 630 },
    }),
  };
}

export default async function ProjectsPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  const t = await getTranslations("projects");

  const projects = await Promise.all(
    (await getProjectSlugs()).map(async (slug) => ({
      ...(matter(await getProjectSource(locale, slug)).data as ProjectFrontmatter),
      slug,
    })),
  );

  // Every non-hidden project, including hideFromPortfolio ones; featured first, then newest.
  const visible = projects
    .filter((p) => !p.hidden)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || b.date.localeCompare(a.date));

  return (
    <main id="main" className="pj">
      <section className="wrap pj-index">
        <h1 className="pj-title">{t("all")}</h1>
        <ul className="pj-rows">
          {visible.map((p) => {
            const i = p.title.indexOf(": ");
            return (
              <li key={p.slug} className="pj-row">
                <h2>
                  <Link href={`/projects/${p.slug}?from=overview`}>{i < 0 ? p.title : p.title.slice(0, i)}</Link>
                  {i >= 0 && <span className="pj-sub">{p.title.slice(i + 2)}</span>}
                </h2>
                <p className="pj-row-blurb">{p.summary}</p>
                <p className="pj-row-year meta">{p.date}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
