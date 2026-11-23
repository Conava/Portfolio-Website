"use client";

import { useTranslations } from "next-intl";
import { DownloadIcon } from "@/components/shared/icons";
import { MenuItem, useMenu } from "./preset-menu";

export type ExportFormat = "bpmn" | "bpmnscript";
/** `bpmn: false` while the source does not compile. */
export type ExportState = { bpmn: boolean };

/** Export menu: an icon button in the explorer header. */
export function ExportMenu({
  exportState,
  onExport,
}: {
  exportState: ExportState;
  onExport: (format: ExportFormat) => void;
}) {
  const t = useTranslations("playground.export");
  const m = useMenu();
  const label = t("button");
  const pick = (format: ExportFormat) => {
    m.close();
    onExport(format);
  };

  return (
    <div className="pg-menu-root" {...m.rootProps}>
      <button className="icon-btn" aria-label={label} data-tip={label} data-pg-export-btn="" {...m.buttonProps}>
        <DownloadIcon />
      </button>
      <div className="pg-menu" data-align="start" {...m.menuProps}>
        {/* The reason is a visible second line, not a tooltip, so touch and screen readers get it too. */}
        <MenuItem
          data-pg-export="bpmn"
          label={t("bpmn")}
          hint={exportState.bpmn ? undefined : t("disabled")}
          disabled={!exportState.bpmn}
          onSelect={() => pick("bpmn")}
        />
        <MenuItem data-pg-export="bpmnscript" label={t("bpmnscript")} onSelect={() => pick("bpmnscript")} />
      </div>
    </div>
  );
}
