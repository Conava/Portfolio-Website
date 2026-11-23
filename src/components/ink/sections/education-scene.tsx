"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { useScene } from "@/components/shared/use-motion";
import { onFrame, onMeasure, progressFor } from "@/lib/motion/scroll-engine";
import { segment } from "@/lib/motion/piecewise";

type Col = { id: string; name: string; head: ReactNode; panel: ReactNode | null };
type Parts = { cols: HTMLElement[]; pen: SVGPathElement | null; triggers: HTMLElement[] };

/**
 * Column reveal windows (content order), then the pen, then the hold,
 * on the combined progress c = LEAD * lead-in + (1 - LEAD) * pin progress. The
 * lead-in runs while the stage scrolls up to the pin, so the first column is
 * written by the time it pins instead of the heading waiting alone.
 */
const LEAD = 0.25;
const REVEAL: [number, number][] = [
  [0, 0.25],
  [0.25, 0.55],
  [0.55, 0.8],
];
const PEN: [number, number] = [0.8, 0.95];
const READY = 0.95;

/** --ease-in-out-quart, the pen-stroke curve, mapped onto progress. */
const inOutQuart = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);

/**
 * Centres the pinned (sticky) stage, which is as tall as its content plus padding: its
 * `top` is half the spare viewport. Taller than the viewport, the padding shrinks so it
 * fits exactly. Not sticky (no pin, or `vh` 0 when the pin drops), both styles go.
 */
function fitStage(stage: HTMLElement | null, vh: number) {
  if (!stage) return;
  stage.style.removeProperty("padding-block");
  stage.style.removeProperty("top");
  if (!vh || getComputedStyle(stage).position !== "sticky") return;
  const h = stage.offsetHeight;
  if (h > vh) {
    const pad = parseFloat(getComputedStyle(stage).paddingTop) || 0;
    stage.style.paddingBlock = `${Math.max(0, pad - (h - vh) / 2)}px`;
  }
  stage.style.top = `${Math.max(0, (vh - stage.offsetHeight) / 2)}px`;
}

/**
 * The pinned education stage (heading and columns) (>= 900px, motion allowed): each column wipes in
 * left to right, then the red pen circles the GPA. "Read more" stays inert until
 * 95 %; opening a panel (or arriving on `#panel-<id>`) drops the pin for good.
 * Without the pin every style is cleared, which is the final state.
 */
export function EducationScene({ heading, schools }: { heading: ReactNode; schools: Col[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef({ off: false, dirty: false, y: NaN, snap: false, top: 0, range: 0, vh: 0, lead0: 0, parts: null as Parts | null });

  const parts = (): Parts => {
    const s = st.current;
    if (s.parts) return s.parts;
    const root = ref.current!;
    return (s.parts = {
      cols: Array.from(root.querySelectorAll<HTMLElement>(".edu-col")),
      pen: root.querySelector<SVGPathElement>(".edu-pen path"),
      triggers: Array.from(root.querySelectorAll<HTMLElement>(".dp-trigger")),
    });
  };

  // Layout reads only here (mount, resize, fonts, body size changes), never per frame.
  const measure = () => {
    const root = ref.current;
    if (!root) return;
    const s = st.current;
    s.vh = window.innerHeight;
    fitStage(root.firstElementChild as HTMLElement | null, s.vh);
    s.top = root.getBoundingClientRect().top + window.scrollY;
    s.range = root.offsetHeight - s.vh;
    // The lead-in starts when the columns' top reaches 85 % of the viewport.
    const grid = root.querySelector(".edu-grid")?.getBoundingClientRect().top ?? 0;
    const stage = root.firstElementChild?.getBoundingClientRect().top ?? 0;
    s.lead0 = Math.min(s.top + grid - stage - 0.85 * s.vh, s.top - 1);
  };

  const clear = () => {
    if (!st.current.dirty) return;
    const { cols, pen, triggers } = parts();
    for (const c of cols) c.style.removeProperty("clip-path");
    pen?.style.removeProperty("stroke-dashoffset");
    pen?.style.removeProperty("opacity");
    for (const b of triggers) b.inert = false;
    st.current.dirty = false;
  };

  const apply = (smoothed: number) => {
    const s = st.current;
    const root = ref.current;
    const scene = sceneRef.current;
    if (!root || !scene) return clear();
    if (s.off || root.hasAttribute("data-scene-disabled")) {
      scene.disable(); // no-op when already stopped
      return clear();
    }
    s.dirty = true;

    // An anchor jump of more than a viewport lands at once instead of replaying
    // the scene over the smoothing time.
    if (!s.vh) measure();
    const y = window.scrollY;
    if (Math.abs(y - s.y) > s.vh) s.snap = true;
    s.y = y;
    const raw = progressFor(y, s.top, s.range);
    if (s.snap && Math.abs(smoothed - raw) < 0.002) s.snap = false;
    const p = LEAD * segment(y, s.lead0, s.top) + (1 - LEAD) * (s.snap ? raw : smoothed);

    const { cols, pen, triggers } = parts();
    cols.forEach((c, i) => {
      const [a, b] = REVEAL[Math.min(i, REVEAL.length - 1)];
      const t = segment(p, a, b);
      // Fully revealed means no clip at all, so focus rings are not cut off.
      if (t >= 1) c.style.removeProperty("clip-path");
      else c.style.clipPath = `inset(0 ${((1 - t) * 100).toFixed(2)}% 0 0)`;
    });
    if (pen) {
      const t = inOutQuart(segment(p, ...PEN));
      pen.style.strokeDashoffset = (1 - t).toFixed(4);
      // A round cap would leave a dot at zero length.
      pen.style.opacity = t > 0 ? "1" : "0";
    }
    for (const b of triggers) b.inert = p < READY;
  };

  const sceneRef = useScene(ref, {
    minWidth: 900,
    smoothing: 0.5,
    onProgress: apply,
    onActive: (a) => ref.current?.toggleAttribute("data-active", a),
  });

  /** Drops the pin for good, keeping the pressed trigger (or the stage) where it is on screen. */
  const disable = () => {
    const root = ref.current;
    if (!root || st.current.off) return;
    st.current.off = true;
    const active = document.activeElement;
    const anchor = active && root.contains(active) ? active : root.firstElementChild!;
    const before = anchor.getBoundingClientRect().top;
    root.setAttribute("data-scene-disabled", "");
    fitStage(root.firstElementChild as HTMLElement | null, 0);
    sceneRef.current?.disable();
    clear();
    window.scrollBy({ top: anchor.getBoundingClientRect().top - before, behavior: "instant" });
  };

  useEffect(() => onMeasure(measure), []);
  // Before the pin the scene's progress sits at 0 and emits nothing: drive the lead-in here.
  useEffect(
    () =>
      onFrame((y) => {
        const s = st.current;
        const scene = sceneRef.current;
        if (scene && y < s.top && y > s.lead0 - s.vh) apply(scene.progress);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // A deep-linked panel lands on a static stage before any scene starts.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id.startsWith("panel-") && ref.current?.querySelector(`#${CSS.escape(id)}`)) {
      st.current.off = true;
      ref.current.setAttribute("data-scene-disabled", "");
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    }
  }, []);

  return (
    <div ref={ref} className="edu-scene" data-scene="education">
      <div className="edu-stage wrap">
        {heading}
        <div className="edu-grid">
          {schools.map((s) => (
            <div key={s.id} className="edu-col">
              {s.head}
              {s.panel && (
                <DetailPanel id={s.id} name={s.name} section="education" onToggle={(open) => open && disable()}>
                  {s.panel}
                </DetailPanel>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
