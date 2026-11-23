import { getTranslations } from "next-intl/server";
import type { SectionProps } from "@/components/home-types";
import { ActionLink } from "@/components/shared/action-link";
import { DuxRelations } from "@/components/shared/dux-relations";
import { Gallery } from "@/components/shared/gallery";
import { RepoFacts } from "@/components/shared/github/repo-facts";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { PlayerScene } from "@/components/shared/player-scene";
import { Pad } from "@/components/trace/pad";
import type { DuxProject } from "@/lib/types";
import "./dux.css";

/**
 * The Dux projects inside Trace's projects section, as two lanes with entry pads: Player (the
 * pinned scene, full width, and its panel), Plugins (Cast gallery + dux-cast).
 */
export async function TraceDuxProjects({ content, github, locale }: SectionProps) {
  const tp = await getTranslations("projects");
  const { projects } = content.dux;
  const player = projects.find((p) => p.id === "dux-player");
  const plugins = projects.find((p) => p.id === "dux-plugins");
  const others = projects.filter((p) => p !== player && p !== plugins);

  const repoLink = (p: DuxProject) => (
    <p className="btn-row t-dux-repo">
      <ActionLink href={p.url}>{tp("github")}</ActionLink>
    </p>
  );
  const head = (p: DuxProject) => (
    <div className="t-lane-head">
      <Pad station={p.id} label={p.name} kind="entry" entryId={p.id} />
      <h3>
        <a href={p.url}>{p.name}</a>
      </h3>
      <p className="prose">{p.blurb}</p>
      <DuxRelations project={p} projects={projects} locale={locale} />
      <p className="meta">
        <RepoFacts repo={p.repo} github={github} locale={locale} />
      </p>
      {repoLink(p)}
    </div>
  );

  return (
    <>
      {player && (
        <article id={player.id} className="t-lane">
          <div className="wrap">
            {head(player)}
            {player.panel && (
              <div className="t-dux-panel">
                <DetailPanel id={player.id} name={player.name} section="projects">
                  <PanelBody panel={player.panel} />
                </DetailPanel>
              </div>
            )}
          </div>
          <PlayerScene project={player} title={player.name} pinLength="300vh" minWidth={960} />
        </article>
      )}

      {plugins && (
        <div className="wrap">
          <article id={plugins.id} className="t-lane">
            {head(plugins)}
            {plugins.images?.length ? <Gallery images={plugins.images} label={plugins.name} locale={locale} /> : null}
            {others.map((p) => (
              <div key={p.id} id={p.id} className="t-dux-sub" data-dux-shared={p.usedBy ? "" : undefined}>
                <h4>
                  <a href={p.url}>{p.name}</a>
                </h4>
                <p className="prose">{p.blurb}</p>
                <DuxRelations project={p} projects={projects} locale={locale} />
                <p className="meta">
                  <RepoFacts repo={p.repo} github={github} locale={locale} />
                </p>
                {repoLink(p)}
              </div>
            ))}
          </article>
        </div>
      )}
    </>
  );
}
