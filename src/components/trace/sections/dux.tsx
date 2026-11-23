import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { DuxCounts } from "@/components/shared/github/dux-counts";
import { PrList } from "@/components/shared/github/pr-list";
import { RepoFacts } from "@/components/shared/github/repo-facts";
import { ActionLink } from "@/components/shared/action-link";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { Viz } from "@/components/shared/viz/viz";
import { Pad } from "@/components/trace/pad";
import "./dux.css";

/**
 * Trace Dux Shell: the huge heading, intro (+ live counts as their own sentence) beside the Dux
 * links, then one lane with an entry pad: the shell screenshot beside the live PR ledger, each PR
 * with its feature's screenshot. Dux Player and the plugins are under projects. Without GitHub
 * data no number renders.
 */
export async function TraceDux({ content, github, locale }: SectionProps) {
  const t = await getTranslations("sections");
  const tp = await getTranslations("projects");
  const td = await getTranslations("dux");
  const { dux } = content;
  const counts = await DuxCounts({ github, locale });
  const shot = dux.shellImages?.[0];

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
            <Pad station="dux-shell" label={td("contributions")} kind="entry" entryId="dux-shell" />
            <h3>{td("contributions")}</h3>
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
    </TrackedSection>
  );
}
