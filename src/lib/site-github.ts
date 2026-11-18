import { contentGithubRefs, getHomeContent } from "./content";
import { getGithubData, type GithubData } from "./github";
import { siteConfig } from "./site-config";
import type { HomeContent, Locale } from "./types";

/**
 * Use this everywhere so the site shares one cache entry: the cache key includes the
 * arguments, so every page must call GitHub with exactly the homepage's refs.
 */
export async function getSiteGithub(locale: Locale, home?: HomeContent): Promise<GithubData | null> {
  const content = home ?? (await getHomeContent(locale));
  return getGithubData({ ...contentGithubRefs(content), org: siteConfig.duxOrg, author: siteConfig.githubLogin });
}
