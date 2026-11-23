import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/types";
import { InvoiceDiagram } from "./invoice-diagram";
import { SourceLines } from "./source-lines";
import "../viz/viz.css";
import "./explainer.css";

/** Inline `code` spans written with backticks. */
export function withCode(text: string) {
  return text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}

/**
 * The plain-language opener: the invoice approval drawn in BPMN beside the same process in
 * BPMNscript, then one sentence each on BPMN, who uses it and what the text notation adds.
 * `sample` picks what shows beside the notes: both panes (default), only the code (Flow, whose scene
 * builds the diagram), or none (Ink and Trace, whose scenes show the sample right below).
 * `code` replaces the default source block (Flow passes the one its scene highlights).
 */
export async function BpmnWhat({
  locale,
  code,
  sample = "pair",
}: {
  locale: Locale;
  code?: ReactNode;
  sample?: "pair" | "code" | "none";
}) {
  const [t, s] = await Promise.all([
    getTranslations({ locale, namespace: "bpmnscript.what" }),
    getTranslations({ locale, namespace: "scene" }),
  ]);
  const terms = t.raw("terms") as { term: string; text: string }[];
  return (
    <div className="bs-what">
      {sample !== "none" && (
        <div className="bs-what-pair" data-sample={sample}>
          {sample === "pair" && (
            <figure className="bs-what-pane">
              <figcaption className="bs-what-tag">{t("drawn")}</figcaption>
              <div className="bs-what-dg">
                <InvoiceDiagram />
              </div>
            </figure>
          )}
          <figure className="bs-what-pane">
            <figcaption className="bs-what-tag">{t("written")}</figcaption>
            {code ?? <SourceLines label={s("source")} />}
          </figure>
        </div>
      )}
      <dl className="bs-what-terms">
        {terms.map((x) => (
          <div key={x.term}>
            <dt>{x.term}</dt>
            <dd>{withCode(x.text)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The round-trip evaluation as the steps each model goes through, with the count that passes
 * each counted step and what leaves the pipeline there. `steps` are deployed, accepted and
 * equivalent, in that order; the refused and lost counts are their differences.
 * Bars are `.viz-bar` with `--i`, so a section can draw them in (the server markup is full).
 */
export async function RoundTrip({
  steps,
  caption,
  locale,
  lede = true,
}: {
  steps: { label: string; value: number }[];
  caption: string;
  locale: Locale;
  /** Off where the surrounding prose already says what the test checks. */
  lede?: boolean;
}) {
  const [deployed, accepted, equivalent] = steps.map((s) => s.value);
  if (steps.length !== 3 || !(deployed > 0)) return null;
  const t = await getTranslations({ locale, namespace: "bpmnscript.method" });
  const n = (v: number) => formatNumber(v, locale);
  const counts = [
    null,
    { value: deployed, label: t("deployed", { count: n(deployed) }) },
    { value: accepted, label: t("accepted", { count: n(accepted) }), exit: t("refused", { count: n(deployed - accepted) }) },
    null,
    { value: equivalent, label: t("equivalent", { count: n(equivalent) }), exit: t("lost", { count: n(accepted - equivalent) }) },
  ];
  let bar = 0;
  return (
    <figure className="viz bs-rt">
      <h3 className="bs-rt-head">{t("title")}</h3>
      {lede && <p className="bs-rt-lede">{t("lede")}</p>}
      <ol className="bs-rt-steps">
        {(t.raw("steps") as { title: string; text: string }[]).map((st, i) => {
          const c = counts[i];
          const last = i === counts.length - 1;
          return (
            <li key={st.title} data-counted={c ? "" : undefined}>
              <span className="bs-rt-n" aria-hidden="true">
                {i + 1}
              </span>
              <p className="bs-rt-title">{st.title}</p>
              <p className="bs-rt-text">{st.text}</p>
              {c && (
                <div className="bs-rt-count">
                  <span className="viz-num">{c.label}</span>
                  <svg className="viz-track" aria-hidden="true">
                    <rect
                      className={`viz-bar${last ? " acc" : ""}`}
                      style={{ "--i": bar++ } as CSSProperties}
                      width={`${((c.value / deployed) * 100).toFixed(3)}%`}
                      height="100%"
                    />
                  </svg>
                  {c.exit && <p className="bs-rt-exit">{c.exit}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <figcaption className="bs-rt-meaning">{caption}</figcaption>
    </figure>
  );
}
