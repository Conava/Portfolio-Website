"use client";

import { useEffect } from "react";
import { onMeasure } from "@/lib/motion/scroll-engine";
import { stickyShift, TRACE_MEASURED } from "./layout-signals";

/** Keys typed into these go to the field, never to station stepping. */
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * `j` / `k` jump to the next / previous section station. Scrolls the station's
 * heading to the same place an anchor link would (`--hdr` + 24 px, the
 * scroll-padding), instantly (a keyboard shortcut is never animated, A.4 C1),
 * then moves focus to the station's heading so screen readers follow.
 */
export function StationKeys() {
  useEffect(() => {
    let stops: { y: number; heading: HTMLElement }[] = [];

    const measure = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hdr")) || 0;
      // The name is the first station (the trace starts at its period): `k` from About returns there.
      const h1 = document.querySelector<HTMLElement>("h1");
      stops = [
        ...(h1 ? [{ y: 0, heading: h1 }] : []),
        ...Array.from(document.querySelectorAll<HTMLElement>('[data-station][data-kind="section"]')).map((pad) => {
          const heading = pad.closest<HTMLElement>("h2, h3") ?? pad;
          return { y: Math.min(max, Math.max(0, Math.round(heading.getBoundingClientRect().top - stickyShift(heading) + scrollY - hdr - 24))), heading };
        }),
      ];
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "j" && e.key !== "k") return;
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.target instanceof Element && e.target.closest(TYPING)) return;
      const from = scrollY;
      const stop = e.key === "j" ? stops.find((s) => s.y > from + 2) : stops.findLast((s) => s.y < from - 2);
      if (!stop) return;
      e.preventDefault();
      window.scrollTo({ top: stop.y, behavior: "instant" });
      if (!stop.heading.hasAttribute("tabindex")) stop.heading.tabIndex = -1;
      stop.heading.focus({ preventScroll: true });
    };

    measure();
    const offMeasure = onMeasure(measure);
    addEventListener(TRACE_MEASURED, measure);
    addEventListener("keydown", onKey);
    return () => {
      offMeasure();
      removeEventListener(TRACE_MEASURED, measure);
      removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
