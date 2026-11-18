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
  /** Left and right edge. A running task ends on the today line; a planned end after it is `rest`. */
  x0: number;
  x1: number;
  rest: number | null;
  /** Too narrow for its label at the diagram's minimum width: the label sits to its right. */
  out: boolean;
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
      const end = e.end ? month(e.end) + 1 : null;
      const x1 = kind === "now" ? x(now + 0.5) : kind === "next" && end === null ? 1 : x(end!);
      const rest = kind === "now" && end !== null && end > now + 1 ? x(end) : null;
      const span = (rest ?? x1) * (d1 - d0) - (s - d0);
      return { ...e, kind, row: lane[e.id], x0: x(s), x1, rest, out: span < e.label.length * MONTHS_PER_CHAR + 1.5 };
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
      label: schools.has(j.company) ? j.role.split(",")[0] : j.company,
      start: j.start,
      end: j.end,
    })),
    ...education.schools.map((s) => {
      const long = `${s.degree}, ${s.field}`;
      return { id: s.id, band: "edu" as const, label: span(s.start, s.end) > long.length ? long : s.degree, start: s.start, end: s.end };
    }),
  ];
}
