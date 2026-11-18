"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { STEP_OF_LINE } from "@/components/shared/bpmn/invoice-approval";
import { segment } from "@/lib/motion/piecewise";
import { onFrame, onMeasure, progressFor } from "@/lib/motion/scroll-engine";
import { useScene } from "@/components/shared/use-motion";

const MIN = 900;
const WRITE_END = 0.6;
/** Narrow screens: one beat per source line, then the final state (8 lines: 1.6 s + 0.3 s settle). */
const BEAT_MS = 200;
/**
 * Lines already written at rest (p = 0): the window approaches as an open file with its start
 * event drawn, not as an empty editor. The scroll travel writes the remaining lines.
 */
const REST = 2;
/** Room kept right of the newest mark when the diagram box pans to it. */
const PAN_PAD = 24;

type Mode = "pin" | "play" | null;

/** Pin on wide screens with motion, play once on narrow ones, final state otherwise. Live. */
function useMode(onChange: (mode: Mode) => () => void) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  useEffect(() => {
    const rm = matchMedia("(prefers-reduced-motion: reduce)");
    const wide = matchMedia(`(min-width: ${MIN}px)`);
    let teardown = () => {};
    const update = () => {
      teardown();
      teardown = cb.current(rm.matches ? null : wide.matches ? "pin" : "play");
    };
    update();
    rm.addEventListener("change", update);
    wide.addEventListener("change", update);
    return () => {
      teardown();
      rm.removeEventListener("change", update);
      wide.removeEventListener("change", update);
    };
  }, []);
}

type Els = {
  diagram: HTMLElement;
  lines: HTMLElement[];
  marks: [Element, number][];
  status: HTMLElement;
  tools: HTMLElement;
  links: HTMLElement | null;
};

/**
 * The BPMNscript scene band. At rest the first `REST` lines are written. Progress p:
 * 0-60 % writes the rest of the source one line at a time (`data-on`, the current
 * line `data-cur`) and reveals each line's diagram step (`STEP_OF_LINE`) in the
 * same write; 60-72 % the status fades in; 72-85 % the toolbar goes from .6 to 1;
 * 85-100 % the link row unclips.
 */
export function BpmnScene({
  file,
  toolbar,
  recording,
  valid,
  replay,
  source,
  diagram,
  links,
}: {
  file: string;
  toolbar: string[];
  recording: string;
  valid: string;
  replay: string;
  source: ReactNode;
  diagram: ReactNode;
  links: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const els = useRef<Els | null>(null);
  const key = useRef("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [canReplay, setCanReplay] = useState(false);

  const get = (): Els => {
    if (els.current) return els.current;
    const root = ref.current!;
    const one = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    return (els.current = {
      diagram: one(".ink-bs-diagram"),
      lines: Array.from(root.querySelectorAll<HTMLElement>(".bpmn-src .ln")),
      marks: Array.from(root.querySelectorAll(".bpmn-diagram [data-s]")).map((el) => [el, Number(el.getAttribute("data-s"))]),
      status: one(".ink-bs-status"),
      tools: one(".ink-bs-tools"),
      links: root.querySelector<HTMLElement>(".ink-bs-links"),
    });
  };

  /** Writes progress p: attribute toggles when the line changes, opacity / clip-path otherwise. */
  const apply = (p: number) => {
    if (!ref.current?.dataset.mode) return;
    const e = get();
    const r = segment(p, 0, WRITE_END);
    const count = REST + Math.ceil(r * (e.lines.length - REST));
    const cur = r < 1 ? count - 1 : -1;
    const k = `${count}:${cur}`;
    if (k !== key.current) {
      key.current = k;
      let step = 0;
      for (let i = 0; i < count; i++) step = Math.max(step, STEP_OF_LINE[i] ?? 0);
      pan(e, step);
      e.lines.forEach((l, i) => {
        l.toggleAttribute("data-on", i < count);
        l.toggleAttribute("data-cur", i === cur);
      });
      for (const [el, s] of e.marks) el.toggleAttribute("data-on", s <= step);
    }
    e.status.style.opacity = segment(p, 0.6, 0.72).toFixed(3);
    // .6 at rest: a recording's toolbar, readable but not yet in use.
    e.tools.style.opacity = (0.6 + 0.4 * segment(p, 0.72, 0.85)).toFixed(3);
    if (e.links) {
      const l = segment(p, 0.85, 1);
      e.links.style.clipPath = `inset(0 ${((1 - l) * 100).toFixed(2)}% 0 0)`;
      e.links.inert = l === 0; // no focus on a link that is not drawn yet
    }
  };

  /**
   * Keeps the newest marks (step `step`) in view where the diagram box scrolls
   * (narrow screens): pans right only, back to the start at step 0. The last
   * step is Done, so the box settles on the end. Reads layout before the
   * caller's attribute writes.
   */
  const pan = (e: Els, step: number) => {
    const box = e.diagram;
    const max = box.scrollWidth - box.clientWidth;
    if (max <= 0) return;
    let left = 0;
    if (step > 0) {
      const b = box.getBoundingClientRect();
      let right = 0;
      for (const [el, s] of e.marks) if (s === step) right = Math.max(right, el.getBoundingClientRect().right);
      left = Math.min(max, Math.max(box.scrollLeft, right - b.left + box.scrollLeft + PAN_PAD - box.clientWidth));
    }
    if (Math.abs(left - box.scrollLeft) < 1) return;
    const instant = matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ left, behavior: instant ? "instant" : "smooth" });
  };

  /** Back to the server markup (final state). */
  const reset = () => {
    const e = get();
    key.current = "";
    for (const l of e.lines) {
      l.removeAttribute("data-on");
      l.removeAttribute("data-cur");
    }
    for (const [el] of e.marks) el.removeAttribute("data-on");
    for (const el of [e.status, e.tools, e.links]) el?.removeAttribute("style");
    if (e.links) e.links.inert = false;
  };

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  /** Narrow screens: one beat per line, then status, toolbar and links together. Restartable. */
  const play = () => {
    clearTimers();
    const n = get().lines.length - REST;
    apply(0);
    for (let i = 1; i <= n; i++) {
      // Mid-bucket progress, so float rounding never skips a line.
      timers.current.push(setTimeout(() => apply((WRITE_END * (i - 0.5)) / n), (i - 1) * BEAT_MS));
    }
    timers.current.push(setTimeout(() => apply(1), n * BEAT_MS));
  };

  // useScene reports p = 1 whenever it is not pinning; only the pin mode listens to it.
  const sceneRef = useScene(ref, {
    minWidth: MIN,
    smoothing: 0.5,
    onProgress: (p) => ref.current?.dataset.mode === "pin" && apply(p),
  });

  useMode((mode) => {
    const root = ref.current!;
    if (!mode) return () => {};
    root.dataset.mode = mode;
    if (mode === "pin") {
      // Land on the real position now; the scene takes over on its first frame.
      const top = root.getBoundingClientRect().top + window.scrollY;
      apply(sceneRef.current?.progress ?? progressFor(window.scrollY, top, root.offsetHeight - window.innerHeight));
      return () => {
        delete root.dataset.mode;
        reset();
      };
    }
    apply(0);
    setCanReplay(true);
    // Plays once the window's top passes 65 % of the viewport height, so the
    // writing is under way while the diagram scrolls into view.
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return; // the initial callback also fires outside
        io.disconnect();
        play();
      },
      { rootMargin: "0px 0px -35% 0px" },
    );
    io.observe(root.querySelector(".ink-bs-win")!);
    return () => {
      io.disconnect();
      clearTimers();
      setCanReplay(false);
      delete root.dataset.mode;
      reset();
    };
  });

  return (
    <div ref={ref} data-tone="scene" data-scene="bpmnscript" className="ink-bs-band">
      <div className="wrap ink-bs-stage">
        <figure className="ink-bs-win" aria-label={file}>
          <div className="ink-bs-bar">
            <span className="ink-bs-file">{file}</span>
            {/* A recording, not a control: the toolbar is text with a disabled look. */}
            <span className="ink-bs-tools" aria-hidden="true">
              {toolbar.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </span>
          </div>
          <div className="ink-bs-body">
            <div className="ink-bs-src">{source}</div>
            <div className="ink-bs-diagram">{diagram}</div>
          </div>
          <figcaption className="ink-bs-foot">
            <span>{recording}</span>
            <span className="ink-bs-status">{valid}</span>
          </figcaption>
        </figure>
        <div className="ink-bs-after">
          {links}
          {canReplay && (
            <button type="button" className="ink-bs-replay" onClick={play}>
              {replay}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
