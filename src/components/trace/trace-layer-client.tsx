"use client";

import { useEffect, useRef } from "react";
import { onFrame, onMeasure } from "@/lib/motion/scroll-engine";
import { piecewise } from "@/lib/motion/piecewise";
import "./trace.css";
import { stickyShift, TRACE_MEASURED } from "./layout-signals";
import { mountDiagramRun } from "./trace-diagram-run";
import {
  buildPaths,
  isPassed,
  lengthAtY,
  lengthKnots,
  pinnedPoints,
  pointAt,
  progressPoints,
  scrollStops,
  type Lane,
  type Part,
  type Segment,
  type StationPoint,
} from "./trace-geometry";
import { isPinned, mountTasks } from "./trace-tasks";

const NS = "http://www.w3.org/2000/svg";
const DELAY = 0.25; // s, load draw-in
const DRAW = 1.1; // s, load draw-in and period-click redraw
const FADE = 0.2; // s, head fade when the redraw's run reaches the end
const LINE = 0.4; // stations light as they pass 40 % of the viewport
// Through a pinned scene the lit tip runs from the 40 % line down to here (education.css matches it).
const PIN_END = 0.85;
const HEAD = 4.5; // head radius, px
// The shared Player scene's screenshot is full-bleed until its shrink is nearly done (it ends at
// 30 % of the travel): the trace and the rail step aside until then.
const PLAYER_COVER = 0.3;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
// ponytail: quartic in-out stands in for cubic-bezier(.76,0,.24,1) (--ease-in-out-quart); same shape, no solver.
const easeInOutQuart = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
// Not in TypeScript's DOM lib yet.
type ScrollTimelineCtor = new (o: { source: Element; axis: "block" }) => AnimationTimeline;

/**
 * Draws the trace. The base paths (main + lanes, `--line-3`) are one static SVG. Lighting
 * never repaints that page-tall layer: the long straight spine and the lanes beside it are
 * lit by a composited reveal (an `overflow: hidden` box and its content counter-translated),
 * only the two short pieces (period -> spine, spine -> ring) animate `stroke-dashoffset`,
 * and the head is a composited div on the lit tip. Each entry is a task box the line runs
 * round (trace-tasks.ts); a lane's token splits off at its fork and rejoins at its join.
 *
 * Where ScrollTimeline exists, all of that runs as scroll-driven animations (keyframes built
 * at measure time), so the compositor moves it in the same frame as the page. Written from a
 * scroll handler it lands a frame after the compositor has scrolled, and the tip shook by one
 * frame's scroll distance. JS still paints the intro, the period-click replay and browsers
 * without ScrollTimeline, and toggles the discrete states (passed pads, cover, arrival).
 * Geometry is measured only through the scroll engine's measure hook (load, resize,
 * fonts.ready, body size), debounced 150 ms.
 */
export function TraceLayerClient({
  lanes,
  tips,
  spans,
}: {
  lanes: Record<string, number>;
  tips: Record<string, string>;
  /** How long each ended entry ran, shown beside its check. */
  spans: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const rm = matchMedia("(prefers-reduced-motion: reduce)");
    const wide = matchMedia("(min-width: 760px)");
    const data = { laneOf: lanes, tips, spans };
    let stop = mountTrace(root, data, rm.matches, wide.matches, true);
    const remount = () => {
      stop();
      stop = mountTrace(root, data, rm.matches, wide.matches, false);
    };
    rm.addEventListener("change", remount);
    wide.addEventListener("change", remount);
    return () => {
      rm.removeEventListener("change", remount);
      wide.removeEventListener("change", remount);
      stop();
    };
  }, [lanes, tips, spans]);

  return (
    <div ref={ref} className="trace" aria-hidden="true">
      <svg className="trace-base" width="0" height="0" />
      <svg className="trace-lit trace-lead" width="0" height="0" />
      <svg className="trace-lit trace-tail" width="0" height="0" />
      {/* Lanes a scene lights in full (education); scroll-lit lanes are in the reveal. */}
      <div className="trace-lanes" />
      {/* Composited layers last: nothing painted above them needs its own layer. */}
      <div className="trace-reveal">
        <div>
          <svg className="trace-lit trace-body" width="0" height="0" />
        </div>
      </div>
      <div className="trace-tokens" />
      <div className="trace-head" data-hidden="" />
    </div>
  );
}

const GW = 6; // gateway half-diagonal, px

/** A parallel gateway: a diamond centred on (x, y) and its plus. */
function gateway(x: number, y: number): [string, string] {
  const h = GW;
  const p = h * 0.45;
  return [
    `M${x} ${y - h}L${x + h} ${y}L${x} ${y + h}L${x - h} ${y}Z`,
    `M${x - p} ${y}L${x + p} ${y}M${x} ${y - p}L${x} ${y + p}`,
  ];
}

function path(d: string, attrs: Record<string, string> = {}) {
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", d);
  for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
  return p;
}

/** Scroll ranges in which a scene holds its stage still. Measure-time only. */
function pinnedScenes(vh: number) {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-scene]")).flatMap((sc) => {
    if (!isPinned(sc)) return [];
    const from = sc.getBoundingClientRect().top + window.scrollY;
    const to = from + sc.offsetHeight - vh;
    return to > from ? [{ from, to }] : [];
  });
}

/** Whether `el` sits on a sticky (pinned) stage inside `scene`. Measure-time only. */
function isSticky(el: Element, scene: Element) {
  for (let n = el.parentElement; n && n !== scene; n = n.parentElement) if (getComputedStyle(n).position === "sticky") return true;
  return false;
}

/** Sizes `svg` to the bounding box of `segs` (quarter arcs stay inside their endpoints' box). */
function fit(svg: SVGSVGElement, segs: Segment[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of segs) {
    xs.push(s.x1, s.kind === "line" ? s.x0 : s.cx + s.r * Math.cos(s.a0));
    ys.push(s.y1, s.kind === "line" ? s.y0 : s.cy + s.r * Math.sin(s.a0));
  }
  if (!xs.length) return svg.setAttribute("width", "0");
  const x = Math.min(...xs) - 2;
  const y = Math.min(...ys) - 2;
  const w = Math.max(...xs) + 2 - x;
  const h = Math.max(...ys) + 2 - y;
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  svg.style.left = `${x}px`;
  svg.style.top = `${y}px`;
}

/** Makes `parent` hold one `<path>` per entry of `ds`, rewriting `d` in place when the count matches. */
function syncPaths(parent: Element, ds: string[], attrs: Record<string, string> = {}) {
  if (parent.childElementCount !== ds.length) return parent.replaceChildren(...ds.map((d) => path(d, attrs)));
  ds.forEach((d, i) => {
    if (parent.children[i].getAttribute("d") !== d) parent.children[i].setAttribute("d", d);
  });
}

function mountTrace(
  root: HTMLDivElement,
  { laneOf, tips, spans }: { laneOf: Record<string, number>; tips: Record<string, string>; spans: Record<string, string> },
  reduced: boolean,
  wide: boolean,
  animateIn: boolean,
): () => void {
  const $ = <T extends Element>(s: string) => root.querySelector<T>(s)!;
  const tokensBox = $<HTMLDivElement>(".trace-tokens");
  const base = $<SVGSVGElement>(".trace-base");
  const leadSvg = $<SVGSVGElement>(".trace-lead");
  const tailSvg = $<SVGSVGElement>(".trace-tail");
  const body = $<SVGSVGElement>(".trace-body");
  const reveal = $<HTMLDivElement>(".trace-reveal");
  const revealIn = reveal.firstElementChild as HTMLDivElement;
  const head = $<HTMLDivElement>(".trace-head");
  const lanesBox = $<HTMLDivElement>(".trace-lanes");
  const rail = document.querySelector<HTMLElement>(".t-rail");
  const tasks = mountTasks(root, reduced, spans);
  const diagram = mountDiagramRun();
  // The terminus (and the email underline beside it) waits for the lit line: armed here, so
  // without this layer (no JS) or under reduced motion it simply shows.
  const endEl = document.querySelector<HTMLElement>("[data-trace-end]");
  let arrived = !!endEl?.hasAttribute("data-arrived");
  if (endEl && !reduced && !arrived) endEl.setAttribute("data-armed", "");
  const arrive = (L: number) => {
    if (arrived || !endEl || L < total - 1) return;
    arrived = true; // once: a period-click redraw does not take it back
    endEl.setAttribute("data-arrived", "");
  };

  // The ring stays filled once the address was copied this visit (CopyEmail's data-copied lasts 1.6 s).
  const filler = new MutationObserver(() => {
    if (document.querySelector("[data-copied]")) endEl?.setAttribute("data-filled", "");
  });
  const contact = endEl?.closest("section");
  if (contact) filler.observe(contact, { subtree: true, attributeFilter: ["data-copied"] });

  for (const pad of document.querySelectorAll<HTMLElement>(".pad[data-entry]")) {
    const id = pad.dataset.entry!;
    const k = laneOf[id] ?? 0;
    pad.style.setProperty("--lane", String(k));
    if (k && tips[id]) pad.dataset.tip = tips[id];
  }

  // ---- written by measure, read by frame ----
  let segs: Segment[] = [];
  let total = 0;
  let floor = 0;
  let H = 0;
  let lead: Part = { d: "", length: 0, segments: [] };
  let tail: Part = lead;
  let spine = { top: 0, length: 0 };
  let map: (y: number) => number = () => 0;
  let stops: [number, number][] = [];
  let pads: { el: HTMLElement; len: number; passed: boolean }[] = [];
  let leadPath: SVGPathElement | null = null;
  let tailPath: SVGPathElement | null = null;
  let lanes: { svg: SVGSVGElement; entries: string[] }[] = [];
  let shown = NaN;
  let key = ""; // inputs of the last measure; an identical re-measure changes nothing
  let leadShown = "";
  let tailShown = "";
  let laneGeo: Lane[] = [];

  // ---- animation state ----
  let intro = animateIn ? 0 : Infinity; // seconds since mount
  let replay = -1; // seconds since the period click, -1 = idle
  const ScrollTL = (window as unknown as { ScrollTimeline?: ScrollTimelineCtor }).ScrollTimeline;
  let linked: Animation[] = []; // running scroll-driven animations
  let linkWanted = false; // link() was asked for, even if it could not link yet (no scroll range)
  let headHidden = true;
  let headEnd = false;
  // While the token runs the BPMNscript diagram, the gutter head steps aside: one token at a time.
  let diagramWin: { from: number; to: number } | null = null;
  let headAway = false;
  // Scroll range of the Player's full-bleed state; the fixed rail leaves earlier (`railFrom`).
  let cover: { from: number; railFrom: number; to: number } | null = null;
  let covered = false;
  let railCovered = false;
  let clipped = false;

  const clear = () => {
    unlink();
    for (const s of [base, leadSvg, tailSvg, body, lanesBox, tokensBox]) s.replaceChildren();
    lanes = [];
    segs = [];
    key = "";
  };

  const measureCover = () => {
    const scene = document.querySelector<HTMLElement>('[data-scene="player"]');
    const stage = scene?.querySelector(".pscene-stage");
    if (!scene || !stage || getComputedStyle(stage).position !== "sticky") return (cover = null);
    const top = scene.getBoundingClientRect().top + window.scrollY;
    const hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hdr")) || 0;
    // From the pin (the stage reaching the header) until the shrink has cleared the chrome. On the
    // approach the layer is clipped at the scene's top (trace.css), so the line runs into the
    // screenshot. A clip, not a z-index on the stage: stacking the full-bleed stage above the
    // trace's composited layers cost a 67 ms frame there.
    root.style.setProperty("--clip-y", `${(scene.getBoundingClientRect().top - root.getBoundingClientRect().top).toFixed(1)}px`);
    // The rail is fixed: it steps aside as soon as the incoming screenshot reaches its bottom edge.
    const railBottom = rail && rail.getClientRects().length ? rail.getBoundingClientRect().bottom : hdr;
    cover = { from: top - hdr, railFrom: top - railBottom, to: top + PLAYER_COVER * (scene.offsetHeight - window.innerHeight) };
  };

  const measure = () => {
    measureCover();
    // Measured against the layer's unsnapped position (the snap below is a translate).
    const r0 = root.getBoundingClientRect();
    const sr = { left: r0.left - (parseFloat(root.style.translate) || 0), top: r0.top };
    const rel = (r: DOMRect) => ({ x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top });
    const originEl = document.querySelector("[data-trace-origin]");
    const padEls = Array.from(document.querySelectorAll<HTMLElement>(".pad[data-station]")).filter((el) => el.getClientRects().length);
    if (!originEl || !padEls.length) return clear();
    // The line leaves the period's bottom edge and turns toward the gutter 36px lower.
    const or = originEl.getBoundingClientRect();
    const origin = { x: or.left + or.width / 2 - sr.left, y: or.bottom - sr.top };
    const bus = origin.y + 36;
    // Pads of a scene that sit side by side (one row of columns, or a sticky stage whose y
    // depends on the scroll position) are spread evenly over the scene's height instead, so the
    // trace reaches each one in turn and a lane between them has length. Stacked pads (narrow
    // screens) measure normally.
    const byScene = new Map<HTMLElement, HTMLElement[]>();
    for (const el of padEls) {
      const scene = el.closest<HTMLElement>("[data-scene]");
      // A section pad inside a stage (education's heading) is measured at its resting spot, not spread.
      if (scene && el.dataset.kind === "entry") byScene.set(scene, [...(byScene.get(scene) ?? []), el]);
    }
    const spreadY = new Map<HTMLElement, number>();
    for (const [scene, els] of byScene) {
      const ys = els.map((el) => el.getBoundingClientRect().top);
      const row = els.length > 1 && Math.max(...ys) - Math.min(...ys) < 2;
      if (!row && !isSticky(els[0], scene)) continue;
      const r = scene.getBoundingClientRect();
      els.forEach((el, i) => spreadY.set(el, r.top - sr.top + ((i + 1) / (els.length + 1)) * r.height));
    }
    const points: StationPoint[] = padEls.map((el) => {
      const c = rel(el.getBoundingClientRect());
      return {
        id: el.dataset.station!,
        x: c.x,
        y: spreadY.get(el) ?? c.y - stickyShift(el),
        lane: wide && el.dataset.entry ? (laneOf[el.dataset.entry] ?? 0) : 0,
        kind: el.dataset.kind === "entry" ? "entry" : "section",
      };
    });
    const endEl = document.querySelector("[data-trace-end]");
    const er = endEl?.getBoundingClientRect();
    const last = points[points.length - 1];
    const end = er ? { x: er.left - sr.left, y: er.top + er.height / 2 - sr.top } : { x: points[0].x, y: last.y };
    const laneOffset = wide ? parseFloat(getComputedStyle(root).getPropertyValue("--la")) || -18 : 0;
    // The 1.25px unlit strokes centred on a whole pixel smear over two half-lit columns (spine
    // read 1.36:1). Shift the layer so the spine (and the lanes, whole pixels beside it) centres
    // on a pixel; pads move by under half a pixel against it, which does not show.
    // ponytail: 1x screens only; at 2x+ the strokes already cover whole device pixels.
    const spineX = sr.left + (points.find((p) => !p.lane) ?? points[0]).x;
    const snap = devicePixelRatio === 1 ? 0.5 - (spineX - Math.floor(spineX)) : 0;
    root.style.translate = Math.abs(snap) > 0.01 ? `${snap.toFixed(3)}px` : "";

    const docTop = sr.top + window.scrollY;
    const vh = window.innerHeight;
    // The layer's own (possibly stale) height counts toward scrollHeight: after the page got
    // shorter (a scene's pin dropped) it would keep the old page end. Read it without the layer.
    // Only when the layer reaches the page end (hiding it re-rasters its layers, so not by default).
    let docH = document.documentElement.scrollHeight;
    if (docTop + H >= docH - 1) {
      root.style.display = "none";
      docH = document.documentElement.scrollHeight;
      root.style.removeProperty("display");
    }
    const maxScroll = docH - vh;
    // The pad count and the first/last ids are part of the key: a different set of pads at the same
    // geometry must still redraw.
    const nums = [docTop, vh, maxScroll, laneOffset, origin.x, origin.y, end.x, end.y, ...points.flatMap((p) => [p.x, p.y, p.lane])];
    const k = [padEls.length, points[0].id, last.id, ...nums.map((n) => Math.round(n * 2))].join();
    if (k === key) return;
    key = k;
    // The layer's height counts toward the page height: tell readers (rail, station keys) to re-read it.
    queueMicrotask(() => window.dispatchEvent(new Event(TRACE_MEASURED)));

    const g = buildPaths(points, { origin, end, bus, laneOffset, radius: 8 });
    const W = Math.ceil(Math.max(origin.x, end.x, ...points.map((p) => p.x)) + 12);
    H = Math.ceil(Math.max(end.y, last.y) + 12);
    root.style.width = `${W}px`;
    root.style.height = `${H}px`;
    for (const s of [base, body]) {
      s.setAttribute("width", String(W));
      s.setAttribute("height", String(H));
    }
    // A parallel gateway on the parent line just above each fork and just below each join.
    const gws = g.lanes.flatMap((l) => [...gateway(l.fork.x, l.fork.y - GW - 1), ...gateway(l.join.x, l.join.y + GW + 1)]);
    const nPaths = 1 + g.lanes.length;
    // The task boxes' group (trace-tasks.ts) is appended after this, so the counts never match
    // and the paths are rewritten on every new geometry.
    syncPaths(base, [g.main, ...g.lanes.map((l) => l.d), ...gws]);
    markGateways(base, nPaths);
    laneGeo = g.lanes;

    const ys = [origin.y, ...points.map((p) => p.y), end.y].map((y) => y + docTop);
    // Main-path length at a document y on the spine.
    const along = (y: number) => g.lead.length + Math.min(Math.max(y - docTop - g.spine.top, 0), g.spine.length);
    // While a scene is pinned the lit tip runs down the held screen, from the 40 % line to PIN_END.
    const pins = pinnedScenes(vh).map(({ from, to }) => ({ from, to, l0: along(from + LINE * vh), l1: along(to + PIN_END * vh) }));
    stops = pinnedPoints(progressPoints(ys, [0, ...g.stationLengths, g.totalLength], vh * LINE, maxScroll), pins);
    map = stops.length ? piecewise(stops) : () => 0;
    pads = padEls.map((el, i) => ({ el, len: g.stationLengths[i], passed: el.hasAttribute("data-passed") }));
    segs = g.segments;
    total = g.totalLength;
    floor = Math.min(...g.stationLengths);
    ({ lead, tail, spine } = g);
    shown = NaN;
    leadShown = tailShown = "";
    tasks.measure({ points, padEls, stationLengths: g.stationLengths, stops, sr, docTop, vh, maxScroll });
    if (!reduced) diagram.measure(vh);
    diagramWin = reduced ? null : diagram.window();

    if (reduced) return;
    syncPaths(leadSvg, [lead.d], { pathLength: "1" });
    syncPaths(tailSvg, [tail.d], { pathLength: "1" });
    leadPath = leadSvg.firstElementChild as SVGPathElement;
    tailPath = tailSvg.firstElementChild as SVGPathElement;
    fit(leadSvg, lead.segments);
    fit(tailSvg, tail.segments);
    // Lanes are lit by the same reveal as the spine: down to where the main path is lit.
    syncPaths(body, [g.spine.d, ...g.lanes.map((l) => l.d), ...gws]);
    // The reveal is only as wide as the spine and its lanes, not the whole layer (which reaches the
    // hero's period): a narrow page-tall layer composites far cheaper.
    const litX = Math.max(...[g.spine, ...g.lanes].flatMap((p) => p.segments.map((s) => s.x1)));
    reveal.style.width = `${Math.ceil(litX + GW + 4)}px`;
    markGateways(body, nPaths);
    if (tokensBox.childElementCount !== g.lanes.length) {
      tokensBox.replaceChildren(...g.lanes.map(() => Object.assign(document.createElement("div"), { className: "trace-token" })));
    }
    // Each scene-lit lane is its own small SVG, carrying data-lane="<first entry id>".
    if (lanes.length !== g.lanes.length) {
      lanes = g.lanes.map(() => ({ svg: document.createElementNS(NS, "svg"), entries: [] }));
      lanesBox.replaceChildren(...lanes.map((l) => l.svg));
    }
    g.lanes.forEach((l, i) => {
      const { svg } = lanes[i];
      svg.setAttribute("class", "trace-lit trace-lane");
      svg.setAttribute("data-lane", l.id);
      svg.setAttribute("data-entries", l.entries.join(" "));
      syncPaths(svg, [l.d], { pathLength: "1" });
      fit(svg, l.segments);
      lanes[i].entries = l.entries;
    });
    syncSceneLit();
    if (linkWanted) link();
  };

  function markGateways(svg: SVGSVGElement, from: number) {
    for (let i = from; i < svg.children.length; i++) svg.children[i].setAttribute("class", (i - from) % 2 ? "trace-gw-plus" : "trace-gw");
  }

  // How lit length L (and the head's length) look; shared by the JS paint and the keyframes.
  const look = (L: number, headLen: number) => {
    const y = spine.top + Math.min(Math.max(L - lead.length, 0), spine.length);
    const at = pointAt(segs, headLen);
    return {
      reveal: `translate3d(0,${(y - H).toFixed(2)}px,0)`,
      revealIn: `translate3d(0,${(H - y).toFixed(2)}px,0)`,
      lead: String(1 - clamp01(L / (lead.length || 1))),
      tail: String(1 - clamp01((L - lead.length - spine.length) / (tail.length || 1))),
      head: `translate3d(${(at.x - HEAD).toFixed(2)}px,${(at.y - HEAD).toFixed(2)}px,0)`,
    };
  };

  function unlink() {
    for (const a of linked) a.cancel();
    linked = [];
    shown = NaN;
  }

  /**
   * Hands the scroll-linked visuals to the compositor: one scroll-driven animation per element. Keyframe offsets use the scroll range at
   * link time; the 150 ms re-measure relinks after a height change.
   */
  function link() {
    unlink();
    linkWanted = true;
    if (!ScrollTL || reduced || !segs.length || !leadPath || !tailPath) return;
    const de = document.documentElement;
    const range = de.scrollHeight - de.clientHeight; // the timeline's own range
    if (range <= 0) return;
    const kf = scrollStops(stops, [floor, ...lengthKnots(segs)], range).map((s) => {
      const L = Math.max(map(s), floor);
      return { offset: s / range, ...look(L, L) };
    });
    const timeline = new ScrollTL({ source: de, axis: "block" });
    const run = (el: Element, k: (v: (typeof kf)[number]) => Keyframe) =>
      linked.push(el.animate(kf.map((v) => ({ ...k(v), offset: v.offset })), { timeline, fill: "both" }));
    run(reveal, (v) => ({ transform: v.reveal }));
    run(revealIn, (v) => ({ transform: v.revealIn }));
    run(head, (v) => ({ transform: v.head }));
    run(leadPath, (v) => ({ strokeDashoffset: v.lead }));
    run(tailPath, (v) => ({ strokeDashoffset: v.tail }));
    linked.push(...tasks.link(timeline, range), ...diagram.link(timeline, range));
    // At a fork the token splits: a second one runs the lane level with the head and rejoins it at the join.
    const Lof = (y: number) => lead.length + (y - spine.top);
    laneGeo.forEach((l, i) => {
      const tok = tokensBox.children[i];
      if (!tok) return;
      const ys = l.segments.flatMap((s) =>
        s.kind === "line" ? [s.y1] : Array.from({ length: 8 }, (_, k) => s.cy + s.r * Math.sin(s.a0 + ((s.a1 - s.a0) * (k + 1)) / 8)),
      );
      const ks = [l.from, l.from + 0.5, l.to - 0.5, l.to, ...ys.map(Lof)];
      const fr = scrollStops(stops, ks, range).map((s) => {
        const L = Math.max(map(s), floor);
        const at = pointAt(l.segments, lengthAtY(l.segments, spine.top + L - lead.length));
        return {
          offset: s / range,
          opacity: L > l.from + 0.25 && L < l.to - 0.25 ? 1 : 0,
          transform: `translate3d(${(at.x - HEAD).toFixed(2)}px,${(at.y - HEAD).toFixed(2)}px,0)`,
        };
      });
      linked.push(tok.animate(fr, { timeline, fill: "both" }));
    });
  }

  const setAttr = (el: Element, name: string, on: boolean) => el.toggleAttribute(name, on);

  // No layout reads below this line: numbers in, attribute/style writes out.
  const frame = (scrollY: number, dt: number) => {
    const c = !!cover && scrollY > cover.from && scrollY < cover.to;
    if (c !== covered) setAttr(root, "data-covered", (covered = c));
    // Toggled mid-cover, while the layer is hidden: never during its fade, never a visible repaint.
    const cl = !!cover && scrollY < (cover.from + cover.to) / 2;
    if (cl !== clipped) setAttr(root, "data-clip", (clipped = cl));
    const rc = !!cover && scrollY > cover.railFrom && scrollY < cover.to;
    if (rc !== railCovered && rail) setAttr(rail, "data-covered", (railCovered = rc));
    if (!segs.length) return false;
    if (reduced) {
      // No movement, same information: a pad fills once the scroll position has passed it,
      // however it got there (a jump included).
      const L = map(scrollY);
      for (const p of pads) {
        const on = isPassed(L, p.len);
        if (on !== p.passed) setAttr(p.el, "data-passed", (p.passed = on));
      }
      arrive(L);
      tasks.frame(scrollY, false);
      return false;
    }
    const target = Math.max(map(scrollY), floor);
    let L = target;
    let headLen = target;
    let animating = false;
    if (intro < DELAY + DRAW) {
      intro += dt;
      L = headLen = target * easeInOutQuart(clamp01((intro - DELAY) / DRAW)); // retargets as you scroll
      animating = intro < DELAY + DRAW;
      if (!animating) link();
    }
    if (replay >= 0) {
      replay += dt;
      const k = easeInOutQuart(clamp01(replay / DRAW));
      L = target * k;
      headLen = total * k; // the head runs the full length once
      if (replay >= DRAW && !headHidden) setAttr(head, "data-hidden", (headHidden = true));
      animating = true;
      if (replay >= DRAW + FADE) {
        replay = -1; // the head jumps back to the tip while invisible
        L = headLen = target;
        animating = false;
        link();
      }
    }
    if (replay < 0 && headHidden) setAttr(head, "data-hidden", (headHidden = false));

    if (!linked.length && (animating || !(Math.abs(L - shown) < 0.05))) {
      shown = L;
      const v = look(L, headLen);
      reveal.style.transform = v.reveal;
      revealIn.style.transform = v.revealIn;
      if (v.lead !== leadShown) leadPath!.style.strokeDashoffset = leadShown = v.lead;
      if (v.tail !== tailShown) tailPath!.style.strokeDashoffset = tailShown = v.tail;
      head.style.transform = v.head;
    }
    for (const p of pads) {
      const on = isPassed(L, p.len);
      if (on !== p.passed) setAttr(p.el, "data-passed", (p.passed = on));
    }
    arrive(L);
    tasks.frame(scrollY, linked.length > 0);
    const end = replay < 0 && headLen >= total - 1; // resting on the ring: step aside
    if (end !== headEnd) setAttr(head, "data-end", (headEnd = end));
    const away = replay < 0 && !!diagramWin && scrollY >= diagramWin.from && scrollY < diagramWin.to;
    if (away !== headAway) setAttr(head, "data-away", (headAway = away));
    return animating;
  };

  // A scene (Trace education) marks entry pads with data-scene-lit while it shows them; the
  // lane through that entry is then lit in full (trace.css), whatever the scroll progress.
  // The attribute is cumulative (the scene never clears it), so that lane stays lit for the rest
  // of the page: lit means passed.
  const syncSceneLit = () => {
    const lit = new Set(Array.from(document.querySelectorAll<HTMLElement>(".pad[data-scene-lit][data-entry]"), (p) => p.dataset.entry));
    for (const l of lanes) l.svg.toggleAttribute("data-scene-lit", l.entries.some((e) => lit.has(e)));
  };
  const sceneObs = new MutationObserver(syncSceneLit);
  for (const p of document.querySelectorAll(".pad[data-entry]")) sceneObs.observe(p, { attributeFilter: ["data-scene-lit"] });

  // ---- wiring ----
  let timer: ReturnType<typeof setTimeout> | undefined;
  let offFrame = () => {};
  const kick = () => {
    offFrame();
    offFrame = onFrame(frame);
  };
  measure();
  if (intro >= DELAY + DRAW) link();
  const offMeasure = onMeasure(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      measure();
      kick();
    }, 150);
  });

  kick();

  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = e.target as Element | null;
    const pad = el?.closest?.<HTMLElement>(".pad[data-station]");
    if (pad) {
      const target = document.getElementById(pad.dataset.station!);
      if (!target) return;
      e.preventDefault();
      history.pushState(null, "", `#${pad.dataset.station}`);
      // Pinned education: pushState fires no hashchange, so the stage's own station jump does not run;
      // this smooth scroll lands on the school's column and the stage's progress reveals it. Deliberate.
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      return;
    }
    if (!reduced && el?.closest?.("[data-trace-origin]")) {
      replay = 0;
      linkWanted = false;
      unlink();
      // Paint the replay's first frame now, not one stale frame later.
      frame(window.scrollY, 0);
      kick();
    }
  };
  document.addEventListener("click", onClick);

  return () => {
    document.removeEventListener("click", onClick);
    clearTimeout(timer);
    offMeasure();
    offFrame();
    sceneObs.disconnect();
    filler.disconnect();
    endEl?.removeAttribute("data-armed");
    root.removeAttribute("data-covered");
    head.removeAttribute("data-away");
    root.removeAttribute("data-clip");
    rail?.removeAttribute("data-covered");
    clear();
    tasks.clear();
    diagram.clear();
  };
}
