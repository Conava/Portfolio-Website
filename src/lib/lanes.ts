import type { YearMonth } from "./types";

export interface DatedEntry { id: string; label: string; start: YearMonth; end: YearMonth | null }
/** `a` started first. */
export interface Overlap { a: string; b: string; start: YearMonth; end: YearMonth }
export interface LaneLayout { lane: Record<string, number>; overlaps: Overlap[]; maxLane: number }

/** The UTC month of `d`, so server and client agree whatever their zones. */
export function toYearMonth(d: Date): YearMonth {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Greedy interval coloring over inclusive month intervals ("YYYY-MM" compares lexicographically).
 * `end: null` runs until `today`; an entry starting after `today` is `[start, start]`.
 */
export function computeLanes(entries: DatedEntry[], today: YearMonth): LaneLayout {
  const iv = entries
    .map((x) => ({ id: x.id, start: x.start, end: x.end ?? (x.start > today ? x.start : today) }))
    .sort((p, q) => p.start.localeCompare(q.start) || p.end.localeCompare(q.end) || p.id.localeCompare(q.id));

  const laneEnds: YearMonth[] = []; // last end month per lane
  const lane: Record<string, number> = {};
  for (const x of iv) {
    let i = laneEnds.findIndex((end) => end < x.start);
    if (i < 0) i = laneEnds.length;
    laneEnds[i] = x.end;
    lane[x.id] = i;
  }

  // ponytail: O(n^2) pair scan, fine under 50 entries; sweep line if that grows.
  const overlaps: Overlap[] = [];
  iv.forEach((a, i) =>
    iv.slice(i + 1).forEach((b) => {
      const end = a.end < b.end ? a.end : b.end;
      if (b.start <= end) overlaps.push({ a: a.id, b: b.id, start: b.start, end });
    }),
  );
  overlaps.sort((p, q) => p.start.localeCompare(q.start));

  return { lane, overlaps, maxLane: Math.max(0, laneEnds.length - 1) };
}
