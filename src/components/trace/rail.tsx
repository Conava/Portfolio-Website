"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { onFrame, onMeasure } from "@/lib/motion/scroll-engine";
import { piecewise } from "@/lib/motion/piecewise";
import { TRACE_MEASURED } from "./layout-signals";
import "./chrome.css";

/** The homepage's section stations in page order; ids match the section pads and `nav.*` keys. */
export const STATIONS = ["about", "work", "education", "bpmnscript", "dux", "projects", "contact"] as const;
export type Station = (typeof STATIONS)[number];

/** Sections that own a section pad, in DOM order. */
export function stationSections(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-station][data-kind="section"]'))
    .map((pad) => pad.closest("section"))
    .filter((s): s is HTMLElement => !!s);
}

/**
 * Where "current" is read: a third of the way down the viewport, not the
 * middle, so a short section reached by j/k or an anchor link (heading just
 * under the header) is the current one, and so is the last section at the page end.
 */
const LINE = 1 / 3;

/**
 * The station whose section spans the reading line (null above the first one:
 * "Start"). Past the last section it stays on the last one.
 */
export function useCurrentStation(enabled: boolean): Station | null {
  const [current, setCurrent] = useState<Station | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const sections = stationSections();
    const ids = sections.map((s) => s.id as Station);
    let cur: Station | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        // Leaving entries first, so an entering neighbor in the same batch wins.
        for (const e of entries) {
          const id = e.target.id as Station;
          // Scrolled back above this section's start: the previous station is current.
          if (!e.isIntersecting && id === cur && e.boundingClientRect.top > (e.rootBounds?.top ?? 0)) {
            cur = ids[ids.indexOf(id) - 1] ?? null;
          }
        }
        for (const e of entries) if (e.isIntersecting) cur = e.target.id as Station;
        setCurrent(cur);
      },
      { rootMargin: `-${(LINE * 100).toFixed(2)}% 0px -${(100 - LINE * 100).toFixed(2)}% 0px` },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [enabled]);
  return enabled ? current : null;
}

/**
 * Right rail at >= 1180 px (CSS hides it below): the station list, current in
 * `--fg`, plus a line that fills (`scaleY`) with the reader's position between
 * the first and last station. Offsets are cached on measure; frames only write.
 */
export function Rail() {
  const t = useTranslations("nav");
  const current = useCurrentStation(true);
  const fill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let map: (y: number) => number = () => 0;
    let last = -1;
    const measure = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      // Scroll positions where each section's top crosses the reading line, capped at the page end.
      const xs = stationSections().map((s) => Math.min(s.getBoundingClientRect().top + scrollY - innerHeight * LINE, max));
      if (xs.length < 2) return;
      map = piecewise(xs.map((x, i) => [x, i / (xs.length - 1)]));
      last = -1;
    };
    measure();
    const offMeasure = onMeasure(measure);
    // The trace layer re-measures after this (debounced) and can change the page height.
    addEventListener(TRACE_MEASURED, measure);
    const offFrame = onFrame((y) => {
      const f = Math.round(map(y) * 1000) / 1000;
      if (f !== last && fill.current) fill.current.style.transform = `scaleY(${(last = f)})`;
    });
    return () => {
      offMeasure();
      removeEventListener(TRACE_MEASURED, measure);
      offFrame();
    };
  }, []);

  return (
    <nav className="t-rail" aria-label={t("sections")}>
      <span className="t-rail-line" aria-hidden="true">
        <span ref={fill} />
      </span>
      <ol>
        {STATIONS.map((s) => (
          <li key={s}>
            <a href={`#${s}`} aria-current={s === current ? "location" : undefined}>
              {t(s)}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
