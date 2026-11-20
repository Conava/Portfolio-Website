import type { Design } from "./design";

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

/** Articles are published only with `ARTICLES=on` (runtime env); otherwise their routes show "coming soon" and stay out of the sitemap. */
export const articlesLive = () => process.env.ARTICLES === "on";
