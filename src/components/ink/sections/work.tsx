import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { LogoPlate } from "@/components/shared/logo-plate";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { jobEntries, schoolEntries, Timeline } from "@/components/shared/viz/timeline";
import { formatRange } from "@/lib/format";
import "./about-work.css";

/**
 * Ink work: one ledger row per job (name and role on 1-3, summary and "Read more" on 4-9,
 * dates on 10-12). Employers with a logo show it on a plate above the name. Panels open under the row.
 * One timeline of work and education closes the section and leads into Education.
 */
export async function InkWork({ content, locale, today }: SectionProps) {
  const t = await getTranslations();
  const { work } = content;
  return (
    <TrackedSection id="work" data-tone="paper" className="wrap ink-work">
      <h2>{t("sections.work")}</h2>
      {work.intro && <p className="lede ink-work-intro">{work.intro}</p>}
      <ul className="ink-rows">
        {work.jobs.map((j) => (
          <li key={j.id} className="ink-row grid-12">
            <div className="ink-row-who">
              {j.logo && (
                <a href={j.url} rel="noopener" className="ink-row-logo" data-track-label={j.company} tabIndex={-1} aria-hidden="true">
                  <LogoPlate image={{ ...j.logo, alt: "" }} size="md" />
                </a>
              )}
              <h3>
                <a href={j.url} rel="noopener" data-track-label={j.company}>
                  {j.company}
                </a>
              </h3>
              <p className="meta">
                {j.role}
                <br />
                {j.location}
              </p>
            </div>
            <p className="meta ink-row-when">{formatRange(j.start, j.end, locale, t("date.present"))}</p>
            <p className="prose ink-row-sum">{j.summary}</p>
            {j.panel && (
              <DetailPanel id={j.id} name={j.company} section="work">
                <PanelBody panel={j.panel} />
              </DetailPanel>
            )}
          </li>
        ))}
      </ul>
      <div className="ink-timeline">
        <Timeline
          groups={[
            { label: t("sections.work"), entries: jobEntries(work, content.education) },
            { label: t("sections.education"), entries: schoolEntries(content.education) },
          ]}
          caption={t("viz.timeline")}
          locale={locale}
          today={today}
        />
      </div>
    </TrackedSection>
  );
}
