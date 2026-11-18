import type { CompileResult, DecompileResult } from "./protocol";

export type Message = { headline: string; notes: string[] };

export type CompileView = {
  state: "ok" | "error";
  xml?: string;
  errors: number;
  /** 1-based */
  firstErrorLine?: number;
  layoutWarning?: string;
  message?: string;
};

export type ImportView = {
  kind: "ok" | "warning" | "refused";
  source?: string;
  warnings: Message[];
  message?: Message;
  /** The message is the playground's own (localized) text, not the importer's English. */
  local?: boolean;
};

export function compileView(r: CompileResult): CompileView {
  if (r.ok) return { state: "ok", xml: r.output, errors: 0, layoutWarning: r.layoutWarning };
  if (r.kind === "error") return { state: "error", errors: 1, message: r.message };
  // Warnings (severity 2) do not block a compile; only errors count.
  const errs = r.diagnostics.filter((d) => d.severity === 1);
  return { state: "error", errors: errs.length, firstErrorLine: errs.length ? Math.min(...errs.map((d) => d.line)) + 1 : undefined };
}

/** First line is the headline; the rest are notes, kept verbatim (prefixes included). */
function splitMessage(text: string): Message {
  const [headline = "", ...rest] = text.split("\n");
  const notes = rest
    .map((l) => l.trim())
    .filter(Boolean);
  return { headline, notes };
}

export function importView(r: DecompileResult): ImportView {
  if (!r.ok) return { kind: "refused", warnings: [], message: splitMessage(r.message) };
  const warnings = r.warnings.map((w) => splitMessage(w.message));
  return { kind: warnings.length ? "warning" : "ok", source: r.output, warnings };
}

/** True only on a transition into error (the initial `pending` counts). */
export const shouldReportCompileError = (
  prev: "pending" | "ok" | "error",
  next: "ok" | "error",
): boolean => next === "error" && prev !== "error";

export function exportName(xmlOrSource: string, ext: ".bpmn" | ".bpmnscript"): string {
  const m =
    /<bpmn:process\b[^>]*\bid="([^"]*)"/.exec(xmlOrSource) ?? /^\s*process\s+([^\s({]+)/m.exec(xmlOrSource);
  const name = (m?.[1] ?? "").replace(/[^\w-]/g, "_");
  return (name || "process") + ext;
}
