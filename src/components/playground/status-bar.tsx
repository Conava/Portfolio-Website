"use client";

import { useTranslations } from "next-intl";
import "./shell.css";

const glyph = (children: React.ReactNode, className?: string) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
    {children}
  </svg>
);

/** State icons: the shape carries the state, the color only repeats it. */
export const OkIcon = () => glyph(<><circle cx="8" cy="8" r="5.5" /><path d="M5.6 8.2l1.7 1.7 3.1-3.4" /></>, "pg-ic-ok");
export const ErrorIcon = () => glyph(<><circle cx="8" cy="8" r="5.5" /><path d="M4.1 11.9l7.8-7.8" /></>, "pg-ic-err");
export const WarnIcon = () => glyph(<><path d="M8 2.5l6 10.5H2z" /><path d="M8 6.5v3M8 11.4v.1" /></>, "pg-ic-warn");
/** An open ring: started, not there yet. Static on purpose (no spinner). */
const StartingIcon = () => glyph(<path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5" />);

export type LspState = "starting" | "ready" | "failed";
export type CompileState = "pending" | "ok" | "error";

/**
 * IDE status bar. Left: problems in the workspace (toggles the panel), language server state (+ Retry).
 * Right: whether the open file compiles, cursor, indentation, language. Only the state texts are live regions.
 */
export function StatusBar({
  lsp,
  compile,
  firstErrorLine,
  errors,
  warnings,
  cursor,
  hasFile,
  onProblems,
  onRetry,
}: {
  lsp: LspState;
  compile: CompileState;
  /** 1-based */
  firstErrorLine?: number;
  /** Diagnostics across all files. */
  errors: number;
  warnings: number;
  cursor: { line: number; col: number };
  hasFile: boolean;
  onProblems: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("playground.status");

  return (
    <footer className="pg-status">
      <button type="button" className="pg-st pg-st-btn" data-pg-problem-count="" aria-keyshortcuts="Control+J" onClick={onProblems}>
        <ErrorIcon />
        <span aria-hidden="true">{errors}</span>
        <WarnIcon />
        <span aria-hidden="true">{warnings}</span>
        <span className="pg-sr">{t("problems", { errors, warnings })}</span>
      </button>

      <span className="pg-st" data-state={lsp}>
        {lsp === "ready" ? <OkIcon /> : lsp === "failed" ? <ErrorIcon /> : <StartingIcon />}
        <span aria-live="polite">{t(lsp)}</span>
        {lsp === "failed" && (
          <button type="button" className="pg-retry" onClick={onRetry}>
            {t("retry")}
          </button>
        )}
      </span>

      <span className="pg-st-right">
        <span className="pg-st" data-state={compile} data-pg-compile-state="">
          {hasFile && compile === "ok" ? <OkIcon /> : hasFile && compile === "error" ? <ErrorIcon /> : null}
          <span aria-live="polite">
            {!hasFile
              ? ""
              : compile === "ok"
                ? t("compiled")
                : compile === "error"
                  ? firstErrorLine
                    ? t("firstError", { line: firstErrorLine })
                    : t("notCompiled")
                  : ""}
          </span>
        </span>
        {hasFile && (
          <>
            <span className="pg-st" data-pg-cursor="">{t("cursor", cursor)}</span>
            <span className="pg-st pg-st-wide">{t("spaces")}</span>
            <span className="pg-st pg-st-wide">UTF-8</span>
            <span className="pg-st">{t("language")}</span>
          </>
        )}
      </span>
    </footer>
  );
}
