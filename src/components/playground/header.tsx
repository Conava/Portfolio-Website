"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { ColorModeToggle } from "@/components/shared/controls/color-mode-toggle";
import { ArrowLeftIcon } from "@/components/shared/icons";
import { Link } from "@/i18n/navigation";
import type { Design } from "@/lib/design-values";
import type { Preset } from "@/lib/playground/presets";
import { ExportMenu, type ExportFormat, type ExportState } from "./export-menu";
import { PresetMenu } from "./preset-menu";
import "./shell.css";

/** `copied` shows for `SHARE_COPIED_MS`; the caller resets it to `idle`. */
export type ShareState = "idle" | "copied" | "too-long";
export const SHARE_COPIED_MS = 1600;

const glyph = (d: string) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={d} />
  </svg>
);
const ImportIcon = () => glyph("M8 10.5v-8M4.5 6L8 2.5 11.5 6M3 13.5h10");
const ShareIcon = () =>
  glyph("M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8");

/**
 * Playground header: crumb (link back to the site, "BPMNscript Playground", version), the tools
 * (examples, Import, Export, Share) and the light/dark switch. English only, and the site's
 * design switch does not apply here. Below 900 px the crumb is a back arrow plus the title and
 * the tools are icon buttons; below 640 px the tools move to a second row with their labels back.
 */
export function PlaygroundHeader({
  version,
  presets,
  onPreset,
  onImportFile,
  exportState,
  onExport,
  shareState,
  onShare,
  design,
}: {
  version: string;
  presets: readonly Preset[];
  onPreset: (preset: Preset) => void;
  onImportFile: (file: File) => void;
  exportState: ExportState;
  onExport: (format: ExportFormat) => void;
  shareState: ShareState;
  onShare: () => void;
  design: Design;
}) {
  const t = useTranslations("playground");
  const file = useRef<HTMLInputElement>(null);
  const copied = shareState === "copied";
  const shareLabel = copied ? t("share.copied") : t("share.button");

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
        <PresetMenu presets={presets} onPreset={onPreset} />

        <button
          type="button"
          className="pg-btn"
          aria-label={t("import.button")}
          data-tip={t("import.button")}
          onClick={() => file.current?.click()}
        >
          <ImportIcon />
          <span className="pg-btn-label">{t("import.button")}</span>
        </button>
        <input
          ref={file}
          type="file"
          accept=".bpmn,.xml"
          data-pg-import=""
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // the same file can be imported again
            if (f) onImportFile(f);
          }}
        />

        <ExportMenu exportState={exportState} onExport={onExport} />

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
            {/* Both labels share one cell, so the swap never moves the neighbors. */}
            <span className="pg-btn-label pg-swap">
              <span aria-hidden={copied || undefined}>{t("share.button")}</span>
              <span aria-hidden={!copied || undefined}>{t("share.copied")}</span>
            </span>
          </button>
          <span role="status" className="pg-share-note" data-show={shareState === "too-long" ? "" : undefined}>
            {shareState === "too-long" ? t("share.tooLong") : copied ? t("share.copied") : ""}
          </span>
        </div>
      </div>

      <div className="pg-ctl">
        {design !== "flow" && <ColorModeToggle />}
      </div>
    </header>
  );
}
