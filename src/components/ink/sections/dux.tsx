import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { DuxRelations } from "@/components/shared/dux-relations";
import { Gallery } from "@/components/shared/gallery";
import { DuxCounts } from "@/components/shared/github/dux-counts";
import { PrList } from "@/components/shared/github/pr-list";
import { RepoFacts } from "@/components/shared/github/repo-facts";
import { ActionLink } from "@/components/shared/action-link";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { PlayerScene } from "@/components/shared/player-scene";
import { Viz } from "@/components/shared/viz/viz";
import type { DuxProject } from "@/lib/types";
import { DuxBar } from "./dux-bar";
import "./dux.css";

/**
 * Ink Dux (tone paper-2): intro with the live counts as their own sentence, the Shell
 * block (screenshot, the PRs as a bar with a connected popout, panel with the pr-dots viz), Dux Player as a pinned
 * scene in a full-bleed scene band, the plugin projects with the Cast gallery, and
 * the Dux links. Every live figure disappears when GitHub data is missing or expired.
 */
export async function InkDux({ content, github, locale, today }: SectionProps) {
  const t = await getTranslations("sections");
  const tp = await getTranslations("projects");
  const ta = await getTranslations("article");
  const { dux } = content;
  const counts = await DuxCounts({ github, locale });
  const shellFacts = await RepoFacts({ repo: dux.shellRepo, github, locale });
  const shot = dux.shellImages?.[0];
  const player = dux.projects.find((p) => p.id === "dux-player");
  const others = dux.projects.filter((p) => p !== player);

  // RepoFacts is null without live data for the repo; only then is the meta line dropped.
  const factsById = Object.fromEntries(
    await Promise.all(dux.projects.map(async (p) => [p.id, await RepoFacts({ repo: p.repo, github, locale })] as const)),
  );
  const facts = (p: DuxProject) => (
    <>
      <DuxRelations project={p} projects={dux.projects} locale={locale} />
      {factsById[p.id] && <p className="meta dux-facts">{factsById[p.id]}</p>}
      <p className="btn-row dux-repo">
        <ActionLink href={p.url}>{tp("github")}</ActionLink>
      </p>
    </>
  );

  return (
    <TrackedSection id="dux" data-tone="paper-2" className="dux">
      <div className="wrap grid-12 dux-head">
        <h2>{t("dux")}</h2>
        <p className="lede">
          {dux.intro}
          {counts && <> {counts}.</>}
        </p>
      </div>

      <div className="wrap grid-12 dux-block">
        <div className="dux-name">
          <h3>Dux Shell</h3>
          {shellFacts && <p className="meta dux-facts">{shellFacts}</p>}
          <p className="btn-row dux-repo">
            <ActionLink href={`https://github.com/${dux.shellRepo}`}>{tp("github")}</ActionLink>
          </p>
        </div>
        {shot && (
          <figure className="dux-shot">
            <Image
              src={shot.src}
              alt={shot.alt}
              width={shot.width}
              height={shot.height}
              sizes="(min-width: 1424px) 624px, (min-width: 900px) 44vw, 90vw"
            />
            {shot.caption && <figcaption className="meta">{shot.caption}</figcaption>}
          </figure>
        )}
        <div className="dux-prs">
          <DuxBar label={ta("pullRequests")} labels={dux.featuredPrs.map((f) => f.label ?? f.ref.replace(/^[^/]+\/(dux-)?/, ""))}>
            <PrList featured={dux.featuredPrs} github={github} locale={locale} />
          </DuxBar>
        </div>
        {dux.panel && (
          <DetailPanel id="dux" name="Dux" section="dux" actions={<ActionLink href="/dux">{tp("article")}</ActionLink>}>
            <PanelBody
              panel={dux.panel}
              viz={dux.panel.viz && <Viz viz={dux.panel.viz} github={github} locale={locale} />}
            />
          </DetailPanel>
        )}
      </div>

      {player && (
        <div id={player.id} data-tone="scene" className="dux-player">
          <div className="wrap grid-12 dux-row">
            <h3>
              <a href={player.url} rel="noopener">
                {player.name}
              </a>
            </h3>
            <div className="dux-text">
              <p className="prose">{player.blurb}</p>
              {facts(player)}
            </div>
          </div>
          <PlayerScene project={player} title={player.name} pinLength="320vh" minWidth={900} />
        </div>
      )}

      <div className="wrap dux-projects">
        {others.map((p) => (
          <article key={p.id} id={p.id} className="grid-12 dux-row" data-dux-shared={p.usedBy ? "" : undefined}>
            <h3>
              <a href={p.url} rel="noopener">
                {p.name}
              </a>
            </h3>
            <div className="dux-text">
              <p className="prose">{p.blurb}</p>
              {facts(p)}
            </div>
            {p.images?.length ? (
              <div className="dux-gallery">
                <Gallery images={p.images} label={p.name} locale={locale} />
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="wrap grid-12">
        <ul className="btn-row dux-links">
          {dux.links.map((l) => (
            <li key={l.href}>
              <ActionLink href={l.href} primary={l.href === "/dux"}>
                {l.label}
              </ActionLink>
            </li>
          ))}
        </ul>
      </div>
    </TrackedSection>
  );
}
