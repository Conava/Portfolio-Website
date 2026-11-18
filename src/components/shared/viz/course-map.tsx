import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/types";
import "./viz.css";

/** A plain grouped list with a count per area. No radar, no bubbles. */
export function CourseMap({
  groups,
  caption,
  locale,
}: {
  groups: { area: string; courses: string[] }[];
  caption: string;
  locale: Locale;
}) {
  const shown = groups.filter((g) => g.courses.length);
  if (!shown.length) return null;
  return (
    <figure className="viz viz-courses">
      <ul className="viz-groups">
        {shown.map((g) => (
          <li key={g.area}>
            <p className="viz-area">
              {g.area} <span className="viz-num">{formatNumber(g.courses.length, locale)}</span>
            </p>
            <ul>
              {g.courses.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
