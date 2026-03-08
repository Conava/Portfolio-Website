import { compileMDX } from "next-mdx-remote/rsc";
import { getProjectSlugs, getProjectSource } from "@/lib/content";
import type { Locale, ProjectFrontmatter } from "@/lib/types";
import { Projects } from "@/components/sections/projects";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateStaticParams() {
  return [{ locale: "en" }, { locale: "de" }];
}

export default async function ProjectsPage({ params }: Props) {
  const { locale } = await params;
  const loc = locale as Locale;

  const slugs = await getProjectSlugs();
  const projects = await Promise.all(
    slugs.map(async (slug) => {
      const source = await getProjectSource(loc, slug);
      const { frontmatter } = await compileMDX<ProjectFrontmatter>({
        source,
        options: { parseFrontmatter: true },
      });
      return { ...frontmatter, slug };
    })
  );

  // Show all non-hidden projects — including those with hideFromPortfolio: true
  const visibleProjects = projects
    .filter((p) => !p.hidden)
    .sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return b.date.localeCompare(a.date);
    });

  return (
    <main className="min-h-screen pt-16">
      <Projects projects={visibleProjects} index={undefined} isStandalonePage />
    </main>
  );
}
