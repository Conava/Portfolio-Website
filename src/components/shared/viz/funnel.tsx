import type { CSSProperties } from "react";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/types";
import "./viz.css";

/**
 * Horizontal bars proportional to the largest value; the last bar carries the accent.
 * Bars are `.viz-bar` with `--i`, so a Proof block can drive their `scaleX` itself (pass `static`).
 */
export function Funnel({
  steps,
  caption,
  locale,
  static: isStatic,
}: {
  steps: { label: string; value: number }[];
  caption: string;
  locale: Locale;
  static?: boolean;
}) {
  const max = Math.max(...steps.map((s) => s.value));
  if (!steps.length || !(max > 0)) return null;
  return (
    <figure className="viz viz-funnel" data-static={isStatic ? "" : undefined}>
      <ol className="viz-steps">
        {steps.map((s, i) => (
          <li key={s.label}>
            <span className="viz-label">{s.label}</span>
            <span className="viz-num">{formatNumber(s.value, locale)}</span>
            <svg className="viz-track" aria-hidden="true">
              <rect
                className={`viz-bar${i === steps.length - 1 ? " acc" : ""}`}
                style={{ "--i": i } as CSSProperties}
                width={`${((s.value / max) * 100).toFixed(3)}%`}
                height="100%"
              />
            </svg>
          </li>
        ))}
      </ol>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
