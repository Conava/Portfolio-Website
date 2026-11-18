import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { formatNumber, formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/types";
import "./funnel-figure.css";

/**
 * The round-trip evaluation set like a page of the thesis: the method as a numbered list beside
 * Figure 1, a funnel of three brush strokes (deployed, accepted, equivalent). What drops out at a
 * step stays as a hollow outline with its count, and the pass rate sits on the connector.
 * The strokes are drawn in as the figure scrolls through (CSS scroll timeline); the server markup
 * is the drawn figure.
 */
export async function FunnelFigure({
  steps,
  caption,
  locale,
}: {
  steps: { label: string; value: number }[];
  caption: string;
  locale: Locale;
}) {
  const [deployed, accepted, equivalent] = steps.map((s) => s.value);
  if (steps.length !== 3 || !(deployed > 0) || !(accepted > 0)) return null;
  const t = await getTranslations({ locale, namespace: "bpmnscript.method" });
  const n = (v: number) => formatNumber(v, locale);
  const pct = (v: number) => `${((v / deployed) * 100).toFixed(3)}%`;
  const stages = [
    { value: deployed, label: t("deployed", { count: n(deployed) }) },
    { value: accepted, label: t("accepted", { count: n(accepted) }), exit: t("refused", { count: n(deployed - accepted) }), rate: accepted / deployed },
    { value: equivalent, label: t("equivalent", { count: n(equivalent) }), exit: t("lost", { count: n(accepted - equivalent) }), rate: equivalent / accepted },
  ];
  const method = t.raw("steps") as { title: string; text: string }[];

  return (
    <div className="ink-fig-page">
      <div className="ink-fig-method">
        <h3>{t("title")}</h3>
        <p className="ink-fig-lede">{t("lede")}</p>
        <ol>
          {method.map((m) => (
            <li key={m.title}>
              <strong>{m.title}.</strong> {m.text}
            </li>
          ))}
        </ol>
      </div>
      <figure className="ink-fig">
        {/* The brush edge: a little turbulence displaces the stroke outline. */}
        <svg className="ink-fig-defs" aria-hidden="true" focusable="false">
          <filter id="ink-brush" x="-2%" y="-30%" width="104%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018 0.28" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="6" />
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </svg>
        <ol className="ink-fig-stages">
          {stages.map((s, i) => (
            <li
              key={s.label}
              style={{ "--w": pct(s.value), "--prev": pct(stages[i - 1]?.value ?? s.value), "--i": i } as CSSProperties}
            >
              {s.rate !== undefined && (
                <span className="ink-fig-link">
                  <span className="ink-fig-rate">{formatPercent(s.rate * 100, locale)}</span>
                </span>
              )}
              <p className="ink-fig-label">{s.label}</p>
              <span className="ink-fig-track" aria-hidden="true">
                <span className="ink-fig-stroke" />
              </span>
              {s.exit && <p className="ink-fig-exit">{s.exit}</p>}
            </li>
          ))}
        </ol>
        <figcaption>
          <span className="ink-fig-n">{t("figure")}</span> {caption}
        </figcaption>
      </figure>
    </div>
  );
}
