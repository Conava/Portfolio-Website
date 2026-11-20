import type { CSSProperties } from "react";
import "./viz.css";

const LANE = 10; // px between parallel lanes

/** One stage segment; `n` lanes stacked around the shared center line. `i0` staggers the draw. */
function StageLanes({ n, height, i0, accent }: { n: number; height: number; i0: number; accent?: boolean }) {
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

const lanesHeight = (maxParallel: number) => Math.max(1, maxParallel) * LANE + 4;

type Flow = { label: string; stages: string[] };

/** Two stacked flows on one column grid, so a stage has the same width in both. Only the given stages. */
export function PipelineCompare({ before, after, caption }: { before: Flow; after: Flow; caption: string }) {
  const cols = Math.max(before.stages.length, after.stages.length);
  if (!cols) return null;
  const height = lanesHeight(1);
  return (
    <figure className="viz viz-pipeline">
      <div className="viz-scroll">
        {[before, after].map((f, fi) => (
          <div key={fi} className="viz-flow">
            <p className="viz-flow-label">{f.label}</p>
            <ol className="viz-stages" style={{ "--cols": cols } as CSSProperties}>
              {f.stages.map((s, i) => (
                <li key={s}>
                  <StageLanes n={1} height={height} i0={i} accent={fi === 1} />
                  <span className="viz-label">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
