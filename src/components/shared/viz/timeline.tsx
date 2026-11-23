import { Fragment } from "react";
import { getTranslations } from "next-intl/server";
import { formatMonth, formatRange } from "@/lib/format";
import type { EducationContent, Locale, WorkContent, YearMonth } from "@/lib/types";
import { ChevronIcon } from "@/components/shared/icons";
import { getDesign } from "@/lib/design";
import { thin } from "./thin";
import "./viz.css";

/** Month count since year 0, so month spans are plain subtraction. */
export const monthIndex = (ym: YearMonth) => {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + m - 1;
};
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

/** `n` / `w`: labelled in a narrow (under 240px) / wider axis; undefined means yes. The rule always draws. */
export interface Tick { at: number /* 0..1 */; label: string; n?: boolean; w?: boolean }

/** Marks which ticks keep a label in a narrow and in a wide axis (about 4 and 7 labels). */
export function thinTicks(ticks: Tick[], must: boolean[], wide = 7, room = 1): Tick[] {
  const n = thin(must, 4, room);
  const w = thin(must, wide, room);
  return ticks.map((t, i) => ({ ...t, n: n[i], w: w[i] }));
}

/**
 * Axis labels (row 1) and the vertical rules behind the rows (rows 2..last) of a `.viz-plot` grid.
 */
export function Axis({ ticks, marker, rows }: { ticks: Tick[]; marker?: Tick; rows: number }) {
  return (
    <>
      <div className="viz-axis" aria-hidden="true">
        {ticks.map((t, i) => (
          <span key={i} style={{ left: pct(t.at) }} data-n={t.n === false ? 0 : 1} data-w={t.w === false ? 0 : 1}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="viz-rules" aria-hidden="true" style={{ gridRow: `2 / span ${rows}` }}>
        <svg>
          {ticks.map((t, i) => (
            <line key={i} className="viz-tick" x1={pct(t.at)} x2={pct(t.at)} y1="0" y2="100%" />
          ))}
          {marker && <line className="viz-now" x1={pct(marker.at)} x2={pct(marker.at)} y1="0" y2="100%" />}
        </svg>
      </div>
      {marker && (
        <div className="viz-axis viz-axis-foot" aria-hidden="true" style={{ gridRow: rows + 2 }}>
          <span style={{ left: pct(marker.at) }}>
            {marker.label}
          </span>
        </div>
      )}
    </>
  );
}

export interface TimelineEntry { id: string; name: string; sub: string; short: string; start: YearMonth; end: YearMonth | null }
export interface TimelineGroup { label: string; entries: TimelineEntry[] }

/** A job at one of the schools (a teaching post) is named by its role, so it can't read as the degree. */
export const jobEntries = (work: WorkContent, education?: EducationContent): TimelineEntry[] => {
  const schools = new Set(education?.schools.map((s) => s.name));
  return work.jobs.map((j) => {
    const name = schools.has(j.company) ? j.role.split(",")[0] : j.company;
    return { id: j.id, name, sub: j.role, short: name, start: j.start, end: j.end };
  });
};

export const schoolEntries = (education: EducationContent): TimelineEntry[] =>
  education.schools.map((s) => ({ id: s.id, name: s.name, sub: s.degree, short: `${s.name}, ${s.degree}`, start: s.start, end: s.end }));

/** Months an open-ended upcoming entry is drawn into the future, so it reads as a start, not a dot. */
const AHEAD = 6;

/**
 * The axis every entry fits on, in months (`monthIndex`): `d0` the first start, `d1` exclusive,
 * at least the month after `today`, plus `AHEAD` months when an entry starts later with no end.
 */
export function timelineRange(entries: TimelineEntry[], today: YearMonth) {
  const now = monthIndex(today);
  const open = entries.some((e) => !e.end && monthIndex(e.start) > now);
  const d0 = Math.min(...entries.map((e) => monthIndex(e.start)));
  const d1 = Math.max(now, ...entries.map((e) => monthIndex(e.end ?? e.start))) + 1 + (open ? AHEAD : 0);
  return { d0, d1 };
}

/**
 * Swimlanes on one shared axis, one per entry, in start order within each group (groups keep
 * their order and get a label row when labelled). Inclusive month ranges. An ongoing entry
 * (started, no end or an end not before `today`) carries the accent: solid up to `today`, then
 * dashed to a planned end. An upcoming one (starts after `today`) is dashed from its start.
 * `today` comes from the server so SSR and the table agree. The month table behind the chart is a
 * visible disclosure in Trace and screen-reader-only elsewhere.
 */
export async function Timeline({
  entries,
  groups = entries ? [{ label: "", entries }] : [],
  caption,
  locale,
  today,
}: {
  entries?: TimelineEntry[];
  groups?: TimelineGroup[];
  caption: string;
  locale: Locale;
  today: YearMonth;
}) {
  const all = groups.flatMap((g) => g.entries);
  if (!all.length) return null;
  const t = await getTranslations({ locale, namespace: "viz" });
  const dates = await getTranslations({ locale, namespace: "dates" });
  const disclosure = (await getDesign()) === "thread";
  const now = monthIndex(today);
  const { d0, d1 } = timelineRange(all, today);
  const span = d1 - d0;

  const lanes = groups.map((g) => ({
    label: g.label,
    entries: g.entries
      .map((e) => {
        const s = monthIndex(e.start);
        const future = s > now;
        const last = e.end ? monthIndex(e.end) : null;
        return { ...e, s, e: last ?? (future ? d1 - 1 : now), future, on: !future && (last === null || last >= now) };
      })
      .sort((a, b) => a.s - b.s || a.e - b.e),
  }));
  let row = 2;
  const rows = lanes.map((g) => ({
    ...g,
    head: g.label ? row++ : 0,
    entries: g.entries.map((e) => ({ ...e, row: row++ })),
  }));

  const ticks: Tick[] = [];
  for (let i = Math.ceil(d0 / 12) * 12; i < d1; i += 12) {
    // ponytail: a bare year, identical in EN and DE; the rule sits on January of that year.
    if (i > d0) ticks.push({ at: (i - d0) / span, label: String(i / 12) });
  }
  // The rule sits mid-month: today is inside the current month's cell.
  const marker = { at: (now + 0.5 - d0) / span, label: formatMonth(today, locale) };
  const period = (e: TimelineEntry) =>
    monthIndex(e.start) > now && !e.end ? dates("from", { date: formatMonth(e.start, locale) }) : formatRange(e.start, e.end, locale, dates("present"));
  const x = (m: number) => pct((m - d0) / span);
  const w = (a: number, b: number) => pct((b + 1 - a) / span);

  const table = (
    <table className={disclosure ? "viz-table" : undefined}>
      {!disclosure && <caption>{caption}</caption>}
      <thead>
        <tr>
          <th scope="col">{t("entry")}</th>
          <th scope="col">{t("period")}</th>
        </tr>
      </thead>
      {rows.map((g, gi) => (
        <tbody key={gi}>
          {g.label && (
            <tr>
              <th scope="colgroup" colSpan={2}>
                {g.label}
              </th>
            </tr>
          )}
          {g.entries.map((e) => (
            <tr key={e.id}>
              <th scope="row">
                {e.name}, {e.sub}
              </th>
              <td>{period(e)}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );

  return (
    <figure className="viz viz-timeline">
      <div className="viz-scroll">
        <div className="viz-plot">
          <Axis ticks={thinTicks(ticks, ticks.map(() => false), 14, 0)} marker={marker} rows={row - 2} />
          {rows.map((g) => (
            <Fragment key={g.label || "all"}>
              {g.head > 0 && (
                <span className="viz-group" aria-hidden="true" style={{ gridRow: g.head }}>
                  {g.label}
                </span>
              )}
              {g.entries.map((e) => (
                <Fragment key={e.id}>
                  <span className="viz-label" aria-hidden="true" style={{ gridRow: e.row }}>
                    {e.short}
                  </span>
                  <svg className="viz-track" aria-hidden="true" style={{ gridRow: e.row }}>
                    {!e.future && (
                      <rect className={`viz-bar${e.on ? " acc" : ""}`} x={x(e.s)} width={w(e.s, Math.min(e.e, now))} y="0" height="100%" />
                    )}
                    {e.e > now && (
                      <rect className={`viz-bar out${e.on ? " acc" : ""}`} x={x(Math.max(e.s, now + 1))} width={w(Math.max(e.s, now + 1), e.e)} y="0" height="100%" />
                    )}
                  </svg>
                </Fragment>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      {disclosure ? (
        <figcaption>
          <details>
            <summary>
              {caption}
              <ChevronIcon />
            </summary>
            {table}
          </details>
        </figcaption>
      ) : (
        // A table ignores a 1px width, so the wrapper is what hides it.
        <div className="sr-only">{table}</div>
      )}
    </figure>
  );
}
