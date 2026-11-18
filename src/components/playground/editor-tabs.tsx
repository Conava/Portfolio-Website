"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon, MenuIcon } from "@/components/shared/icons";
import { FileIcon } from "./explorer";
import "./shell.css";

export type TabFile = { id: string; name: string; dirty: boolean; errors: number };

/**
 * Open files as tabs. A dirty tab shows a dot in place of its close button until hovered or
 * focused. Middle click closes. Scrolls sideways when the tabs do not fit.
 */
export function EditorTabs({
  tabs,
  active,
  explorerOpen,
  onSelect,
  onClose,
  onToggleExplorer,
}: {
  tabs: readonly TabFile[];
  active: string | null;
  explorerOpen: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onToggleExplorer: () => void;
}) {
  const t = useTranslations("playground");
  const list = useRef<HTMLUListElement>(null);

  // Keep the active tab in view, e.g. after Alt+PageDown or opening a file from the explorer.
  useEffect(() => {
    list.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, tabs.length]);

  return (
    <div className="pg-etabs">
      <button
        type="button"
        className="icon-btn pg-xtoggle"
        aria-label={t("explorer.toggle")}
        aria-expanded={explorerOpen}
        aria-keyshortcuts="Control+B"
        data-pg-explorer-toggle=""
        onClick={onToggleExplorer}
      >
        <MenuIcon />
      </button>
      <ul ref={list} aria-label={t("tabs.openFiles")} data-pg-tabs="">
        {tabs.map((f) => (
          <li
            key={f.id}
            className="pg-etab"
            data-active={f.id === active ? "" : undefined}
            data-dirty={f.dirty ? "" : undefined}
            data-pg-tab-file={f.name}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(f.id);
            }}
          >
            <button type="button" className="pg-etab-name" aria-current={f.id === active ? "true" : undefined} onClick={() => onSelect(f.id)}>
              <FileIcon />
              <span data-errors={f.errors || undefined}>{f.name}</span>
              {f.dirty && <span className="pg-sr">, {t("tabs.unsaved")}</span>}
            </button>
            <button
              type="button"
              className="pg-etab-close"
              aria-label={t("tabs.close", { name: f.name })}
              aria-keyshortcuts={f.id === active ? "Alt+W" : undefined}
              onClick={() => onClose(f.id)}
            >
              <CloseIcon size={14} />
              <span className="pg-dirty" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
