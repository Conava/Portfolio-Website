import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { LogoPlate } from "@/components/shared/logo-plate";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { Viz } from "@/components/shared/viz/viz";
import { formatMonth, formatRange } from "@/lib/format";
import type { School } from "@/lib/types";
import { EducationScene } from "./education-scene";
import "./about-work.css";
import "./education.css";

/** Hand-drawn loop around the GPA in a 64x36 box; it runs about 6px past its start, ending just outside it. */
const PEN =
  "M53.3 10.4C52.7 10.0 51.0 8.8 49.5 8.2C48.1 7.6 46.4 7.1 44.6 6.7C42.8 6.3 40.8 6.0 38.8 5.8C36.8 5.7 34.7 5.6 32.6 5.7C30.5 5.8 28.3 6.1 26.3 6.4C24.2 6.8 22.1 7.3 20.2 7.8C18.3 8.4 16.5 9.1 14.9 9.9C13.3 10.7 11.8 11.6 10.6 12.5C9.4 13.5 8.4 14.5 7.6 15.5C6.9 16.5 6.4 17.6 6.2 18.7C6.0 19.7 6.0 20.8 6.3 21.8C6.6 22.8 7.3 23.8 8.1 24.7C8.9 25.6 10.1 26.5 11.4 27.2C12.7 28.0 14.3 28.7 16.0 29.2C17.7 29.7 19.7 30.2 21.7 30.5C23.7 30.8 25.9 30.9 28.1 31.0C30.2 31.0 32.5 30.9 34.7 30.6C36.9 30.4 39.2 30.0 41.3 29.5C43.4 29.0 45.4 28.4 47.3 27.7C49.1 26.9 50.9 26.1 52.4 25.2C53.9 24.3 55.2 23.3 56.2 22.2C57.2 21.2 58.1 20.1 58.6 19.0C59.1 17.9 59.3 16.7 59.3 15.7C59.2 14.6 58.8 13.5 58.2 12.4C57.6 11.4 56.7 10.4 55.5 9.6C54.4 8.7 52.3 7.7 51.3 7.2C50.4 6.7 50.3 6.8 50.1 6.7";

/**
 * Ink education: three schools in three equal columns. On wide screens with
 * motion the columns arrive one at a time and the red pen circles the GPA
 * (EducationScene). The server markup is the final state.
 */
export async function InkEducation({ content, github, locale }: SectionProps) {
  const t = await getTranslations();
  const { education } = content;

  const head = (s: School) => {
    // Split the localized sentence around the value so only the number gets the pen.
    const [before, after] = s.gpa ? t("education.gpa", { value: "\u0000", scale: s.gpa.scale }).split("\u0000") : [];
    return (
      <>
        <div className="edu-plate">
          <LogoPlate image={s.logo} size="box" />
        </div>
        <h3 className="edu-name">
          <a href={s.url}>{s.name}</a>
        </h3>
        <p className="edu-degree">
          {s.degree}, {s.field}
        </p>
        <p className="meta">
          {s.status === "upcoming"
            ? t("dates.from", { date: formatMonth(s.start, locale) })
            : formatRange(s.start, s.end, locale, t("date.present"))}
        </p>
        {s.note && <p className="meta">{s.note}</p>}
        {s.gpa && (
          <p className="edu-gpa">
            {before}
            <span className="edu-pen">
              {s.gpa.value}
              <svg viewBox="0 0 64 36" width="64" height="36" aria-hidden focusable="false">
                <path d={PEN} pathLength={1} />
              </svg>
            </span>
            {after}
          </p>
        )}
      </>
    );
  };

  return (
    <TrackedSection id="education" data-tone="paper-2" className="edu">
      <EducationScene
        heading={
          <>
            <h2>{t("sections.education")}</h2>
            {education.intro && <p className="lede edu-intro">{education.intro}</p>}
          </>
        }
        schools={education.schools.map((s) => ({
          id: s.id,
          name: s.name,
          head: head(s),
          panel: s.panel ? (
            <PanelBody
              panel={s.panel}
              viz={
                s.panel.viz ? (
                  <Viz viz={s.panel.viz} github={github} locale={locale} />
                ) : undefined
              }
            />
          ) : null,
        }))}
      />
    </TrackedSection>
  );
}
