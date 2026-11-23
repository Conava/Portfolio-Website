import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { LogoPlate } from "@/components/shared/logo-plate";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { Viz } from "@/components/shared/viz/viz";
import { Pad } from "@/components/trace/pad";
import { formatMonth, formatRange } from "@/lib/format";
import { EducationStage, type EduColumn } from "./education-stage";
import "./about-work.css";
import "./education.css";

/**
 * Trace education: three schools in ruled columns, staged by the trace (4.6).
 * The exchange (the school with a GPA) gets the GPA figure; the note of the
 * school it ran inside appears just after that school's column.
 */
export async function TraceEducation({ content, github, locale, today }: SectionProps) {
  const t = await getTranslations();
  const { education } = content;
  const exchange = education.schools.find((s) => s.gpa);
  const host =
    exchange &&
    education.schools.find(
      (s) => s !== exchange && s.start <= exchange.start && (s.end ?? today) >= (exchange.end ?? today),
    );

  const columns: EduColumn[] = education.schools.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    body: (
      <>
        <Pad station={s.id} label={s.name} kind="entry" entryId={s.id} />
        <span className="t-edu-dot" aria-hidden="true" />
        <div className="t-edu-logo">
          <LogoPlate image={s.logo} size="box" />
        </div>
        <h3>
          <a href={s.url}>{s.name}</a>
        </h3>
        <p className="t-edu-deg">
          {s.degree}, {s.field}
        </p>
        <p className="meta">
          {s.status === "upcoming"
            ? t("dates.from", { date: formatMonth(s.start, locale) })
            : formatRange(s.start, s.end, locale, t("date.present"))}
        </p>
        {s.gpa && (
          <p className="t-gpa">
            <span className="sr-only">{t("education.gpa", s.gpa)}</span>
            <span aria-hidden="true">
              <span className="t-gpa-fig num">{s.gpa.value}</span>
              <span className="meta num"> / {s.gpa.scale}</span>
            </span>
          </p>
        )}
        {s.note && <p className={s === host ? "meta t-edu-note t-edu-merge-note" : "meta t-edu-note"}>{s.note}</p>}
      </>
    ),
    panel: s.panel ? (
      <PanelBody
        panel={s.panel}
        viz={s.panel.viz && <Viz viz={s.panel.viz} github={github} locale={locale} />}
      />
    ) : null,
  }));

  return (
    <TrackedSection id="education" className="wrap t-edu">
      <EducationStage
        columns={columns}
        head={
          <>
            <h2>
              <Pad station="education" label={t("sections.education")} kind="section" />
              {t("sections.education")}
            </h2>
            {education.intro && <p className="lede t-edu-intro">{education.intro}</p>}
          </>
        }
      />
    </TrackedSection>
  );
}
