import type { ImportView as UpstreamImportView } from "@/generated/bpmnscript/editor/outcome";

export { compileView, exportName, importView, type CompileView, type Message } from "@/generated/bpmnscript/editor/outcome";

export type ImportView = UpstreamImportView & {
  /** The message is the playground's own (localized) text, not the importer's English. */
  local?: boolean;
};

/** True only on a transition into error (the initial `pending` counts). */
export const shouldReportCompileError = (
  prev: "pending" | "ok" | "error",
  next: "ok" | "error",
): boolean => next === "error" && prev !== "error";
