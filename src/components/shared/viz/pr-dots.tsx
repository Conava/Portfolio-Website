import { Fragment } from "react";
import { getTranslations } from "next-intl/server";
import { formatDate, formatMonth, formatNumber } from "@/lib/format";
import type { PrState, PullRequest } from "@/lib/github";
import type { Locale } from "@/lib/types";
import { packRows } from "./pack";
import { Axis, thinTicks, type Tick } from "./timeline";
import { ChevronIcon } from "@/components/shared/icons";
import "./viz.css";

const STATES: PrState[] = ["OPEN", "MERGED", "CLOSED"];
const KEY = { OPEN: "open", MERGED: "merged", CLOSED: "closed" } as const;
const ROW = 12; // px per stacked mark row
const R = 3.5;
// Marks are packed against the narrowest plot (about 200 px, a phone panel), so they never touch;
// wider plots only add space between them. Same-day PRs of one state share a mark with a count.
const NOMINAL = 200;
const GAP = 1.5;
const countWidth = (n: number) => (n > 1 ? 3 + String(n).length * 7 : 0);
const DAY = 86_400_000;

const short = (repo: string) => repo.split("/").pop() ?? repo;
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
/** Merged PRs sit at their merge date; open and closed ones at their creation date. */
const when = (p: PullRequest) => new Date(p.mergedAt ?? p.createdAt).getTime();

function Mark({ state }: { state: PrState }) {
  return (
    <>
      <circle className={`viz-dot ${KEY[state]}`} r={R} />
      {state === "CLOSED" && <line className="viz-slash" x1={-R - 1} y1={R + 1} x2={R + 1} y2={-R - 1} />}
    </>
  );
}

/**
 * One row per repo, one mark per PR (or per day and state, with a count) placed by date; shape is
 * the state (hollow open, solid merged, slashed closed). Marks that would touch stack into extra
 * rows. The marks are decorative; the <details> lists every PR as a link.
 */
export async function PrDots({
  prs,
  fetchedAt,
  caption,
  locale,
}: {
  prs: PullRequest[];
  fetchedAt: string;
  caption: string;
  locale: Locale;
}) {
  if (!prs.length) return null;
  const t = await getTranslations({ locale, namespace: "github" });

  const times = prs.map(when);
  const first = new Date(Math.min(...times));
  const d0 = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
  const d1 = Math.max(new Date(fetchedAt).getTime(), ...times);
  const at = (ms: number) => (ms - d0) / (d1 - d0 || 1);

  const ticks: Tick[] = [];
  const must: boolean[] = []; // every January (it carries the year; the first tick shows too when it fits)
  for (let m = new Date(d0); m.getTime() <= d1; m.setUTCMonth(m.getUTCMonth() + 1)) {
    must.push(m.getUTCMonth() === 0);
    // The year only where it changes (first tick, January), so month labels stay short.
    const label =
      ticks.length && m.getUTCMonth()
        ? new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(m)
        : formatMonth(m.toISOString().slice(0, 7), locale);
    ticks.push({ at: at(m.getTime()), label });
  }

  const repos = [...new Set(prs.map((p) => p.repo))].map((repo) => {
    const list = prs.filter((p) => p.repo === repo).sort((a, b) => when(a) - when(b));
    const groups: { state: PrState; day: number; prs: PullRequest[] }[] = [];
    for (const p of list) {
      const day = Math.floor(when(p) / DAY);
      const g = groups.find((g) => g.day === day && g.state === p.state);
      if (g) g.prs.push(p);
      else groups.push({ state: p.state, day, prs: [p] });
    }
    const marks = groups.map((g) => ({ ...g, x: at(when(g.prs[0])) }));
    const rows = packRows(
      marks.map((m) => ({ x: m.x, left: R, right: R + countWidth(m.prs.length) })),
      NOMINAL,
      GAP,
    );
    const count = (s: PrState) => list.filter((p) => p.state === s).length;
    return { repo, marks: marks.map((m, i) => ({ ...m, row: rows[i] })), rows: Math.max(...rows) + 1, count };
  });
  const present = STATES.filter((s) => prs.some((p) => p.state === s));

  return (
    <figure className="viz viz-prs">
      <div className="viz-scroll">
        <div className="viz-plot">
          <Axis ticks={thinTicks(ticks, must)} rows={repos.length} />
          {repos.map((r, i) => (
            <Fragment key={r.repo}>
              <span className="viz-label" aria-hidden="true" style={{ gridRow: i + 2 }}>
                {short(r.repo)}
              </span>
              <svg className="viz-track" aria-hidden="true" style={{ gridRow: i + 2, height: r.rows * ROW }}>
                {r.marks.map((m) => (
                  <svg key={`${m.day}-${m.state}`} x={pct(m.x)} y={m.row * ROW + ROW / 2} overflow="visible">
                    <title>{m.prs.map((p) => `${short(p.repo)}#${p.number} ${p.title}`).join("\n")}</title>
                    <Mark state={m.state} />
                    {m.prs.length > 1 && (
                      <text className="viz-count" x={R + 2} dy="0.35em">
                        {m.prs.length}
                      </text>
                    )}
                  </svg>
                ))}
              </svg>
            </Fragment>
          ))}
        </div>
      </div>
      <ul className="viz-legend" aria-hidden="true">
        {present.map((s) => (
          <li key={s}>
            <svg width="14" height="14" viewBox="-7 -7 14 14">
              <Mark state={s} />
            </svg>
            {t(KEY[s])}
          </li>
        ))}
      </ul>
      <figcaption>
        <details>
          <summary>
            {caption}
            <ChevronIcon />
          </summary>
          <table className="viz-table">
            <thead>
              <tr>
                <th scope="col">{t("repo")}</th>
                {present.map((s) => (
                  <th key={s} scope="col">
                    {t(KEY[s])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repos.map((r) => (
                <tr key={r.repo}>
                  <th scope="row">{short(r.repo)}</th>
                  {present.map((s) => (
                    <td key={s}>{formatNumber(r.count(s), locale)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {/* The marks are drawn only; every PR is a link here. Newest first. */}
          <ol className="viz-links">
            {[...prs]
              .sort((a, b) => when(b) - when(a))
              .map((p) => (
                <li key={p.url}>
                  <a href={p.url}>
                    {short(p.repo)}#{p.number} {p.title}
                  </a>{" "}
                  <span className="viz-sub-inline">
                    {t(KEY[p.state])}, {formatDate(new Date(when(p)).toISOString(), locale)}
                  </span>
                </li>
              ))}
          </ol>
        </details>
      </figcaption>
    </figure>
  );
}
