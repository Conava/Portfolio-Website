import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { mdxComponents } from "@/components/mdx/mdx-components";
import { RepoFacts } from "@/components/shared/github/repo-facts";
import { ActionLink } from "@/components/shared/action-link";
import { ArrowLeftIcon } from "@/components/shared/icons";
import { Link } from "@/i18n/navigation";
import { contentGithubRefs, getHomeContent, getProjectSlugs, getProjectSource } from "@/lib/content";
import { getDesign } from "@/lib/design";
import { alternatesFor, socialFor } from "@/lib/seo";
import { getSiteGithub } from "@/lib/site-github";
import type { Locale, ProjectFrontmatter } from "@/lib/types";
import "@/components/shared/prose.css";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateStaticParams() {
  const slugs = await getProjectSlugs();
  return ["en", "de"].flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

/**
 * Per-project metadata from MDX frontmatter. The bare title gets the layout's
 * "%s | Marlon Kranz" template; an unknown slug falls back to layout defaults.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;

  let source: string;
  try {
    source = await getProjectSource(locale as Locale, slug);
  } catch {
    return {};
  }

  const { frontmatter } = await compileMDX<ProjectFrontmatter>({
    source,
    options: { parseFrontmatter: true },
  });

  const m = await getTranslations({ locale, namespace: "meta" });
  const image =
    frontmatter.thumbnail
      ? { url: frontmatter.thumbnail, alt: frontmatter.title }
      : { url: "/images/og/home.jpg", alt: m("ogImageAlt"), width: 1200, height: 630 };
  return {
    title: frontmatter.title,
    description: frontmatter.summary,
    alternates: alternatesFor(`/projects/${slug}`, locale as Locale),
    ...socialFor({
      title: frontmatter.title,
      description: frontmatter.summary,
      locale: locale as Locale,
      path: `/projects/${slug}`,
      type: "article",
      image,
    }),
  };
}

/** "owner/name" from a github.com URL, or null. */
function repoOf(url?: string) {
  return url?.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i)?.[1] ?? null;
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale = rawLocale as Locale;
  const { from } = await searchParams;

  let source: string;
  try {
    source = await getProjectSource(locale, slug);
  } catch {
    notFound();
  }

  const [t, home, design, { content, frontmatter }] = await Promise.all([
    getTranslations("projects"),
    getHomeContent(locale),
    getDesign(),
    compileMDX<ProjectFrontmatter>({
      source,
      options: { parseFrontmatter: true, mdxOptions: { remarkPlugins: [remarkGfm] } },
      components: mdxComponents,
    }),
  ]);

  // Same refs as the homepage, so both share one cached GitHub fetch.
  const refs = contentGithubRefs(home);
  const repo = repoOf(frontmatter.githubUrl);
  const knownRepo = repo && refs.repos.find((r) => r.toLowerCase() === repo.toLowerCase());
  const github = knownRepo ? await getSiteGithub(locale, home) : null;

  const [name, sub] = splitTitle(frontmatter.title);
  // Ink's signature ink-blue period closes the title.
  const dot = design === "keynote" && <span className="pj-dot" aria-hidden="true">.</span>;

  return (
    <main id="main" className="pj">
      <article className="wrap pj-article">
        {/* not <header>: analytics would attribute its links to the site header; the id names them */}
        <section id="article-head" className="pj-head grid-12">
          <p className="pj-back">
            <Link href={from === "overview" ? "/projects" : "/#projects"}>
              <ArrowLeftIcon />
              {t("back")}
            </Link>
          </p>
          <h1 className="pj-title">
            {sub ? (
              <>
                {name} <span className="pj-sub">{sub}{dot}</span>
              </>
            ) : (
              <>
                {name}
                {dot}
              </>
            )}
          </h1>
          <p className="lede">{frontmatter.summary}</p>
          <ul className="pj-meta meta">
            <li>{frontmatter.date}</li>
            <li>{frontmatter.tech.join(", ")}</li>
            {frontmatter.githubUrl && (
              <li>
                <ActionLink href={frontmatter.githubUrl}>{t("github")}</ActionLink>
              </li>
            )}
            {knownRepo && github && (
              <li>
                <RepoFacts repo={knownRepo} github={github} locale={locale} />
              </li>
            )}
          </ul>
        </section>
        <section id="article" className="pj-body grid-12">
          {content}
        </section>
      </article>
    </main>
  );
}

/** "devline: Agentic Dev Pipeline" -> ["devline:", "Agentic Dev Pipeline"]; the visible text stays the same. */
function splitTitle(title: string): [string, string | null] {
  const i = title.indexOf(": ");
  return i < 0 ? [title, null] : [title.slice(0, i + 1), title.slice(i + 2)];
}
