import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { notFound } from "next/navigation";
import { getProjectSlugs, getProjectSource } from "@/lib/content";
import { mdxComponents } from "@/components/mdx/mdx-components";
import { TechBadge } from "@/components/ui/tech-badge";
import type { Locale, ProjectFrontmatter } from "@/lib/types";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateStaticParams() {
  const slugs = await getProjectSlugs();
  const locales = ["en", "de"];
  return locales.flatMap((locale) =>
    slugs.map((slug) => ({ locale, slug }))
  );
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { from } = await searchParams;
  const t = await getTranslations("common");

  const backHref = from === "overview" ? "/projects" : "/#projects";
  const fromHome = from === "home";

  let source: string;
  try {
    source = await getProjectSource(locale as Locale, slug);
  } catch {
    notFound();
  }

  const { content, frontmatter } = await compileMDX<ProjectFrontmatter>({
    source,
    options: { parseFrontmatter: true, mdxOptions: { remarkPlugins: [remarkGfm] } },
    components: mdxComponents,
  });

  return (
    <main className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
          >
            ← {t("back")}
          </Link>
          {fromHome && (
            <Link
              href="/projects"
              className="text-sm px-3 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
            >
              {t("see_all_projects")} →
            </Link>
          )}
        </div>

        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-[var(--color-accent)] to-purple-400 bg-clip-text text-transparent">
            {frontmatter.title}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            {frontmatter.date}
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {frontmatter.tech.map((tech) => (
              <TechBadge key={tech} name={tech} />
            ))}
          </div>
          {frontmatter.githubUrl && (
            <a
              href={frontmatter.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm px-5 py-2 rounded-full border border-[var(--color-border)] hover:bg-[var(--color-bg-card-hover)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current shrink-0" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              {t("github")} →
            </a>
          )}
        </div>

        <article>{content}</article>
      </div>
    </main>
  );
}
