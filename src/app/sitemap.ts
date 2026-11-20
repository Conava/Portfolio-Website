import matter from "gray-matter";
import type { MetadataRoute } from "next";
import { ARTICLE_SLUGS, getArticle, getProjectSlugs, getProjectSource } from "@/lib/content";
import { localizedPath } from "@/lib/seo";
import { articlesLive, siteConfig } from "@/lib/site-config";
import type { Locale, ProjectFrontmatter } from "@/lib/types";

// Read per request: the ARTICLES switch is a runtime env, so a build-time sitemap would miss it.
export const dynamic = "force-dynamic";

const LOCALES: Locale[] = ["en", "de"];

/**
 * One entry per path and locale, each listing both languages (and English as x-default) as `xhtml:link` alternates.
 * `lastModified` is set only for articles, which carry a real date; project dates are years.
 * The DE entry reuses the EN date: both locales are updated together. The playground is English only:
 * one entry, no DE alternate.
 */
export function sitemapEntries(input: {
  articles: { slug: string; updated: string }[];
  projectSlugs: string[];
}): MetadataRoute.Sitemap {
  const pages: { path: string; lastModified?: string }[] = [
    { path: "/" },
    ...input.articles.map((a) => ({ path: `/${a.slug}`, lastModified: a.updated })),
    { path: "/playground" },
    { path: "/projects" },
    ...input.projectSlugs.map((slug) => ({ path: `/projects/${slug}` })),
  ];
  const abs = (path: string, locale: Locale) => siteConfig.url + localizedPath(path, locale).replace(/^\/$/, "");
  return pages.flatMap(({ path, lastModified }) => {
    const locales = path === "/playground" ? (["en"] as const) : LOCALES;
    const languages = Object.fromEntries([...locales.map((l) => [l, abs(path, l)]), ["x-default", abs(path, "en")]]);
    return locales.map((locale) => ({
      url: abs(path, locale),
      ...(lastModified && { lastModified }),
      alternates: { languages },
    }));
  });
}

/** Reads the real content: article dates and every non-hidden project. */
export async function loadSitemapInput() {
  const articles = await Promise.all(
    (articlesLive() ? ARTICLE_SLUGS : []).map(async (slug) => ({ slug, updated: (await getArticle("en", slug)).data.meta.updated })),
  );
  const projectSlugs = (
    await Promise.all(
      (await getProjectSlugs()).map(async (slug) => {
        const { data } = matter(await getProjectSource("en", slug));
        return (data as ProjectFrontmatter).hidden ? null : slug;
      }),
    )
  ).filter((s): s is string => s !== null);
  return { articles, projectSlugs };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries(await loadSitemapInput());
}
