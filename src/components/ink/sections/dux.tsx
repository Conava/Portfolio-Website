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
import { DuxBar } from "./dux-bar";
import "./dux.css";

/**
 * Ink Dux Shell (tone paper-2): intro with the live counts as their own sentence, the shell
 * screenshot, the PRs as a bar with a connected popout (each with its feature's screenshot),
 * the panel with the pr-dots viz, and the Dux links. Dux Player and the plugins are under
 * projects. Every live figure disappears when GitHub data is missing or expired.
 */
export async function InkDux({ content, github, locale }: SectionProps) {
  const t = await getTranslations("sections");
  const tp = await getTranslations("projects");
  const ta = await getTranslations("article");
  const td = await getTranslations("dux");
  const { dux } = content;
  const counts = await DuxCounts({ github, locale });
  const shellFacts = await RepoFacts({ repo: dux.shellRepo, github, locale });
  const shot = dux.shellImages?.[0];

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
          <h3>{td("contributions")}</h3>
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
          <DetailPanel id="dux" name={t("dux")} section="dux" actions={<ActionLink href="/dux">{tp("article")}</ActionLink>}>
            <PanelBody
              panel={dux.panel}
              viz={dux.panel.viz && <Viz viz={dux.panel.viz} github={github} locale={locale} />}
            />
          </DetailPanel>
        )}
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
