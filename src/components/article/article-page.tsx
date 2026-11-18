import type { Metadata } from "next";
import type { MDXComponents } from "mdx/types";
import { getTranslations } from "next-intl/server";
import { ActionLink } from "@/components/shared/action-link";
import { getArticle, getHomeContent } from "@/lib/content";
import { getDesign } from "@/lib/design";
import { formatDate } from "@/lib/format";
import { alternatesFor, jsonLdHtml, localizedPath, socialFor, techArticleJsonLd } from "@/lib/seo";
import { getSiteGithub } from "@/lib/site-github";
import { siteConfig } from "@/lib/site-config";
import type { GithubData } from "@/lib/github";
import type { ArticleMap, ArticleSlug, HomeContent, Locale } from "@/lib/types";
import * as bpmnscript from "./bpmnscript/components";
import * as devline from "./devline/components";
import * as dux from "./dux/components";
import { Figure } from "./figure";
import { around, compileArticle } from "./mdx-article";
import { Num, Pct } from "./numbers";
import { Section } from "./section";
import { Toc } from "./toc";
import "@/components/shared/prose.css";
import "./article.css";

/** Per-article slot: its own MDX components and optional extra JSON-LD. */
type Slot<S extends ArticleSlug> = {
  components: MDXComponents;
  jsonLd?: (data: ArticleMap[S], home: HomeContent, github: GithubData | null) => object | object[];
};
const SLOTS: { [S in ArticleSlug]: Slot<S> } = { bpmnscript, dux, devline };

const shared: MDXComponents = { Section, Figure, Num, Pct };

/** Title, description, hreflang alternates, Open Graph and Twitter card for an article route. */
export async function articleMetadata(slug: ArticleSlug, locale: Locale): Promise<Metadata> {
  const { meta } = (await getArticle(locale, slug)).data;
  const path = `/${slug}`;
  return {
    title: meta.title,
    description: meta.description,
    alternates: alternatesFor(path, locale),
    ...socialFor({
      title: meta.title,
      description: meta.description,
      locale,
      image: { url: meta.ogImage.src, width: meta.ogImage.width, height: meta.ogImage.height, alt: meta.ogImage.alt },
      path,
      type: "article",
      published: meta.published,
      modified: meta.updated,
    }),
  };
}

/** The shared Read-mode article: header, contents list, MDX body, link list and JSON-LD. */
export async function ArticlePage<S extends ArticleSlug>({ slug, locale }: { slug: S; locale: Locale }) {
  const [{ data, mdx }, home, github, design, t] = await Promise.all([
    getArticle(locale, slug),
    getHomeContent(locale),
    getSiteGithub(locale),
    getDesign(),
    getTranslations({ locale, namespace: "article" }),
  ]);
  const slot = SLOTS[slug] as Slot<S>;
  const body = await compileArticle({ slug, data, home, github, locale }, mdx, { ...shared, ...slot.components });
  const { meta } = data;

  const date = (key: "updated" | "published", iso: string) => {
    const [before, after] = around((m) => t(key, { date: m }));
    return (
      <li>
        {before}
        <time dateTime={iso}>{formatDate(iso, locale)}</time>
        {after}
      </li>
    );
  };

  const url = `${siteConfig.url}${localizedPath(`/${slug}`, locale)}`;
  const article = techArticleJsonLd({
    url,
    headline: meta.title,
    description: meta.description,
    datePublished: meta.published,
    dateModified: meta.updated,
    image: `${siteConfig.url}${meta.ogImage.src}`,
    inLanguage: locale,
    author: { name: siteConfig.name, url: siteConfig.url },
  });
  const extra = [slot.jsonLd?.(data, home, github) ?? []].flat();

  return (
    <>
      <article className={`wrap pj-article ar-article ar-${slug}`}>
        <header className="pj-head grid-12 ar-head">
          <h1 className="pj-title">
            {meta.title}
            {/* Ink's signature ink-blue period closes the title. */}
            {design === "keynote" && <span className="pj-dot" aria-hidden="true">.</span>}
          </h1>
          <p className="lede">{meta.lede}</p>
          <ul className="pj-meta meta">
            {meta.published !== meta.updated && date("published", meta.published)}
            {date("updated", meta.updated)}
          </ul>
        </header>
        {/* "links" is reserved for the link list below; the contents list ends with it. */}
        <Toc sections={meta.links.length ? [...meta.sections, { id: "links", title: t("links") }] : meta.sections} label={t("contents")} />
        <div className="ar-body">
          {body}
          {meta.links.length > 0 && (
            <section id="links" aria-labelledby="links-title" className="pj-body grid-12 ar-sec">
              <h2 id="links-title">{t("links")}</h2>
              <ul className="btn-row ar-links">
                {meta.links.map((l, i) => (
                  <li key={l.href}>
                    <ActionLink href={l.href} primary={i === Math.max(0, meta.links.findIndex((x) => x.href === "/playground"))}>{l.label}</ActionLink>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(extra.length ? [article, ...extra] : article) }} />
    </>
  );
}
