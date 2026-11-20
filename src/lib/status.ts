import type { EducationContent, WorkContent, YearMonth } from "./types";

/**
 * The hero status lines, computed from content dates so they never go stale: every job running in
 * `today`'s month (end null or not before it), then the latest school while it is upcoming or running.
 */
export function statusLines(work: WorkContent, education: EducationContent, today: YearMonth): string[] {
  const running = (start: YearMonth, end: YearMonth | null) => start <= today && (end === null || end >= today);
  const lines = work.jobs.filter((j) => running(j.start, j.end)).map((j) => j.brief ?? `${j.role}, ${j.company}`);
  const school = education.schools.toSorted((a, b) => b.start.localeCompare(a.start))[0];
  if (school && (school.end === null || school.end >= today)) lines.push(school.brief ?? `${school.degree}, ${school.field}, ${school.name}`);
  return lines;
}
