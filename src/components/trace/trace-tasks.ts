/**
 * Every entry is a task the line runs. Once its station reaches the 40 % line, the line splits
 * round the entry's box, both halves scrubbed with the scroll, and as the box's bottom reaches
 * RUN_END a check marks it done, with how long the entry ran beside it.
 *
 * Nothing here repaints while scrolling. The box outlines are static paths in the line's own base
 * SVG (one layer for the line and every box, not one per box); a running box is lit by composited
 * reveals (a clip box and its content counter-translated, like the spine). Each half is split into
 * legs monotone in x and y, each with its own reveal whose corner rides the half's token, so the lit
 * line ends under the token. Boxes whose runs never overlap share one set of reveals and one token
 * pair, so the trace keeps a handful of layers however many entries there are.
 */
import { keyframeOffsets, lengthKnots, monotoneLegs, pointAt, scrollAt, taskHalves, type Leg, type Point, type Segment, type StationPoint } from "./trace-geometry";
import "./trace-tasks.css";

/** Layer measurements the boxes are placed from (layer coordinates unless noted). */
export interface TaskInput {
  points: StationPoint[];
  padEls: HTMLElement[];
  stationLengths: number[];
  /** Scroll -> lit length breakpoints the head follows. */
  stops: [number, number][];
  /** Layer origin in viewport coordinates. */
  sr: { left: number; top: number };
  docTop: number;
  vh: number;
  maxScroll: number;
}

/** A box finishes drawing when its bottom edge reaches this share of the viewport. */
const RUN_END = 0.25;
const TOK = 4.5; // token radius, px
const NS = "http://www.w3.org/2000/svg";
const CHECK = '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7.25"/><path d="M4.6 8.3l2.2 2.2 4.6-4.8"/></svg>';

type State = "" | "run" | "done";
type Rig = { clip: HTMLElement; inner: HTMLElement };
type Pair = { toks: HTMLElement[]; rigs: Rig[] };
/** A leg of half `half`, revealed by rig `rig` of its pair; `lit` is its outline, shown while the box runs. */
type TaskLeg = Leg & { half: number; rig: number; lit: SVGSVGElement };
type Task = {
  svg: SVGGElement;
  /** Index of the reveals and token pair running this box (shared by boxes whose runs never overlap). */
  pair: number;
  legs: TaskLeg[];
  tick: HTMLElement;
  halves: { segs: Segment[]; len: number }[];
  /** Run window, scroll px. */
  a: number;
  b: number;
  state: State;
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const tokAt = (p: Point) => `translate3d(${(p.x - TOK).toFixed(2)}px,${(p.y - TOK).toFixed(2)}px,0)`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.append(e);
  return e;
}
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.append(e);
  return e;
}
function place(e: HTMLElement | SVGElement, x: number, y: number) {
  e.style.left = `${x.toFixed(1)}px`;
  e.style.top = `${y.toFixed(1)}px`;
}

/** Whether `scene` pins its first child (a sticky stage). Measure-time only. */
export function isPinned(scene: Element | null | undefined): boolean {
  const stage = scene?.firstElementChild;
  return !!stage && getComputedStyle(stage).position === "sticky";
}

/**
 * Mounts the task boxes under the line in `root`. `spans` maps entry ids to how long the entry
 * ran (ended entries only). Measure reads layout; frame takes numbers only.
 */
export function mountTasks(root: HTMLElement, reduced: boolean, spans: Record<string, string>) {
  const box = document.createElement("div");
  box.className = "trace-tasks";
  // The checks paint right after the base SVG (which holds the box outlines), so they share its layer.
  root.querySelector(".trace-base")!.after(box);
  // Tokens last in the layer: nothing of the trace paints over them, so their layers promote
  // nothing else. One pair per set of boxes whose runs never overlap (not one per box): every
  // token is a composited layer for as long as its scroll-driven animation exists.
  const rigBox = document.createElement("div");
  rigBox.className = "trace-task-rigs";
  const tokBox = document.createElement("div");
  tokBox.className = "trace-task-toks";
  root.append(rigBox, tokBox);
  let pairs: Pair[] = [];
  let tasks: Task[] = [];
  /** Reveal size: wider and taller than any box, so a translate alone puts its corner on the token. */
  let RW = 0;
  let RH = 0;
  // Open half the stroke width past the token on both axes, so the stroke shows at full width.
  const M = 0.75;
  /** Clip and counter-translate putting a leg's reveal corner on (x, y), open behind the leg's direction. */
  const cornerAt = (g: Leg, { x, y }: Point) => {
    const tx = g.dx > 0 ? x + M - RW : x - M;
    const ty = g.dy > 0 ? y + M - RH : y - M;
    return { clip: `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0)`, inner: `translate3d(${(-tx).toFixed(2)}px,${(-ty).toFixed(2)}px,0)` };
  };
  /** Where a leg's reveal corner sits once its half has run `l` px. */
  const legPoint = (g: Leg, l: number) => pointAt(g.segs, Math.min(Math.max(l - g.at, 0), g.len));

  function measure(m: TaskInput) {
    const cw = document.documentElement.clientWidth;
    const spineX = (m.points.find((p) => !p.lane) ?? m.points[0]).x;
    box.replaceChildren();
    // The trace's measure has just rewritten the base SVG's children; the set goes last in it.
    const set = svgEl("g", { class: "trace-task-set" }, root.querySelector(".trace-base")!);
    tasks = [];
    RW = cw;
    rigBox.style.width = `${cw - m.sr.left - 2}px`; // 2 px short of the edge: nothing is drawn there
    RH = 0;
    const pairEnds: number[] = [];
    m.padEls.forEach((pad, i) => {
      if (pad.dataset.kind !== "entry") return;
      // A framed feature runs round its frame; a ruled row inside its rules; anything else just outside.
      const row = pad.closest<HTMLElement>(".t-feature") ?? pad.closest<HTMLElement>("li, article, .t-edu-col");
      // A row holding a pinned scene (the Player) runs its own show.
      if (!row || isPinned(row.querySelector("[data-scene]"))) return;
      const r = row.getBoundingClientRect();
      if (!r.height) return;
      const left = r.left - m.sr.left;
      const inset = Math.min(26, Math.max(6, (left - spineX) / 2));
      const x0 = left - inset;
      // Right: just past the content, short of the rail's line and the screen edge.
      const x1 = Math.min(r.right - m.sr.left + Math.min(inset, 10), cw - m.sr.left - 6);
      const out = row.tagName === "LI" ? -10 : 10;
      const y0 = r.top - m.sr.top - out;
      const y1 = r.bottom - m.sr.top + out;
      const p = m.points[i];
      const halves = taskHalves(p, { x0, y0, x1, y1 }, 10);
      // From the station reaching the 40 % line until the box's bottom reaches RUN_END.
      const b = Math.min(m.maxScroll, y1 + m.docTop - RUN_END * m.vh);
      const a = Math.max(0, Math.min(scrollAt(m.stops, m.stationLengths[i]), b - 160));

      const svg = svgEl("g", { class: "trace-task", "data-task": p.id }, set);
      for (const h of halves) svgEl("path", { d: h.d, class: "trace-task-base" }, svg);
      RH = Math.max(RH, y1 - y0 + 26);
      // One lit SVG per leg, as small as the leg (a monotone leg's box is that of its two ends).
      let rig = 0;
      const legs = halves.flatMap((h, half) =>
        monotoneLegs(h.segments).map((g): TaskLeg => {
          const [s, e] = [pointAt(g.segs, 0), pointAt(g.segs, g.len)];
          const lx = Math.min(s.x, e.x) - 3;
          const ly = Math.min(s.y, e.y) - 3;
          const lw = Math.abs(e.x - s.x) + 6;
          const lh = Math.abs(e.y - s.y) + 6;
          const lit = svgEl("svg", { class: "trace-task-lit", width: lw, height: lh, viewBox: `${lx} ${ly} ${lw} ${lh}` }, document.createElement("div"));
          place(lit, lx, ly);
          svgEl("path", { d: g.d }, lit);
          return { ...g, half, rig: rig++, lit };
        }),
      );
      // An entry with a detail panel is a collapsed subprocess: BPMN's plus marker, bottom centre.
      if (row.querySelector(".dp-trigger")) {
        const g = svgEl("g", { class: "trace-sub", transform: `translate(${((x0 + x1) / 2).toFixed(1)} ${y1.toFixed(1)})` }, svg);
        svgEl("rect", { x: -6.5, y: -6.5, width: 13, height: 13, rx: 2 }, g);
        svgEl("path", { d: "M-3.5 0H3.5M0 -3.5V3.5" }, g);
      }
      // Greedy: the first pair free again before this run starts (a token fades over 30px after b).
      let pair = pairEnds.findIndex((end) => end < a - 2);
      if (pair < 0) pair = pairEnds.length;
      pairEnds[pair] = b + 30;
      // The check sits on the box's bottom edge inside its right corner, clear of the line and the rail.
      const tick = el("div", "trace-tick", box);
      if (spans[p.id]) el("span", "", tick).textContent = spans[p.id];
      tick.insertAdjacentHTML("beforeend", CHECK);
      place(tick, x1 - 16, y1 - 8);
      tick.style.translate = "-100% 0"; // inline: the CSS minifier drops it next to transform
      tasks.push({ svg, pair, legs, tick, halves: halves.map((h) => ({ segs: h.segments, len: h.length })), a, b, state: "" });
    });
    syncPairs();
    for (const t of tasks) for (const g of t.legs) pairs[t.pair].rigs[g.rig].inner.append(g.lit);
  }

  function syncPairs() {
    const n = Math.max(-1, ...tasks.map((t) => t.pair)) + 1;
    const rigsOf = (p: number) => Math.max(0, ...tasks.filter((t) => t.pair === p).map((t) => t.legs.length));
    if (pairs.length !== n || pairs.some((p, i) => p.rigs.length !== rigsOf(i))) {
      tokBox.replaceChildren();
      rigBox.replaceChildren();
      pairs = Array.from({ length: n }, (_, i) => ({
        toks: [el("div", "trace-token", tokBox), el("div", "trace-token", tokBox)],
        rigs: Array.from({ length: rigsOf(i) }, () => {
          const clip = el("div", "trace-rig", rigBox);
          return { clip, inner: el("div", "", clip) };
        }),
      }));
    }
    for (const p of pairs)
      for (const r of p.rigs) {
        r.inner.replaceChildren();
        r.clip.style.width = `${RW}px`;
        r.clip.style.height = `${RH}px`;
      }
  }

  /** Scroll-driven animations for each box's two halves and the tokens. */
  function link(timeline: AnimationTimeline, range: number): Animation[] {
    const out: Animation[] = [];
    const o = (s: number) => s / range;
    const animate = (e: Element, kf: (Keyframe & { offset: number })[]) => out.push(e.animate(keyframeOffsets(kf), { timeline, fill: "both" }));
    // Each reveal runs its leg of each box in turn, its corner on the half's token at the token's own
    // keyframe offsets (so both interpolate alike), held at the leg's ends outside it.
    pairs.forEach((pair, p) =>
      pair.rigs.forEach((rig, r) => {
        const kf: { offset: number; v: { clip: string; inner: string } }[] = [];
        for (const t of tasks) {
          const g = t.legs.find((g) => g.rig === r);
          if (t.pair !== p || !g || t.b <= t.a + 1) continue;
          const h = t.halves[g.half];
          const at = (l: number) => ({ offset: o(t.a + ((t.b - t.a) * l) / h.len), v: cornerAt(g, legPoint(g, l)) });
          kf.push({ ...at(0), offset: o(t.a - 1) });
          for (const l of [0, ...lengthKnots(h.segs)]) if (l > g.at - 1e-6 && l < g.at + g.len + 1e-6) kf.push(at(l));
          // Held at its end until the box is done (tokens fade over the same 30px).
          kf.push(at(g.at), at(g.at + g.len), { ...at(g.at + g.len), offset: o(t.b + 30) });
        }
        if (!kf.length) return;
        const all = keyframeOffsets([{ ...kf[0], offset: 0 }, ...kf, { ...kf[kf.length - 1], offset: 1 }]);
        animate(rig.clip, all.map((k) => ({ offset: k.offset, transform: k.v.clip })));
        animate(rig.inner, all.map((k) => ({ offset: k.offset, transform: k.v.inner })));
      }),
    );
    // Each token runs every box of its pair in turn, hidden between runs.
    pairs.forEach(({ toks }, p) =>
      toks.forEach((tok, k) => {
        const kf: (Keyframe & { offset: number })[] = [];
        for (const t of tasks) {
          const h = t.halves[k];
          if (t.pair !== p || !h || t.b <= t.a + 1) continue;
          const fr = [0, ...lengthKnots(h.segs)].map((l) => ({ offset: o(t.a + ((t.b - t.a) * l) / h.len), transform: tokAt(pointAt(h.segs, l)), opacity: 1 }));
          const last = fr[fr.length - 1];
          kf.push({ ...fr[0], offset: o(t.a - 1), opacity: 0 }, ...fr, { ...last, offset: o(t.b + 30), opacity: 0 });
        }
        if (kf.length) animate(tok, [{ ...kf[0], offset: 0 }, ...kf, { ...kf[kf.length - 1], offset: 1 }]);
      }),
    );
    return out;
  }
  /** Discrete state per box; without scroll-driven animations (`linked` false) it paints them too. */
  function frame(scrollY: number, linked: boolean) {
    const shown = new Set<number>();
    for (const t of tasks) {
      const s: State = reduced ? (scrollY >= t.a ? "done" : "") : scrollY >= t.b ? "done" : scrollY >= t.a ? "run" : "";
      if (s !== t.state) {
        t.svg.toggleAttribute("data-done", s === "done");
        for (const g of t.legs) g.lit.toggleAttribute("data-run", s === "run");
        t.tick.toggleAttribute("data-done", s === "done");
        t.state = s;
      }
      if (linked || reduced) continue;
      if (s !== "run") continue;
      const k = clamp01((scrollY - t.a) / Math.max(1, t.b - t.a));
      const pair = pairs[t.pair];
      t.halves.forEach((h, j) => (pair.toks[j].style.transform = tokAt(pointAt(h.segs, k * h.len))));
      for (const g of t.legs) {
        const v = cornerAt(g, legPoint(g, k * t.halves[g.half].len));
        pair.rigs[g.rig].clip.style.transform = v.clip;
        pair.rigs[g.rig].inner.style.transform = v.inner;
      }
      shown.add(t.pair);
    }
    if (linked || reduced) return;
    pairs.forEach(({ toks }, p) => toks.forEach((tok) => (tok.style.opacity = shown.has(p) ? "1" : "0")));
  }

  function clear() {
    tasks = [];
    pairs = [];
    box.remove();
    rigBox.remove();
    tokBox.remove();
  }

  return { measure, link, frame, clear };
}
