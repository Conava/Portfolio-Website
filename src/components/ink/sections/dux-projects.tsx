import { getTranslations } from "next-intl/server";
import type { SectionProps } from "@/components/home-types";
import { ActionLink } from "@/components/shared/action-link";
import { DuxBuiltOn, DuxRelations } from "@/components/shared/dux-relations";
import { Gallery } from "@/components/shared/gallery";
import { RepoFacts } from "@/components/shared/github/repo-facts";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { PlayerScene } from "@/components/shared/player-scene";
import type { DuxProject } from "@/lib/types";
import "./dux.css";

/**
 * The Dux projects inside Ink's projects section: Dux Player as a pinned scene in a full-bleed
 * scene band with its panel, then the plugins (Cast gallery) and dux-cast as ruled rows.
 */
export async function InkDuxProjects({ content, github, locale }: SectionProps) {
  const tp = await getTranslations("projects");
  const { projects } = content.dux;
  const player = projects.find((p) => p.id === "dux-player");
  const others = projects.filter((p) => p !== player);

  // RepoFacts is null without live data for the repo; only then is the meta line dropped.
  const factsById = Object.fromEntries(
    await Promise.all(projects.map(async (p) => [p.id, await RepoFacts({ repo: p.repo, github, locale })] as const)),
  );
  const facts = (p: DuxProject) => (
    <>
      <DuxRelations project={p} projects={projects} locale={locale} />
      {factsById[p.id] && <p className="meta dux-facts">{factsById[p.id]}</p>}
      <p className="btn-row dux-repo">
        <ActionLink href={p.url}>{tp("github")}</ActionLink>
      </p>
    </>
  );

  return (
    <div className="dux-own">
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
              <DuxBuiltOn locale={locale} />
              {facts(player)}
            </div>
            {player.panel && (
              <DetailPanel id={player.id} name={player.name} section="projects">
                <PanelBody panel={player.panel} />
              </DetailPanel>
            )}
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
    </div>
  );
}
