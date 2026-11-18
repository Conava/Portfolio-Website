"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronIcon } from "@/components/shared/icons";
import type { Preset } from "@/lib/playground/presets";
import "./shell.css";

/**
 * Menu button behavior (WAI-ARIA menu button): opening focuses the first item
 * (ArrowUp on the button: the last), arrows/Home/End move, Esc closes and
 * returns focus, Tab or a click outside closes.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pending = useRef(0);
  const id = useId();
  const items = () => [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];

  useEffect(() => {
    if (!open) return;
    items().at(pending.current)?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const show = (at: number) => {
    pending.current = at;
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return {
    open,
    close,
    rootProps: {
      ref: root,
      onBlur: (e: React.FocusEvent) => {
        if (e.relatedTarget && !root.current?.contains(e.relatedTarget)) setOpen(false);
      },
    },
    buttonProps: {
      ref: button,
      type: "button" as const,
      "aria-haspopup": "menu" as const,
      "aria-expanded": open,
      "aria-controls": id,
      onClick: () => (open ? setOpen(false) : show(0)),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        show(e.key === "ArrowDown" ? 0 : -1);
      },
    },
    menuProps: {
      id,
      role: "menu",
      "data-open": open ? "" : undefined,
      // Closed: out of the tab order and the accessibility tree while it fades.
      inert: !open,
      onKeyDown: (e: KeyboardEvent) => {
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLElement);
        const to =
          e.key === "ArrowDown" ? (i + 1) % list.length
          : e.key === "ArrowUp" ? (i - 1 + list.length) % list.length
          : e.key === "Home" ? 0
          : e.key === "End" ? list.length - 1
          : null;
        if (to !== null) {
          e.preventDefault();
          list[to]?.focus();
        } else if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      },
    },
  };
}

/** One menu entry: label, optional second line. */
export function MenuItem({
  label,
  hint,
  disabled,
  onSelect,
  ...data
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
} & Record<`data-${string}`, string>) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className="pg-mi"
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onSelect()}
      {...data}
    >
      <span>{label}</span>
      {hint && <span className="pg-mi-hint">{hint}</span>}
    </button>
  );
}

/** The menu button's face: icon, label (icon-only between 640 and 900 px), chevron. */
export function MenuFace({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <>
      {icon}
      <span className="pg-btn-label">{label}</span>
      <ChevronIcon className="pg-chev" />
    </>
  );
}

const ExamplesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4 2.5h5.5L12 5v8.5H4z" />
    <path d="M9.5 2.5V5H12M6 8.5h4M6 11h4" />
  </svg>
);

/** Examples (source presets) and BPMN files to import, as two menu groups. */
export function PresetMenu({
  presets,
  onPreset,
}: {
  presets: readonly Preset[];
  onPreset: (preset: Preset) => void;
}) {
  const t = useTranslations("playground.presets");
  const m = useMenu();
  const label = t("label");
  const group = (kind: Preset["kind"], heading: string) => (
    <div role="group" aria-label={heading} className="pg-mg">
      <div className="pg-mg-head" aria-hidden="true">
        {heading}
      </div>
      {presets
        .filter((p) => p.kind === kind)
        .map((p) => (
          <MenuItem
            key={p.id}
            data-pg-preset={p.id}
            label={t(`labels.${p.id}`)}
            hint={t.has(`hints.${p.id}`) ? t(`hints.${p.id}`) : undefined}
            onSelect={() => {
              m.close();
              onPreset(p);
            }}
          />
        ))}
    </div>
  );

  return (
    <div className="pg-menu-root" {...m.rootProps}>
      <button className="pg-btn" aria-label={label} data-tip={label} data-tip-align="start" {...m.buttonProps}>
        <MenuFace icon={<ExamplesIcon />} label={label} />
      </button>
      <div className="pg-menu" data-align="start" {...m.menuProps}>
        {group("source", t("groupSource"))}
        {group("bpmn", t("groupBpmn"))}
      </div>
    </div>
  );
}
