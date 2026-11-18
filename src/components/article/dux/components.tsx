import type { ReactNode } from "react";
import Image from "next/image";
import type { MDXComponents } from "mdx/types";
import { Gallery } from "@/components/shared/gallery";
import { DuxCounts } from "@/components/shared/github/dux-counts";
import { PrList } from "@/components/shared/github/pr-list";
import { RepoFacts } from "@/components/shared/github/repo-facts";
import { Viz } from "@/components/shared/viz/viz";
import type { Image as Img, Locale } from "@/lib/types";
import { articleContext } from "../mdx-article";
import "./dux.css";

/** One image as a framed figure, several as the shared gallery. */
function Images({ images, label, locale }: { images?: Img[]; label: string; locale: Locale }) {
  if (!images?.length) return null;
  if (images.length > 1) {
    return (
      <div className="duxa-media">
        <Gallery images={images} label={label} locale={locale} />
      </div>
    );
  }
  const [img] = images;
  return (
    <figure className="pj-fig duxa-media">
      <Image src={img.src} alt={img.alt} width={img.width} height={img.height} sizes="(min-width: 900px) 880px, 100vw" />
      {img.caption && <figcaption>{img.caption}</figcaption>}
    </figure>
  );
}

/**
 * A contribution from the article JSON: heading, what the user gets, the MDX text inside the tag,
 * images, and its pull requests with live state (titles from the JSON when GitHub data is missing).
 */
async function Contribution({ id, children }: { id: string; children?: ReactNode }) {
  const { data, github, locale } = articleContext<"dux">();
  const c = data.contributions.find((x) => x.id === id);
  if (!c) throw new Error(`No contribution with id "${id}" in the article JSON`);
  return (
    <>
      <h3 id={`c-${id}`}>{c.title}</h3>
      <p>{c.summary}</p>
      {children}
      <Images images={c.images} label={c.title} locale={locale} />
      <div className="duxa-prs">
        {/* One sync line for all contributions, after the last (MDX follows the JSON order). */}
        <PrList featured={c.prs.map((p) => ({ ...p, blurb: "" }))} github={github} locale={locale} sync={c === data.contributions.at(-1)} />
      </div>
    </>
  );
}

/** One of Marlon's own Dux projects: name, repo and images from the homepage's dux.json, text from the article. */
async function DuxProject({ id }: { id: string }) {
  const { data, home, github, locale } = articleContext<"dux">();
  const p = home.dux.projects.find((x) => x.id === id);
  const text = data.projects.find((x) => x.id === id);
  if (!p || !text) throw new Error(`No Dux project with id "${id}" in dux.json and the article JSON`);
  const facts = await RepoFacts({ repo: p.repo, github, locale });
  return (
    <>
      <h3 id={`p-${id}`} className="duxa-name">
        <a href={p.url} rel="noopener">
          {p.name}
        </a>
      </h3>
      {facts && <p className="duxa-facts">{facts}</p>}
      {text.summary.map((s) => (
        <p key={s}>{s}</p>
      ))}
      <Images images={p.images} label={p.name} locale={locale} />
    </>
  );
}

/** The counts sentence and the PR timeline over Marlon's org PRs; both render nothing without fresh data. */
async function DuxOverview() {
  const { home, github, locale } = articleContext<"dux">();
  const counts = await DuxCounts({ github, locale });
  const viz = home.dux.panel?.viz;
  return (
    <>
      {counts && <p>{counts}.</p>}
      {viz && (
        <div className="duxa-media">
          <Viz viz={viz} github={github} locale={locale} />
        </div>
      )}
    </>
  );
}

/** MDX components only the /dux article uses. */
export const components: MDXComponents = { Contribution, DuxProject, DuxOverview };
