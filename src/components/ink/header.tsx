"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ResumeButton } from "@/components/shared/action-link";
import { ColorModeToggle } from "@/components/shared/controls/color-mode-toggle";
import { DesignToggle } from "@/components/shared/controls/design-toggle";
import { LocaleToggle } from "@/components/shared/controls/locale-toggle";
import { CloseIcon, MenuIcon } from "@/components/shared/icons";
import { Link, usePathname } from "@/i18n/navigation";
import type { Design } from "@/lib/design-values";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/types";
import "./chrome.css";

const SECTIONS = ["about", "work", "education", "bpmnscript", "dux", "projects", "contact"] as const;

/** The section crossing the viewport's middle line (as TrackedSection measures it); home only. */
function useCurrentSection(enabled: boolean) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = e.target.id;
          if (e.isIntersecting) setCurrent(id);
          else setCurrent((c) => (c === id ? null : c));
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const id of SECTIONS) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [enabled]);
  return enabled ? current : null;
}

function NavLinks({ current, onNavigate }: { current: string | null; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  return (
    <>
      {SECTIONS.map((id) => (
        <Link
          key={id}
          href={`/#${id}`}
          data-id={id}
          aria-current={current === id ? "location" : undefined}
          onClick={onNavigate}
        >
          {t(id)}
        </Link>
      ))}
    </>
  );
}

/**
 * The sliding 2px indicator under the current nav item. Link boxes are measured
 * on layout events only (mount, resize, font load); moving it is a transform.
 */
function useIndicator(nav: React.RefObject<HTMLElement | null>, current: string | null) {
  const bar = useRef<HTMLSpanElement>(null);
  const boxes = useRef(new Map<string, [number, number]>());
  const currentRef = useRef(current);

  const place = (snap: boolean) => {
    const el = bar.current;
    const box = currentRef.current ? boxes.current.get(currentRef.current) : undefined;
    if (!el) return;
    if (!box) {
      delete el.dataset.on;
      return;
    }
    // Appearing (or re-measuring) jumps into place; only a change of section slides.
    if (snap || el.dataset.on === undefined) el.style.transition = "none";
    el.style.transform = `translateX(${box[0]}px) scaleX(${box[1]})`;
    el.dataset.on = "";
    if (el.style.transition) {
      void getComputedStyle(el).transform; // commit the jump before transitions return
      el.style.transition = "";
    }
  };

  useLayoutEffect(() => {
    const root = nav.current;
    if (!root) return;
    const measure = () => {
      boxes.current = new Map(
        [...root.querySelectorAll<HTMLElement>("[data-id]")].map((a) => [a.dataset.id!, [a.offsetLeft, a.offsetWidth]]),
      );
      place(true);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    currentRef.current = current;
    place(false);
  }, [current]);

  return bar;
}

/**
 * Ink header: the name, the section nav with its sliding indicator, then (right
 * to left) design, color mode and EN/DE. When the nav does not fit, a menu
 * button opens an in-place sheet with the nav, locale and design switch.
 */
export function InkHeader({ locale, design }: { locale: Locale; design: Design }) {
  const t = useTranslations("nav");
  const current = useCurrentSection(usePathname() === "/");
  const nav = useRef<HTMLElement>(null);
  const bar = useIndicator(nav, current);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="ink-hdr">
      <div className="wrap ink-hdr-row">
        <Link href="/" className="ink-hdr-name">
          {siteConfig.name}
        </Link>
        <nav ref={nav} className="ink-nav" aria-label={t("sections")}>
          <NavLinks current={current} />
          <span ref={bar} className="ink-nav-bar" aria-hidden="true" />
        </nav>
        <div className="ink-utils">
          <ResumeButton />
          <span className="ink-utils-locale">
            <LocaleToggle current={locale} />
          </span>
          <ColorModeToggle />
          <DesignToggle current={design} variant="icon" via="header" />
          <button
            ref={button}
            type="button"
            className="icon-btn ink-menu-btn"
            aria-expanded={open}
            aria-controls="ink-menu"
            aria-label={open ? t("closeMenu") : t("menu")}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
      <div id="ink-menu" className="ink-menu" data-open={open || undefined} inert={!open}>
        <nav className="wrap ink-menu-nav" aria-label={t("sections")}>
          <NavLinks current={current} onNavigate={() => setOpen(false)} />
        </nav>
        <div className="wrap ink-menu-utils">
          <LocaleToggle current={locale} />
          <DesignToggle current={design} variant="text" via="menu" />
        </div>
      </div>
    </header>
  );
}
