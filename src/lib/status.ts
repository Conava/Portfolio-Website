import { formatMonth } from "./format";
import type { EducationContent, Locale, WorkContent, YearMonth } from "./types";

/**
 * The hero status line, computed from content dates so it never goes stale: every job running in
 * `today`'s month (end null or not before it), then the latest school while it is upcoming or
 * running. An upcoming school reads "<brief> from <Month Year>" via `from`.
 */
export function statusLine(
  work: WorkContent,
  education: EducationContent,
  today: YearMonth,
  locale: Locale,
  from: (what: string, date: string) => string,
): string {
  const running = (start: YearMonth, end: YearMonth | null) => start <= today && (end === null || end >= today);
  const clauses = work.jobs.filter((j) => running(j.start, j.end)).map((j) => j.brief ?? `${j.role}, ${j.company}`);
  const school = education.schools.toSorted((a, b) => b.start.localeCompare(a.start))[0];
  if (school) {
    const what = school.brief ?? `${school.degree}, ${school.field}, ${school.name}`;
    if (school.start > today) clauses.push(from(what, formatMonth(school.start, locale, "long")));
    else if (running(school.start, school.end)) clauses.push(what);
  }
  return clauses.map((c) => `${c}.`).join(" ");
}
