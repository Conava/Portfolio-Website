"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/shared/icons";
import type { Message } from "@/lib/playground/outcome";
import type { ConvDiagnostic } from "@/lib/playground/protocol";
import { FileIcon } from "./explorer";
import { tabKeys } from "./mobile-tabs";
import { ErrorIcon, WarnIcon } from "./status-bar";
import "./shell.css";

export type PanelTab = "problems" | "importLog";
export type FileProblems = { id: string; name: string; problems: readonly ConvDiagnostic[] };

/** Compiler text verbatim: the headline, then the note/help lines indented. */
function Lines({ head, rest }: { head: string; rest: string[] }) {
  return (
    <span className="pg-msg" lang="en">
      <span>{head}</span>
      {rest.map((l, i) => (
        <span key={i} className="pg-msg-note">
          {l}
        </span>
      ))}
    </span>
  );
}

/**
 * Problems (every file's diagnostics, grouped by file) and Import log. Rendered only while
 * open; `onClose` hides it, the status bar's problem count and Ctrl+J bring it back.
 */
export function BottomPanel({
  files,
  importLog,
  onReveal,
  onClose,
  tab,
  onTabChange,
}: {
  files: readonly FileProblems[];
  importLog: readonly Message[];
  /** 1-based line and column in file `id`. */
  onReveal: (id: string, line: number, col: number) => void;
  onClose: () => void;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
}) {
  const t = useTranslations("playground.panel");
  const id = useId();
  const total = files.reduce((n, f) => n + f.problems.length, 0);
  const tabs: [PanelTab, string, number][] = [
    ["problems", t("problems"), total],
    ["importLog", t("importLog"), importLog.length],
  ];

  return (
    <section className="pg-panel" aria-label={t("toggle")}>
      <div className="pg-panel-bar">
        <div role="tablist" className="pg-panel-tabs" onKeyDown={tabKeys}>
          {tabs.map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`${id}-${k}`}
              aria-selected={tab === k}
              aria-controls={`${id}-${k}-panel`}
              tabIndex={tab === k ? 0 : -1}
              className="pg-tab"
              onClick={() => onTabChange(k)}
            >
              {label} <span className="pg-count">{n}</span>
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn pg-panel-toggle" aria-label={t("toggle")} aria-keyshortcuts="Control+J" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div id={`${id}-problems-panel`} role="tabpanel" aria-labelledby={`${id}-problems`} className="pg-panel-body" hidden={tab !== "problems"}>
        {total ? (
          <ul data-pg-problems="">
            {files
              .filter((f) => f.problems.length)
              .map((f) => (
                <li key={f.id} className="pg-pgroup">
                  <span className="pg-pfile">
                    <FileIcon />
                    {f.name}
                    <span className="pg-count">{f.problems.length}</span>
                  </span>
                  <ul>
                    {[...f.problems].sort((a, b) => a.line - b.line || a.character - b.character).map((p, i) => {
                      const [head = "", ...rest] = p.message.split("\n");
                      return (
                        <li key={i} data-pg-problem="">
                          <button type="button" className="pg-row" onClick={() => onReveal(f.id, p.line + 1, p.character + 1)}>
                            {p.severity === 1 ? <ErrorIcon /> : <WarnIcon />}
                            <span className="pg-sr">{p.severity === 1 ? t("error") : t("warning")} </span>
                            <Lines head={head} rest={rest} />
                            <span className="pg-pos">
                              [Ln {p.line + 1}, Col {p.character + 1}]
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
          </ul>
        ) : (
          <p className="pg-empty" data-pg-problems="">
            {t("noProblems")}
          </p>
        )}
      </div>
      <div id={`${id}-importLog-panel`} role="tabpanel" aria-labelledby={`${id}-importLog`} className="pg-panel-body" hidden={tab !== "importLog"}>
        {importLog.length ? (
          <ul data-pg-import-log="">
            {importLog.map((w, i) => (
              <li key={i} className="pg-row">
                <WarnIcon />
                <Lines head={w.headline} rest={w.notes} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="pg-empty" data-pg-import-log="">
            {t("noImport")}
          </p>
        )}
      </div>
    </section>
  );
}
