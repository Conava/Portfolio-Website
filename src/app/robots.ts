import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

/**
 * Next.js metadata route handler that generates `/robots.txt`.
 *
 * Allows all user agents to crawl all paths and points crawlers to the
 * sitemap so they can discover every page on the site.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
