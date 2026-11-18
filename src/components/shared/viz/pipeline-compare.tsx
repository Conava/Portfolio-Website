import type { CSSProperties } from "react";
import { lanesHeight, StageLanes } from "./pipeline";
import "./viz.css";

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
