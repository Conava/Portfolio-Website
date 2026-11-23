import { playgroundHref } from "@/lib/playground/share";
import fs from "fs/promises";
import path from "path";
import { routing } from "../i18n/routing";
import { isArticleHref } from "./seo";
import { articlesLive } from "./site-config";
import type { Locale, HomeContent, Image, Panel, ArticleSlug, ArticleMap } from "./types";

export const contentRoot = path.join(process.cwd(), "content");
const publicRoot = path.join(process.cwd(), "public");

/** The images whose file exists under `public/`, in order: an image listed before its file is added stays hidden. */
export async function keepExisting(images: Image[] | undefined, pub: string = publicRoot): Promise<Image[] | undefined> {
  if (!images) return images;
  // The standalone server has public/ next to it; don't let tracing pull it in.
  const ok = await Promise.all(images.map((i) => fs.access(path.join(/*turbopackIgnore: true*/ pub, i.src)).then(() => true, () => false)));
  return images.filter((_, k) => ok[k]);
}

/** Reads `<root>/<locale>/data/<file>`; a missing locale file (ENOENT) falls back to `en`. */
export async function loadJson<T>(
  locale: Locale,
  file: string,
  root: string = contentRoot,
): Promise<T> {
  const read = async (l: string) => {
    const p = path.join(root, l, "data", file);
    const raw = await fs.readFile(p, "utf-8");
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      throw new Error(`Invalid JSON in ${p}: ${(e as Error).message}`);
    }
  };
  try {
    return await read(locale);
  } catch (e) {
    if (locale !== "en" && (e as NodeJS.ErrnoException).code === "ENOENT") return read("en");
    throw e;
  }
}

export async function getHomeContent(
  locale: Locale,
  root: string = contentRoot,
): Promise<HomeContent> {
  const [about, work, education, bpmnscript, dux, projects, contact] = await Promise.all(
    ["about", "work", "education", "bpmnscript", "dux", "projects", "contact"].map((f) =>
      loadJson<never>(locale, `${f}.json`, root),
    ),
  );
  // The playground link opens the sample shown on the page.
  const b = bpmnscript as HomeContent["bpmnscript"];
  const pg = await playgroundHref(b.sample);
  b.links = b.links.map((l) => (l.href === "/playground" ? { ...l, href: pg } : l));
  const d = dux as HomeContent["dux"];
  d.shellImages = await keepExisting(d.shellImages);
  // Unpublished articles get no links: their routes only say "coming soon".
  if (!articlesLive()) {
    b.links = b.links.filter((l) => !isArticleHref(l.href));
    d.links = d.links.filter((l) => !isArticleHref(l.href));
    for (const p of (projects as HomeContent["projects"]).projects) if (p.url && isArticleHref(p.url)) delete p.url;
  }
  return { about, work, education, bpmnscript, dux, projects, contact };
}

/** Unique repos and featured PR refs the page needs from GitHub. Structurally a `GithubRefs`. */
export function contentGithubRefs(home: HomeContent): { repos: string[]; prs: string[] } {
  const panels: (Panel | undefined)[] = [
    home.bpmnscript.panel,
    home.dux.panel,
    ...home.work.jobs.map((j) => j.panel),
    ...home.education.schools.map((s) => s.panel),
    ...home.dux.projects.map((p) => p.panel),
    ...home.projects.projects.map((p) => p.panel),
  ];
  const repos = [
    home.bpmnscript.repo,
    home.dux.shellRepo,
    ...home.dux.projects.map((p) => p.repo),
    ...home.projects.projects.map((p) => p.repo),
    ...panels.flatMap((p) => (p?.viz?.type === "pr-dots" ? (p.viz.repos ?? []) : [])),
  ].filter((r): r is string => !!r);
  // case-insensitive dedupe, first spelling wins
  const seen = new Set<string>();
  const unique = repos.filter((r) => !seen.has(r.toLowerCase()) && seen.add(r.toLowerCase()));
  return { repos: unique, prs: home.dux.featuredPrs.map((p) => p.ref) };
}

export { ARTICLE_SLUGS } from "./site-config";

/** Facts from `data/article-<slug>.json`, prose from `articles/<slug>.mdx`; each falls back to `en` on ENOENT only. */
export async function getArticle<S extends ArticleSlug>(
  locale: Locale,
  slug: S,
  root: string = contentRoot,
): Promise<{ data: ArticleMap[S]; mdx: string }> {
  const read = (l: string) => fs.readFile(path.join(root, l, "articles", `${slug}.mdx`), "utf-8");
  let mdx: string;
  try {
    mdx = await read(locale);
  } catch (e) {
    if (locale === "en" || (e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    mdx = await read("en");
  }
  return { data: await loadJson<ArticleMap[S]>(locale, `article-${slug}.json`, root), mdx };
}

export async function getProjectSlugs(): Promise<string[]> {
  const projectsDir = path.join(contentRoot, "en", "projects");
  const files = await fs.readdir(projectsDir);
  return files
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export async function getProjectSource(
  locale: Locale,
  slug: string
): Promise<string> {
  if (!/^[\w-]+$/.test(slug)) throw new Error(`Invalid project slug: ${slug}`);
  if (!(routing.locales as readonly string[]).includes(locale)) throw new Error(`Invalid locale: ${locale}`);
  const filePath = path.join(contentRoot, locale, "projects", `${slug}.mdx`);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    // Fall back to English if locale version doesn't exist
    const fallbackPath = path.join(contentRoot, "en", "projects", `${slug}.mdx`);
    return fs.readFile(fallbackPath, "utf-8");
  }
}
