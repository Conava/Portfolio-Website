"use client";

import { useTranslations } from "next-intl";
import { ColorModeToggle } from "@/components/shared/controls/color-mode-toggle";
import { ArrowLeftIcon } from "@/components/shared/icons";
import { Link } from "@/i18n/navigation";
import type { Design } from "@/lib/design-values";
import "./shell.css";

/** `copied` shows for `SHARE_COPIED_MS`; the caller resets it to `idle`. */
export type ShareState = "idle" | "copied" | "too-long";
export const SHARE_COPIED_MS = 1600;
/** `ok` and `error` show for `COMPILE_RESULT_MS` after an explicit compile; the caller resets them to `idle`. */
export type CompileButtonState = "idle" | "busy" | "ok" | "error";
export const COMPILE_RESULT_MS = 1600;

const glyph = (d: string) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={d} />
  </svg>
);
const ShareIcon = () =>
  glyph("M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8");
const CompileIcon = () => glyph("M5 3.5v9l7-4.5z");
const HelpIcon = () => glyph("M6.2 6.2a1.9 1.9 0 1 1 2.6 1.75c-.5.2-.8.6-.8 1.1v.45M8 11.6v.1M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z");

/**
 * Playground header: crumb (link back to the site, "BPMNscript Playground", version), the tools
 * (Compile, Share, keyboard shortcuts) and the light/dark switch. File actions and examples live in
 * the explorer. English only, and the site's design switch does not apply here. Below 900 px the
 * crumb is a back arrow plus the title and Share and the shortcuts are icon buttons; below 640 px
 * the tools move to a second row with their labels back.
 */
export function PlaygroundHeader({
  version,
  compileState,
  compileErrors,
  canCompile,
  onCompile,
  shareState,
  onShare,
  onShortcuts,
  design,
}: {
  version: string;
  compileState: CompileButtonState;
  /** Errors of the last explicit compile, shown while `compileState` is `error`. */
  compileErrors: number;
  canCompile: boolean;
  onCompile: () => void;
  shareState: ShareState;
  onShare: () => void;
  onShortcuts: () => void;
  design: Design;
}) {
  const t = useTranslations("playground");
  const copied = shareState === "copied";
  const shareLabel = copied ? t("share.copied") : t("share.button");
  const compileLabels = {
    idle: t("compile.button"),
    busy: t("compile.busy"),
    ok: t("compile.ok"),
    error: t("compile.error", { n: compileErrors }),
  };

  return (
    <header className="pg-hdr">
      <div className="pg-crumb">
        <Link href="/" className="pg-home">
          <ArrowLeftIcon className="pg-home-icon" />
          <span className="pg-home-text">{t("crumbHome")}</span>
        </Link>
        <span className="pg-home-sep" aria-hidden="true">
          /
        </span>
        <h1 className="pg-title">{t("meta.title")}</h1>
        <span className="pg-version">{t("version", { version })}</span>
      </div>

      <div className="pg-tools">
        <button
          type="button"
          className="pg-btn pg-compile"
          data-pg-compile=""
          data-state={compileState}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          aria-busy={compileState === "busy" || undefined}
          disabled={!canCompile}
          onClick={onCompile}
        >
          <CompileIcon />
          {/* Every label shares one cell, so the result never moves the neighbors. */}
          <span className="pg-swap">
            {(Object.keys(compileLabels) as CompileButtonState[]).map((k) => (
              <span key={k} aria-hidden={k !== compileState || undefined}>
                {compileLabels[k]}
              </span>
            ))}
          </span>
        </button>

        <div className="pg-share">
          <button
            type="button"
            className="pg-btn"
            data-pg-share=""
            data-state={shareState}
            aria-label={shareLabel}
            data-tip={shareLabel}
            data-tip-align="end"
            onClick={onShare}
          >
            <ShareIcon />
            <span className="pg-btn-label pg-swap">
              <span aria-hidden={copied || undefined}>{t("share.button")}</span>
              <span aria-hidden={!copied || undefined}>{t("share.copied")}</span>
            </span>
          </button>
          <span role="status" className="pg-share-note" data-show={shareState === "too-long" ? "" : undefined}>
            {shareState === "too-long" ? t("share.tooLong") : copied ? t("share.copied") : ""}
          </span>
        </div>

        <button
          type="button"
          className="icon-btn pg-help"
          aria-label={t("shortcuts.button")}
          data-tip={t("shortcuts.button")}
          data-tip-align="end"
          aria-haspopup="dialog"
          aria-keyshortcuts="?"
          data-pg-shortcuts-btn=""
          onClick={onShortcuts}
        >
          <HelpIcon />
        </button>
      </div>

      <div className="pg-ctl">{design !== "flow" && <ColorModeToggle />}</div>
    </header>
  );
}
