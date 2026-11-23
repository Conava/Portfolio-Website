/**
 * Geometry of the hero's career diagram: work and education as two lanes of one BPMN pool on a
 * shared month axis. Horizontal positions are fractions (0..1) of the time axis; rows count from
 * the top of their lane. Pure, so it is unit-tested without a DOM.
 */
import { computeLanes } from "@/lib/lanes";
import type { HomeContent, YearMonth } from "@/lib/types";

export type Band = "work" | "edu";
/** done: ended before this month; now: running this month; next: starts after it. */
export type Kind = "done" | "now" | "next";

export interface CareerInput {
  id: string;
  band: Band;
  label: string;
  start: YearMonth;
  end: YearMonth | null;
}

export interface CareerTask extends CareerInput {
  kind: Kind;
  row: number;
  /** Left and right edge. A running task's box ends on the today line. */
  x0: number;
  x1: number;
  /** A running task continues as a dotted bar past today up to here: its planned end, or the axis end when open. */
  ahead: number | null;
  /** Too narrow for its label at the diagram's minimum width: the label sits to its right. */
  out: boolean;
  /**
   * Too narrow, on an overlap row (where a label outside would sit on the fork): the label wraps to
   * two lines and `x0` moves left until the longest word fits. `x1`, the end, stays true.
   */
  wrap: boolean;
}

export interface CareerLayout {
  tasks: CareerTask[];
  rows: Record<Band, number>;
  ticks: { at: number; label: string }[];
  today: number;
}

const month = (ym: YearMonth) => +ym.slice(0, 4) * 12 + +ym.slice(5) - 1;
/** Months an open-ended upcoming entry runs into the future, so it reads as a start, not a dot. */
const AHEAD = 6;
/** ponytail: label width guessed at ~0.55 months per character plus padding (13px text on the 860px minimum
 * width); measure in the browser if labels ever get clipped. */
const MONTHS_PER_CHAR = 0.55;

export function careerLayout(input: CareerInput[], today: YearMonth): CareerLayout {
  const now = month(today);
  const kindOf = (e: CareerInput): Kind => (month(e.start) > now ? "next" : e.end === null || month(e.end) >= now ? "now" : "done");
  const d0 = Math.min(...input.map((e) => month(e.start)));
  const d1 =
    1 + Math.max(now, ...input.map((e) => (e.end ? month(e.end) : kindOf(e) === "next" ? month(e.start) + AHEAD : now)));
  const x = (m: number) => (m - d0) / (d1 - d0);

  const rows: Record<Band, number> = { work: 0, edu: 0 };
  const lane: Record<string, number> = {};
  for (const band of ["work", "edu"] as const) {
    const l = computeLanes(input.filter((e) => e.band === band), today);
    rows[band] = input.some((e) => e.band === band) ? l.maxLane + 1 : 0;
    Object.assign(lane, l.lane);
  }

  const tasks = input
    .map((e): CareerTask => {
      const kind = kindOf(e);
      const s = month(e.start);
      const end = e.end ? x(month(e.end) + 1) : 1;
      const x1 = kind === "now" ? x(now + 0.5) : end;
      const ahead = kind === "now" && end > x1 ? end : null;
      const span = x1 * (d1 - d0) - (s - d0);
      const narrow = span < e.label.length * MONTHS_PER_CHAR + 1.5;
      const row = lane[e.id];
      if (!narrow || row === 0) return { ...e, kind, row, x0: x(s), x1, ahead, out: narrow, wrap: false };
      const word = Math.max(...e.label.split(" ").map((w) => w.length));
      // Two lines get 6px padding a side instead of 10px: about a month.
      const x0 = Math.max(0, Math.min(x(s), x1 - (word * MONTHS_PER_CHAR + 1) / (d1 - d0)));
      return { ...e, kind, row, x0, x1, ahead, out: false, wrap: true };
    })
    .sort((a, b) => a.x0 - b.x0);

  const ticks: CareerLayout["ticks"] = [];
  for (let m = Math.ceil(d0 / 12) * 12; m < d1; m += 12) if (m > d0) ticks.push({ at: x(m), label: String(m / 12) });

  return { tasks, rows, ticks, today: x(now + 0.5) };
}

/** The diagram's entries from the content: jobs in the Work lane, schools in the Education lane. */
export function careerInputs({ work, education }: HomeContent): CareerInput[] {
  const schools = new Set(education.schools.map((s) => s.name));
  const span = (s: YearMonth, e: YearMonth | null) => (e ? month(e) - month(s) : 0);
  return [
    // A post at a school (the teaching job) is named by its role, so it cannot read as the degree.
    ...work.jobs.map((j) => ({
      id: j.id,
      band: "work" as const,
      label: j.short ?? (schools.has(j.company) ? j.role.split(",")[0] : j.company),
      start: j.start,
      end: j.end,
    })),
    ...education.schools.map((s) => {
      const long = `${s.degree}, ${s.field}`;
      const label = span(s.start, s.end) > long.length ? long : (s.short ?? s.degree);
      return { id: s.id, band: "edu" as const, label, start: s.start, end: s.end };
    }),
  ];
}
