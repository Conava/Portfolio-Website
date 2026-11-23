"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Pad } from "@/components/trace/pad";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { useMotionPrefs, useScene } from "@/components/shared/use-motion";
import { segment } from "@/lib/motion/piecewise";
import { progressFor } from "@/lib/motion/scroll-engine";

export interface EduColumn {
  id: string;
  name: string;
  status: string;
  body: ReactNode;
  panel: ReactNode | null;
}

/**
 * Reveal windows per column, in content order (design system 4.6). The first school is
 * there at p = 0, so the resting frame of the stage is never empty; each later one reveals
 * once the trace reaches its gutter pad (education.css places the pads at these starts).
 */
const WINDOWS: [number, number][] = [
  [0, 0],
  [0.25, 0.5],
  [0.7, 0.95],
];
/** The note of the school the exchange ran inside, after the second column's reveal. */
const NOTE: [number, number] = [0.5, 0.7];
/** Panel triggers wake up here; the rest of the travel is the hold. */
const HOLD = 0.95;
/** Scroll target per station: the end of that column's reveal. */
const STATION_P = WINDOWS.map(([, to]) => (to === WINDOWS[WINDOWS.length - 1][1] ? 1 : to));

/** Dead zone at each window start, so the smoothing tail never leaves a sliver or a lit pad at p ~ 0. */
const EPS = 0.005;

type Els = { cols: HTMLElement[]; pads: HTMLElement[]; dots: HTMLElement[]; more: HTMLElement[]; note: HTMLElement | null };

/**
 * The pinned education stage (desktop >= 960, motion allowed): schools reveal
 * left to right as the trace reaches them, each entry pad gets `data-scene-lit`
 * while the scene drives it (the trace layer reads it for the lane segment),
 * and panel triggers stay `inert` until the hold. Opening a panel, focusing
 * inside the stage or landing on a deep link drops the pin and shows the
 * final state. Static everywhere else (server markup is the final state).
 */
export function EducationStage({ columns, head }: { columns: EduColumn[]; head: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const elsRef = useRef<Els | null>(null);
  const killed = useRef(false);
  const { pinnable } = useMotionPrefs(960);

  const els = (): Els => {
    if (elsRef.current) return elsRef.current;
    const root = ref.current!;
    const all = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    return (elsRef.current = {
      cols: all(".t-edu-col"),
      pads: Array.from(root.parentElement!.querySelectorAll<HTMLElement>(".t-edu-gpad > .pad")),
      dots: all(".t-edu-dot"),
      more: all(".t-edu-more"),
      note: root.querySelector<HTMLElement>(".t-edu-merge-note"),
    });
  };

  /** Last written value per element and property: frames write only what changed. */
  const written = useRef(new Map<string, string | boolean>());
  const write = (key: string, value: string | boolean, set: () => void) => {
    if (written.current.get(key) === value) return;
    written.current.set(key, value);
    set();
  };

  /** Writes the reveal (`--reveal`, read by a transformed cover), inert and the lit flags only. */
  const apply = (p: number) => {
    if (!ref.current) return;
    const e = els();
    const live = !!sceneRef.current || killed.current;
    if (!live) {
      // Static: no scene state at all; the trace layer owns the pads.
      for (const el of [...e.cols, e.note]) el?.style.removeProperty("--reveal");
      e.pads.forEach((pad) => pad.removeAttribute("data-scene-lit"));
      e.dots.forEach((d) => d.removeAttribute("data-scene-lit"));
      e.more.forEach((m) => (m.inert = false));
      written.current.clear();
      return;
    }
    // Unset means revealed (the stylesheet's default).
    const clipTo = (key: string, el: HTMLElement, t: number) => {
      const v = t >= 1 ? "" : t.toFixed(4);
      write(key, v, () => (v ? el.style.setProperty("--reveal", v) : el.style.removeProperty("--reveal")));
    };
    e.cols.forEach((c, i) => {
      const [from, to] = WINDOWS[i] ?? [0, 0];
      clipTo(`c${i}`, c, to <= from ? 1 : segment(p, from + EPS, to));
      const lit = p > from + EPS || p === 1;
      const pad = e.pads[i];
      const dot = e.dots[i];
      if (pad)
        write(`p${i}`, lit, () => {
          pad.toggleAttribute("data-scene-lit", lit);
          dot?.toggleAttribute("data-scene-lit", lit);
        });
    });
    if (e.note) clipTo("note", e.note, segment(p, NOTE[0] + EPS, NOTE[1]));
    const inert = p < HOLD;
    write("inert", inert, () => e.more.forEach((m) => (m.inert = inert)));
    if (killed.current && sceneRef.current && !ref.current.hasAttribute("data-scene-disabled")) sceneRef.current.disable();
  };

  const sceneRef = useScene(ref, {
    minWidth: 960,
    smoothing: 0.5,
    onProgress: apply,
    onActive: (a) => ref.current?.toggleAttribute("data-active", a),
  });

  /** Drops the pin, keeping the stage where it is on screen. */
  const kill = () => {
    killed.current = true;
    const scene = sceneRef.current;
    if (!scene || ref.current?.hasAttribute("data-scene-disabled")) return apply(1);
    const [col] = els().cols;
    const before = col.getBoundingClientRect().top;
    scene.disable();
    const delta = col.getBoundingClientRect().top - before;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
  };

  // A column dot only marks its gutter pad: lit once the trace has passed that pad.
  useEffect(() => {
    const { pads, dots } = els();
    const sync = () => pads.forEach((p, i) => dots[i]?.toggleAttribute("data-passed", p.hasAttribute("data-passed")));
    const mo = new MutationObserver(sync);
    pads.forEach((p) => mo.observe(p, { attributeFilter: ["data-passed"] }));
    sync();
    return () => mo.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Station jumps (pad click, #sdsu): land where that school is revealed, not at p = 0.
  useEffect(() => {
    if (!pinnable) return;
    const jump = () => {
      const i = columns.findIndex((c) => `#${c.id}` === location.hash);
      const el = ref.current;
      if (i < 0 || !el || !sceneRef.current || el.hasAttribute("data-scene-disabled")) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const range = el.offsetHeight - window.innerHeight;
      if (range <= 0) return;
      const y = top + STATION_P[i] * range;
      if (Math.abs(progressFor(window.scrollY, top, range) - STATION_P[i]) > 0.01)
        window.scrollTo({ top: y, behavior: "instant" });
    };
    const raf = requestAnimationFrame(jump);
    addEventListener("hashchange", jump);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("hashchange", jump);
    };
  }, [pinnable, columns, sceneRef]);

  return (
    <div className="t-edu-wrap">
      <div
        ref={ref}
        className="t-edu-scene"
        data-scene="education"
        // Keyboard path: focus inside a half-revealed stage shows the final state. The heading is
        // not part of the stage: station keys focus it, and that must keep the pin.
        onFocus={(e) => {
          if ((e.target as Element).closest(".t-edu-head")) return;
          if (sceneRef.current && sceneRef.current.progress < HOLD) kill();
        }}
      >
        {/* The pin holds the title, the intro and the columns: the pinned frame is always a titled scene. */}
        <div className="t-edu-pin">
          <div className="t-edu-head">{head}</div>
          <div className="t-edu-stage">
          {columns.map((c) => (
            <div key={c.id} id={c.id} className="t-edu-col" data-status={c.status}>
              <div className="t-edu-body">{c.body}</div>
              {c.panel && (
                <div className="t-edu-more">
                  <DetailPanel id={c.id} name={c.name} section="education" onToggle={(open) => open && kill()}>
                    {c.panel}
                  </DetailPanel>
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      </div>
      {/* Side by side (>= 960) the schools' stations live in the gutter, one per school, spread
          down the scene (education.css); the dots on the column rules only mark them. Outside the
          scene's stacking context, so they sit on the trace like every other pad. */}
      {columns.map((c, i) => (
        <span key={c.id} className="t-edu-gpad" data-status={c.status} style={{ "--i": i, "--p": WINDOWS[i]?.[0] ?? 0 } as CSSProperties}>
          <Pad station={c.id} label={c.name} kind="entry" entryId={c.id} />
        </span>
      ))}
    </div>
  );
}
