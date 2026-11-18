"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { STEP_OF_LINE } from "@/components/shared/bpmn/invoice-approval";
import { ReplayIcon } from "@/components/shared/icons";
import { useMotionPrefs, useScene } from "@/components/shared/use-motion";
import { segment, steps } from "@/lib/motion/piecewise";

const MIN_WIDTH = 960;
/** Clip steps per typed line (typed feel without a caret). */
const TYPE_STEPS = 24;
/** Mobile replay: diagram steps 1..8, the first at once, then 7 ticks. */
const LAST_STEP = 8;
const TICK_MS = 320;
/** Lines already typed at rest (the header and the start event's line), so the editor is never empty. */
export const FIRST = STEP_OF_LINE.indexOf(1) + 1;
/** Scene progress over which the remaining lines type in (and their shapes build). */
export const TYPE_FROM = 0.05;
export const TYPE_TO = 0.55;

/** Scene progress at which `q` lines (FIRST..n) have been typed. */
export const progressAtLines = (q: number, n: number) => TYPE_FROM + ((TYPE_TO - TYPE_FROM) * (q - FIRST)) / (n - FIRST);

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOutQuart = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const clipRight = (k: number) => `inset(0 ${(100 - k * 100).toFixed(2)}% 0 0)`;

type Labels = { source: string; xml: string; diagram: string; recording: string; replay: string; valid: string };
type Shape = { el: SVGElement; line: number; len: number };
type Els = {
  win: HTMLElement;
  src: HTMLElement;
  xml: HTMLElement;
  term: HTMLElement;
  ok: HTMLElement;
  links: HTMLElement | null;
  lines: HTMLElement[];
  shapes: Shape[];
};

/**
 * The editor window. The server markup is the final state (all source, whole diagram, the
 * XML in, the terminal line, links). Pinned (>= 960, motion allowed) the scroll progress p
 * drives it: the first lines and the start event are there at rest, 0-.15 the window settles,
 * .05-.55 the other lines type in and the diagram builds with them (the shape of the current
 * line lit with it, a token riding each new flow: trace-diagram-run.ts),
 * .55-.7 the XML slides over the source, .7-.85 the terminal line types, .85-.88 its
 * "valid BPMN 2.0 XML" status appears, .85-1 links.
 * Narrow screens replay the build once at 60 % visible (7 x 320 ms) with a Replay button.
 * Frame writes are clip-path, transform, opacity and stroke-dashoffset only, and only on change.
 */
export function BpmnScene({
  labels,
  source,
  diagram,
  xml,
  terminal,
  links,
}: {
  labels: Labels;
  source: ReactNode;
  diagram: ReactNode;
  xml: string;
  terminal: string;
  links: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const elsRef = useRef<Els | null>(null);
  const written = useRef(new WeakMap<Element, Record<string, string>>());
  const timers = useRef<number[]>([]);
  const { reduced, pinnable } = useMotionPrefs(MIN_WIDTH);
  const [mounted, setMounted] = useState(false);
  const replay = mounted && !reduced && !pinnable;

  const els = (): Els => {
    if (elsRef.current) return elsRef.current;
    const root = ref.current!;
    const one = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    return (elsRef.current = {
      win: one(".t-bpm-win"),
      src: one(".t-bpm-src"),
      xml: one(".t-bpm-xml"),
      term: one(".t-bpm-term span"),
      ok: one(".t-bpm-ok"),
      links: root.querySelector<HTMLElement>(".t-bpm-links"),
      lines: Array.from(root.querySelectorAll<HTMLElement>(".bpmn-src .ln")),
      shapes: Array.from(root.querySelectorAll<SVGElement>(".bpmn-diagram [data-s]")).map((el) => {
        // Edges carry their length (--len, user units) from InvoiceDiagram; other shapes have none.
        const len = Number(el.style.getPropertyValue("--len")) || 0;
        return { el, line: STEP_OF_LINE.indexOf(Number(el.dataset.s)), len };
      }),
    });
  };

  /** Writes a style property (or an attribute, key "@name") only when it changed. */
  const set = (el: Element, key: string, v: string) => {
    let c = written.current.get(el);
    if (!c) written.current.set(el, (c = {}));
    if (c[key] === v) return;
    c[key] = v;
    if (key[0] === "@") el.toggleAttribute(key.slice(1), v === "1");
    else (el as HTMLElement).style.setProperty(key, v);
  };

  /** Lines typed so far (q in 0..lines) and the diagram steps that belong to them. */
  const build = (q: number, cur: number) => {
    const { lines, shapes } = els();
    lines.forEach((ln, i) => {
      set(ln, "clip-path", clipRight(steps(clamp01(q - i), TYPE_STEPS) / TYPE_STEPS));
      set(ln, "@data-cur", i === cur ? "1" : "");
    });
    for (const { el, line, len } of shapes) {
      // The shape the current line compiles to is lit with it.
      set(el, "@data-cur", line === cur ? "1" : "");
      // The element arrives over the second half of its line.
      const d = segment(clamp01(q - line), 0.4, 1);
      if (len) {
        // Dashed only mid-draw: dashed strokes are slow to raster, solid or hidden ones are not.
        const drawing = d > 0 && d < 1;
        set(el, "stroke-dasharray", drawing ? `${len} ${len}` : "none");
        set(el, "stroke-dashoffset", drawing ? ((1 - d) * len).toFixed(2) : "0");
        set(el, "marker-end", d >= 1 ? "" : "none");
        set(el, "opacity", d > 0 ? "1" : "0"); // a zero-length dash still paints its round cap
      } else {
        set(el, "opacity", d.toFixed(4));
        set(el, "transform", `scale(${(0.95 + 0.05 * d).toFixed(4)})`);
      }
    }
  };

  /** Back to the stylesheet's state (the final state, static or pinned). */
  const clear = () => {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
    if (!elsRef.current) return;
    const e = elsRef.current;
    for (const el of [e.win, e.src, e.xml, e.term, e.ok, e.links, ...e.lines, ...e.shapes.map((s) => s.el)]) {
      el?.removeAttribute("style");
      el?.removeAttribute("data-cur");
    }
    ref.current?.removeAttribute("data-replay");
    written.current = new WeakMap();
  };

  const apply = (p: number) => {
    if (!sceneRef.current || !ref.current || ref.current.hasAttribute("data-scene-disabled")) return;
    const e = els();
    const q = FIRST + segment(p, TYPE_FROM, TYPE_TO) * (e.lines.length - FIRST);
    build(q, p > TYPE_FROM && q < e.lines.length ? Math.floor(q) : -1);

    const w = segment(p, 0, 0.15);
    set(e.win, "transform", `scale(${(0.95 + 0.05 * w).toFixed(4)})`);
    const x = easeInOutQuart(segment(p, 0.55, 0.7));
    set(e.xml, "transform", `translate3d(${((1 - x) * 102).toFixed(2)}%, 0, 0)`);
    set(e.src, "opacity", (1 - 0.7 * x).toFixed(3));
    set(e.term, "clip-path", clipRight(steps(segment(p, 0.7, 0.85), TYPE_STEPS) / TYPE_STEPS));
    set(e.ok, "opacity", segment(p, 0.85, 0.88).toFixed(3));
    if (e.links) set(e.links, "opacity", segment(p, 0.85, 1).toFixed(3));
  };

  /** Narrow panes scroll the diagram: pan to the step being drawn (one read per step, never per frame). */
  const follow = (step: number) => {
    const pane = ref.current?.querySelector<HTMLElement>(".t-bpm-dg");
    const node = els().shapes.find((sh) => sh.el.dataset.s === String(step) && !sh.len)?.el;
    if (!pane || !node || pane.scrollWidth <= pane.clientWidth) return;
    const r = node.getBoundingClientRect();
    const left = pane.scrollLeft + r.left + r.width / 2 - pane.getBoundingClientRect().left - pane.clientWidth / 2;
    pane.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  };

  /** Mobile replay: restartable, timer-driven, CSS transitions between the steps. */
  const play = () => {
    clear();
    const root = ref.current;
    if (!root) return;
    const n = els().lines.length;
    build(FIRST, -1);
    // Two frames so the empty state is committed before the transitions start.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        root.setAttribute("data-replay", "");
        for (let s = 1; s <= LAST_STEP; s++) {
          const q = s === LAST_STEP ? n : STEP_OF_LINE.indexOf(s) + 1;
          timers.current.push(
            window.setTimeout(() => {
              build(q, q < n ? q - 1 : -1);
              follow(s);
            }, (s - 1) * TICK_MS),
          );
        }
      }),
    );
  };

  useEffect(() => setMounted(true), []);

  // Declared before useScene so a mode change clears inline styles before a new scene writes.
  useEffect(() => {
    clear();
    if (!replay) return;
    let played = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (played) return;
        if (entry.intersectionRatio >= 0.6) {
          played = true;
          io.disconnect();
          play();
        } else if (!entry.isIntersecting) build(FIRST, -1); // at rest ahead of arrival, not in view
      },
      { threshold: [0, 0.6] },
    );
    io.observe(els().win);
    return () => {
      io.disconnect();
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  const sceneRef = useScene(ref, {
    minWidth: MIN_WIDTH,
    onProgress: apply,
    onActive: (a) => ref.current?.toggleAttribute("data-active", a),
  });

  return (
    <div ref={ref} className="t-bpm-scene" data-scene="bpmnscript">
      <div className="t-bpm-stage">
        <figure className="t-bpm-fig">
          <div className="t-bpm-win">
            <div className="t-bpm-src">
              <p className="t-bpm-tab" aria-hidden="true">
                <span>{labels.source}</span>
              </p>
              {source}
            </div>
            <div className="t-bpm-dg" role="region" aria-label={labels.diagram} tabIndex={0}>
              {diagram}
            </div>
            <div className="t-bpm-xml">
              <p className="t-bpm-tab" aria-hidden="true">
                <span>{labels.xml}</span>
              </p>
              <pre tabIndex={0} aria-label={labels.xml}>
                <code>{xml}</code>
              </pre>
            </div>
            <p className="t-bpm-term">
              <span>{terminal}</span>
              {"\n"}
              <span className="t-bpm-ok">{labels.valid}</span>
            </p>
          </div>
          <figcaption className="t-bpm-cap">
            <span>{labels.recording}</span>
            <button type="button" className="btn t-bpm-replay" hidden={!replay} onClick={play}>
              <ReplayIcon />
              {labels.replay}
            </button>
          </figcaption>
        </figure>
        <>{links}</>
      </div>
    </div>
  );
}
