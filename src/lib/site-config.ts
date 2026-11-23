import type { Design } from "./design";
import type { ArticleSlug } from "./types";
import { parseDesigns } from "./design-values";

export const siteConfig = {
  name: "Marlon Kranz",
  /** Production URL of the site — used by sitemap, robots, and JSON-LD. */
  url: "https://marlonkranz.com",
  /** Job title used in JSON-LD Person structured data and page metadata. */
  jobTitle: "Software Engineer",
  github: "https://github.com/conava",
  linkedin: "https://linkedin.com/in/marlon-kranz",
  /** Default design; `DESIGN` env and the visitor cookie override it. */
  design: "keynote" as Design,
  githubLogin: "Conava",
  duxOrg: "duxlabs-dev",
  photoPath: "/images/profile.jpg",
} as const;

export const ARTICLE_SLUGS: readonly ArticleSlug[] = ["bpmnscript", "dux", "devline"];

/** Articles are published only with `ARTICLES=on` (runtime env); otherwise their routes show "coming soon", stay out of the sitemap and nothing links to them. */
export const articlesLive = () => process.env.ARTICLES === "on";

/** Designs offered and served, from the runtime env `DESIGNS` (comma list, e.g. `keynote,type`); unset means all four. */
export const enabledDesigns = () => parseDesigns(process.env.DESIGNS);

/** German (`/de`) is served only with `GERMAN=on` (runtime env); otherwise `/de` URLs redirect to English and no `de` alternates are published. */
export const germanLive = () => process.env.GERMAN === "on";
