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
import { Pad } from "@/components/trace/pad";
import type { DuxProject } from "@/lib/types";
import "./dux.css";

/** Product name, identical in both locales. */
const SHELL = "Dux Shell";

/**
 * Trace Dux: the huge heading, intro (+ live counts as their own sentence) beside the Dux links,
 * then three lanes, each with an entry pad: Shell (screenshot + live PR ledger), Player (the pinned
 * scene, full width), Plugins (Cast gallery + dux-cast). Without GitHub data no number renders.
 */
export async function TraceDux({ content, github, locale, today }: SectionProps) {
  const t = await getTranslations("sections");
  const tp = await getTranslations("projects");
  const { dux } = content;
  const counts = await DuxCounts({ github, locale });
  const shot = dux.shellImages?.[0];
  const player = dux.projects.find((p) => p.id === "dux-player");
  const plugins = dux.projects.find((p) => p.id === "dux-plugins");
  const others = dux.projects.filter((p) => p !== player && p !== plugins);

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
      <DuxRelations project={p} projects={dux.projects} locale={locale} />
      <p className="meta">
        <RepoFacts repo={p.repo} github={github} locale={locale} />
      </p>
      {repoLink(p)}
    </div>
  );

  return (
    <TrackedSection id="dux" className="t-dux-sec">
      <div className="wrap">
        <h2 className="t-dux">
          <Pad station="dux" label={t("dux")} kind="section" />
          {t("dux")}
        </h2>
        <div className="split t-dux-top">
          <p className="lede">
            {dux.intro}
            {counts && (
              <>
                {" "}
                <span className="num">{counts}.</span>
              </>
            )}
          </p>
          <ul className="btn-row t-dux-links">
            {dux.links.map((l) => (
              <li key={l.href}>
                <ActionLink href={l.href} primary={l.href === "/dux"}>
                  {l.label}
                </ActionLink>
              </li>
            ))}
          </ul>
        </div>

        <article id="dux-shell" className="t-lane">
          <div className="t-lane-head">
            <Pad station="dux-shell" label={SHELL} kind="entry" entryId="dux-shell" />
            <h3>{SHELL}</h3>
            <p className="meta">
              <RepoFacts repo={dux.shellRepo} github={github} locale={locale} />
            </p>
            <p className="btn-row t-dux-repo">
              <ActionLink href={`https://github.com/${dux.shellRepo}`}>{tp("github")}</ActionLink>
            </p>
          </div>
          <div className="t-shell">
            {shot && (
              <figure className="t-shot">
                <Image src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} sizes="(min-width: 1080px) 480px, 92vw" />
                {shot.caption && <figcaption className="meta">{shot.caption}</figcaption>}
              </figure>
            )}
            <div>
              <PrList featured={dux.featuredPrs} github={github} locale={locale} />
            </div>
          </div>
        </article>

        {dux.panel && (
          <div className="t-dux-panel">
            <DetailPanel id="dux" name={t("dux")} section="dux" actions={<ActionLink href="/dux">{tp("article")}</ActionLink>}>
              <PanelBody
                panel={dux.panel}
                level={3}
                viz={dux.panel.viz && <Viz viz={dux.panel.viz} github={github} locale={locale} />}
              />
            </DetailPanel>
          </div>
        )}
      </div>

      {player && (
        <article id={player.id} className="t-lane">
          <div className="wrap">{head(player)}</div>
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
                <DuxRelations project={p} projects={dux.projects} locale={locale} />
                <p className="meta">
                  <RepoFacts repo={p.repo} github={github} locale={locale} />
                </p>
                {repoLink(p)}
              </div>
            ))}
          </article>
        </div>
      )}
    </TrackedSection>
  );
}
