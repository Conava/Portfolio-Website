import { getLocale, getTranslations } from "next-intl/server";
import { formatDuration, formatRange } from "@/lib/format";
import { computeLanes, type DatedEntry } from "@/lib/lanes";
import type { HomeContent, Locale, YearMonth } from "@/lib/types";
import { TraceLayerClient } from "./trace-layer-client";

/**
 * Trace's line. Lanes are computed here from the content dates (jobs + schools) so only the
 * lane map, the merge-pad sentences and the task durations reach the client, not the whole content.
 */
export async function TraceLayer({ content, today }: { content: HomeContent; today: YearMonth }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  // A job at a school (a teaching post) is named by its role, so the sentence cannot read as the degree.
  const schools = new Set(content.education.schools.map((s) => s.name));
  const entries: DatedEntry[] = [
    ...content.work.jobs.map((j) => ({
      id: j.id,
      label: schools.has(j.company) ? `${j.role.split(",")[0]} (${j.company})` : j.company,
      start: j.start,
      end: j.end,
    })),
    ...content.education.schools.map((s) => ({ id: s.id, label: s.degree, start: s.start, end: s.end })),
  ];
  const { lane, overlaps } = computeLanes(entries, today);
  const byId = new Map(entries.map((e) => [e.id, e]));

  // A merge pad (lane > 0) names the entry it branched off: of the entries it overlaps on a
  // lower lane, the one on the nearest lane (earliest start on a tie). So a lane-2 pad names the
  // lane-1 job beside it, the reason it needed a lane of its own.
  const tips: Record<string, string> = {};
  const spans: Record<string, string> = {};
  for (const e of entries) {
    // Only finished entries get a duration; a planned end still ahead is not "done" yet.
    if (e.end && e.end <= today) spans[e.id] = formatDuration(e.start, e.end, locale as Locale);
    const k = lane[e.id];
    if (!k) continue;
    const other = (o: (typeof overlaps)[number]) => byId.get(o.a === e.id ? o.b : o.a)!;
    const o = overlaps
      .filter((o) => (o.a === e.id || o.b === e.id) && lane[other(o).id] < k)
      .sort((p, q) => lane[other(q).id] - lane[other(p).id] || other(p).start.localeCompare(other(q).start))[0];
    if (!o) continue;
    tips[e.id] = t("trace.overlap", {
      a: e.label,
      b: other(o).label,
      range: formatRange(o.start, o.end, locale as Locale, t("date.present")),
    });
  }

  return <TraceLayerClient lanes={lane} tips={tips} spans={spans} />;
}
