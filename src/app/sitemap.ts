import type { MetadataRoute } from "next";
import { compileMDX } from "next-mdx-remote/rsc";
import { getProjectSlugs, getProjectSource } from "@/lib/content";
import type { ProjectFrontmatter } from "@/lib/types";
import { siteConfig } from "@/lib/site-config";

/**
 * Next.js metadata route handler that generates `/sitemap.xml`.
 *
 * Lists the home page (priority 1.0) plus all non-hidden project detail pages
 * (priority 0.7). Hidden projects (frontmatter `hidden: true`) are excluded
 * because they are not meaningful public pages and would mislead crawlers.
 *
 * Project slugs are derived from EN filenames via `getProjectSlugs()`; the EN
 * source is used to read frontmatter because slugs are always based on EN
 * filenames and the hidden flag is locale-independent.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await getProjectSlugs();

  // Load EN frontmatter for each slug and filter out hidden projects.
  const visibleSlugs = (
    await Promise.all(
      slugs.map(async (slug) => {
        try {
          const source = await getProjectSource("en", slug);
          const { frontmatter } = await compileMDX<ProjectFrontmatter>({
            source,
            options: { parseFrontmatter: true },
          });
          // Only `hidden` is checked — `hideFromPortfolio` projects remain in
          // the sitemap because they are still accessible at their URL.
          return frontmatter.hidden ? null : slug;
        } catch {
          return null;
        }
      })
    )
  ).filter((slug): slug is string => slug !== null);

  const projectEntries: MetadataRoute.Sitemap = visibleSlugs.map((slug) => ({
    url: `${siteConfig.url}/projects/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    {
      url: siteConfig.url,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1.0,
    },
    ...projectEntries,
  ];
}
