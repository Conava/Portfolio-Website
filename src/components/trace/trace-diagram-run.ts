/**
 * The line's token runs the pinned BPMNscript scene's diagram while the compiler builds it: it
 * waits on the start event, rides each new sequence flow as its line is typed (start, Review
 * Invoice, the gateway, Senior Approval for amount > 1000), holds there while the else branch
 * compiles, then takes the join into Done and leaves through it. While it is in the diagram the
 * gutter head steps aside (`window`), so one token moves at a time.
 */
import { progressAtLines } from "./sections/bpmnscript-scene";
import { keyframeOffsets } from "./trace-geometry";
import { isPinned } from "./trace-tasks";

const NS = "http://www.w3.org/2000/svg";
/** [lines typed, x] on the diagram's one row (y 70), InvoiceDiagram's coordinates. A shape's
 * flow draws over the second half of its line (q from line + .4 to line + 1). The token waits
 * just ahead of each shape, never on its label or marker. */
const RUN: [number, number][] = [
  [2, 75],
  [2.4, 75],
  [3, 163],
  [3.4, 163],
  [4, 338],
  [4.4, 338],
  [5, 463],
  [7.4, 463],
  [8, 638],
  [8.4, 638],
  [9, 825],
];
const ROW_Y = 70;
/** Scene progress the token takes to fade into Done. */
const LEAVE = 0.03;

export function mountDiagramRun() {
  let run: { tok: SVGCircleElement; top: number; range: number; ps: number[] } | null = null;

  /** Measure-time: finds the pinned scene's diagram and puts the token in it. */
  function measure(vh: number) {
    clear();
    const scene = document.querySelector<HTMLElement>('[data-scene="bpmnscript"]');
    const svg = scene?.querySelector(".bpmn-diagram");
    if (!scene || !svg || !isPinned(scene)) return;
    const n = scene.querySelectorAll(".bpmn-src .ln").length;
    const tok = document.createElementNS(NS, "circle");
    tok.setAttribute("class", "trace-diagram-tok");
    tok.setAttribute("r", "7");
    svg.append(tok);
    run = { tok, top: scene.getBoundingClientRect().top + scrollY, range: scene.offsetHeight - vh, ps: RUN.map(([q]) => progressAtLines(q, n)) };
  }

  /** Scroll range (px) in which the token is in the diagram, or null. */
  function window_(): { from: number; to: number } | null {
    if (!run || run.range <= 0) return null;
    return { from: run.top + run.ps[0] * run.range, to: run.top + (run.ps[run.ps.length - 1] + LEAVE) * run.range };
  }

  function link(timeline: AnimationTimeline, range: number): Animation[] {
    if (!run || run.range <= 0) return [];
    const { top, range: r, ps } = run;
    const at = (p: number) => (top + p * r) / range;
    const x0 = RUN[0][1];
    const x1 = RUN[RUN.length - 1][1];
    const p0 = ps[0];
    const p1 = ps[ps.length - 1];
    const tf = (x: number) => `translate(${x}px, ${ROW_Y}px)`;
    const kf = keyframeOffsets([
      { offset: 0, transform: tf(x0), opacity: 0 },
      { offset: at(p0 - 0.01), transform: tf(x0), opacity: 0 },
      ...RUN.map(([, x], i) => ({ offset: at(ps[i]), transform: tf(x), opacity: 1 })),
      { offset: at(p1 + LEAVE), transform: tf(x1), opacity: 0 },
      { offset: 1, transform: tf(x1), opacity: 0 },
    ]);
    return [run.tok.animate(kf, { timeline, fill: "both" })];
  }

  function clear() {
    run?.tok.remove();
    run = null;
  }

  return { measure, link, clear, window: window_ };
}
