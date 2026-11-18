"use client";

import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/shared/icons";
import type { ImportView } from "@/lib/playground/outcome";
import { ErrorIcon } from "./status-bar";
import "./shell.css";

/**
 * `onDismiss` must clear the outcome and move focus (e.g. to the editor): the
 * banner unmounts, so focus would otherwise fall to the body.
 *
 * Sits above the editor in the flow (it pushes the editor down, never covers
 * it). Renders only for a refused or failed import: the importer's reason
 * verbatim, its notes indented, then "The editor is unchanged."
 */
export function ImportBanner({ outcome, onDismiss }: { outcome: ImportView | null; onDismiss: () => void }) {
  const t = useTranslations("playground");
  if (outcome?.kind !== "refused" || !outcome.message) return null;
  const { headline, notes } = outcome.message;

  return (
    <div className="pg-banner" data-pg-refusal="" role="alert">
      <ErrorIcon />
      <div className="pg-msg">
        <span className="pg-banner-head" lang={outcome.local ? undefined : "en"}>{headline}</span>
        {notes.map((n, i) => (
          <span key={i} className="pg-msg-note" lang="en">
            {n}
          </span>
        ))}
        <span>{t("import.refused")}</span>
      </div>
      <button type="button" className="icon-btn" aria-label={t("import.dismiss")} onClick={onDismiss}>
        <CloseIcon />
      </button>
    </div>
  );
}
