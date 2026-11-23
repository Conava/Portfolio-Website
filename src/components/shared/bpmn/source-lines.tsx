import { highlight } from "./highlight";
import { INVOICE_SOURCE } from "./invoice-approval";
import "./bpmn.css";

/** Read-only BPMNscript source: one `.ln[data-l]` span per line so scenes can reveal lines in turn. */
export function SourceLines({ source = INVOICE_SOURCE, label = "BPMNscript source" }: { source?: string; label?: string }) {
  return (
    <pre className="bpmn-src" aria-label={label}>
      <code>
        {highlight(source).map((tokens, i) => (
          <span key={i} className="ln" data-l={i}>
            {tokens.map((t, j) =>
              t.kind === "plain" ? t.text : (
                <span key={j} className={`tok-${t.kind}`}>
                  {t.text}
                </span>
              ),
            )}
            {"\n"}
          </span>
        ))}
      </code>
    </pre>
  );
}
