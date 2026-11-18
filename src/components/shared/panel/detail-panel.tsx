"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronIcon } from "@/components/shared/icons";
import { trackEvent } from "@/lib/analytics";
import "./panel.css";

/**
 * "Read more" disclosure that opens in place; the trigger is a secondary `.btn`.
 * Renders two siblings (trigger, region) so the parent row's grid places them. The region carries
 * `data-state="open|closed"` and, after the first open, `data-seen` (viz draw).
 *
 * Without JS the trigger is hidden and the content sits in a native
 * `<details>` inside the region. With JS the `<details>` is forced open after
 * mount and the region's `grid-template-rows` does the open/close.
 * Deep link: `#panel-<id>` opens it on load (instantly; `PANEL_HASH_SCRIPT` already opens it
 * before the first paint) and on `hashchange`; a hashchange away from it (back/forward) closes it.
 */
export function DetailPanel({
  id,
  name,
  section,
  children,
  onToggle,
  actions,
}: {
  id: string;
  name: string;
  section: string;
  children: ReactNode;
  onToggle?: (open: boolean) => void;
  /** Links shown on the trigger's line; trigger and links are then wrapped in `.dp-actions`. */
  actions?: ReactNode;
}) {
  const t = useTranslations("panel");
  const panelId = `panel-${id}`;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [instant, setInstant] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prevOpen = useRef(false);
  const onToggleRef = useRef(onToggle);
  useEffect(() => {
    onToggleRef.current = onToggle;
  });

  useEffect(() => {
    setMounted(true);
    if (location.hash === `#${panelId}`) {
      // A deep-linked panel is at rest on load, not an entrance.
      setInstant(true);
      setOpen(true);
      setSeen(true);
    }
    const onHash = (e: HashChangeEvent) => {
      if (location.hash === `#${panelId}`) {
        setOpen(true);
        setSeen(true);
      } else if (new URL(e.oldURL).hash === `#${panelId}`) {
        setOpen(false);
      }
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, [panelId]);

  useEffect(() => {
    if (!instant) return;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setInstant(false));
    });
    return () => cancelAnimationFrame(raf);
  }, [instant]);

  useEffect(() => {
    if (prevOpen.current === open) return;
    prevOpen.current = open;
    onToggleRef.current?.(open);
  }, [open]);

  function toggle(next: boolean) {
    setOpen(next);
    if (next) setSeen(true);
    trackEvent(next ? "panel_open" : "panel_close", { panel: id, section });
    const { pathname, search, hash } = location;
    if (next) history.replaceState(null, "", `${pathname}${search}#${panelId}`);
    else if (hash === `#${panelId}`) history.replaceState(null, "", `${pathname}${search}`);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape" || !open) return;
    e.stopPropagation();
    toggle(false);
    triggerRef.current?.focus();
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className="btn dp-trigger"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => toggle(!open)}
      onKeyDown={onKeyDown}
    >
      {open ? t("readLess") : t("readMore")}
      <ChevronIcon />
    </button>
  );

  return (
    <>
      {actions ? (
        <div className="btn-row dp-actions">
          {trigger}
          {actions}
        </div>
      ) : (
        trigger
      )}
      <div
        id={panelId}
        className="dp-region"
        // Collapsed, it is not a landmark (an empty region would still be listed).
        role={open ? "region" : undefined}
        aria-label={open ? t("region", { name }) : undefined}
        data-state={open ? "open" : "closed"}
        data-seen={seen ? "" : undefined}
        data-instant={instant ? "" : undefined}
        onKeyDown={onKeyDown}
        // The pre-paint hash script (panel-hash-script.ts) sets the open state's attributes first.
        suppressHydrationWarning
      >
        <div className="dp-inner">
          {/* ponytail: native fallback for no-JS; forced open once hydrated */}
          <details className="dp-details" open={mounted} suppressHydrationWarning>
            <summary className="btn dp-summary">
              {t("readMore")}
              <ChevronIcon />
            </summary>
            <div className="dp-body">{children}</div>
          </details>
        </div>
      </div>
    </>
  );
}
