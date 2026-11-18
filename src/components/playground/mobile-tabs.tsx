"use client";

import type { KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import "./shell.css";

export type PaneTab = "source" | "diagram" | "xml";

/** Tablist arrows (with wrap), Home and End: focus and activate the target tab. */
export function tabKeys(e: KeyboardEvent<HTMLElement>) {
  const list = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=tab]")];
  const i = list.indexOf(document.activeElement as HTMLElement);
  const to =
    e.key === "ArrowRight" ? (i + 1) % list.length
    : e.key === "ArrowLeft" ? (i - 1 + list.length) % list.length
    : e.key === "Home" ? 0
    : e.key === "End" ? list.length - 1
    : null;
  if (to === null || i < 0) return;
  e.preventDefault();
  list[to].focus();
  list[to].click();
}

/** Unique per tablist: the phone and pane lists both have Diagram and XML tabs. */
export const tabId = (variant: "phone" | "pane", k: PaneTab) => `pg-tab-${variant}-${k}`;

/**
 * `phone`: Source / Diagram / XML, shown below 900 px. `pane`: Diagram / XML
 * above the right pane, shown from 900 px. `panelIds` wires `aria-controls`.
 */
export function MobileTabs({
  active,
  onChange,
  variant = "phone",
  panelIds,
}: {
  active: PaneTab;
  onChange: (tab: PaneTab) => void;
  variant?: "phone" | "pane";
  panelIds?: Partial<Record<PaneTab, string>>;
}) {
  const t = useTranslations("playground.tabs");
  const tabs: PaneTab[] = variant === "phone" ? ["source", "diagram", "xml"] : ["diagram", "xml"];

  return (
    <div role="tablist" className="pg-tabs" data-variant={variant} onKeyDown={tabKeys}>
      {tabs.map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          id={tabId(variant, k)}
          data-pg-tab={k}
          aria-selected={active === k}
          aria-controls={panelIds?.[k]}
          tabIndex={active === k ? 0 : -1}
          className="pg-tab"
          onClick={() => onChange(k)}
        >
          {t(k)}
        </button>
      ))}
    </div>
  );
}
