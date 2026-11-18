import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/types";
import "./viz.css";

const LANE = 10; // px between parallel lanes

/** One stage segment; `n` lanes stacked around the shared center line. `i0` staggers the draw. */
export function StageLanes({ n, height, i0, accent }: { n: number; height: number; i0: number; accent?: boolean }) {
  const top = height / 2 - ((n - 1) * LANE) / 2;
  return (
    <svg className="viz-track viz-stage" style={{ height }} aria-hidden="true">
      {Array.from({ length: n }, (_, k) => (
        <rect
          key={k}
          className={`viz-lane${accent ? " acc" : ""}`}
          style={{ "--i": i0 + k } as CSSProperties}
          y={top + k * LANE - 2}
          width="100%"
          height="4"
        />
      ))}
    </svg>
  );
}

export const lanesHeight = (maxParallel: number) => Math.max(1, maxParallel) * LANE + 4;

/** Lanes a per-task stage draws: Task 1, Task 2, a faded lane for the ones between, Task N. */
const FAN = 4;

/**
 * Stages in a row. A `perTask` stage (one agent per task, each with its own review) fans out
 * into lanes (`.viz-lane`, so a section can draw them once), the third one faded as "and so
 * on": the number of tasks follows the plan, so the chart shows no count. It carries the accent.
 */
export async function Pipeline({
  stages,
  caption,
  locale,
}: {
  stages: { label: string; perTask?: boolean }[];
  caption: string;
  locale: Locale;
}) {
  if (!stages.length) return null;
  const t = await getTranslations({ locale, namespace: "viz" });
  const height = lanesHeight(stages.some((s) => s.perTask) ? FAN : 1);
  return (
    <figure className="viz viz-pipeline">
      <div className="viz-scroll">
        <ol className="viz-stages" style={{ "--cols": stages.length } as CSSProperties}>
          {stages.map((s, i) => (
            <li key={s.label} className={s.perTask ? "viz-fan" : undefined}>
              <StageLanes n={s.perTask ? FAN : 1} height={height} i0={i} accent={s.perTask} />
              <span className="viz-label">{s.label}</span>
              {s.perTask && <span className="viz-sub">{t("perTask")}</span>}
            </li>
          ))}
        </ol>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
