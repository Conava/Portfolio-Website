import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { LogoPlate } from "@/components/shared/logo-plate";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { Viz } from "@/components/shared/viz/viz";
import { Pad } from "@/components/trace/pad";
import { careerInputs, careerLayout } from "@/components/trace/career";
import { formatRange } from "@/lib/format";
import { computeLanes } from "@/lib/lanes";
import type { HomeContent, YearMonth } from "@/lib/types";
import "./about-work.css";

/**
 * For each job, the earliest-started entry (job or school) it overlaps, from the same entry set
 * the trace layer draws lanes from: the lanes in words, so a still (or a phone) says what they mean.
 */
function overlapNotes(content: HomeContent, today: YearMonth): Record<string, { label: string; school: boolean }> {
  const entries = [
    ...content.work.jobs.map((j) => ({ id: j.id, label: j.company, school: false, start: j.start, end: j.end })),
    ...content.education.schools.map((s) => ({ id: s.id, label: s.degree, school: true, start: s.start, end: s.end })),
  ];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const { overlaps } = computeLanes(entries, today);
  const notes: Record<string, { label: string; school: boolean }> = {};
  for (const j of content.work.jobs) {
    const others = overlaps.flatMap((o) => (o.a === j.id ? [o.b] : o.b === j.id ? [o.a] : []))
      .map((id) => byId.get(id)!)
      .sort((p, q) => p.start.localeCompare(q.start));
    if (others[0]) notes[j.id] = others[0];
  }
  return notes;
}

/** Trace work: one ruled row per job with its entry pad, logo plate, dates and detail panel and a bar at its dates on the hero's axis. */
export async function TraceWork({ content, github, locale, today }: SectionProps) {
  const t = await getTranslations();
  const { work } = content;
  const notes = overlapNotes(content, today);
  const bars = new Map(careerLayout(careerInputs(content), today).tasks.map((x) => [x.id, x]));
  return (
    <TrackedSection id="work" className="wrap t-work">
      <h2>
        <Pad station="work" label={t("sections.work")} kind="section" />
        {t("sections.work")}
      </h2>
      {work.intro && <p className="lede">{work.intro}</p>}
      <ul className="t-jobs">
        {work.jobs.map((j) => (
          <li
            key={j.id}
            id={j.id}
            className="t-job"
            data-now={bars.get(j.id)?.kind === "now" ? "" : undefined}
            style={{ "--bx": bars.get(j.id)?.x0 ?? 0, "--bw": (bars.get(j.id)?.x1 ?? 1) - (bars.get(j.id)?.x0 ?? 0) } as CSSProperties}
          >
            <Pad station={j.id} label={j.company} kind="entry" entryId={j.id} />
            <div className="t-job-id">
              {/* With a logo, the plate is the company name (its alt text names it); no second text name. */}
              <h3 className={j.logo ? "t-job-logo" : undefined}>
                <a href={j.url} data-track-label={j.company}>{j.logo ? <LogoPlate image={j.logo} size="md" /> : j.company}</a>
              </h3>
              <p className="t-role">{j.role}</p>
              <p className="meta">
                {formatRange(j.start, j.end, locale, t("date.present"))}, {j.location}
              </p>
              {notes[j.id] && (
                <p className="meta t-overlap">
                  {t(notes[j.id].school ? "trace.overlapDuring" : "trace.overlapNote", { b: notes[j.id].label })}
                </p>
              )}
            </div>
            <p className="prose t-job-sum">{j.summary}</p>
            {j.panel && (
              <DetailPanel id={j.id} name={j.company} section="work">
                <PanelBody
                  panel={j.panel}
                  viz={
                    j.panel.viz && (
                      <Viz viz={j.panel.viz} github={github} locale={locale} />
                    )
                  }
                />
              </DetailPanel>
            )}
          </li>
        ))}
      </ul>
    </TrackedSection>
  );
}
