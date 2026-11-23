/**
 * Pure geometry for Trace's line: straight segments and quarter arcs only, so every length
 * is analytic (no getTotalLength, nothing measured per frame).
 *
 * Coordinates are px in the trace SVG's own space, y down. The main path runs from the
 * origin (the name's period) down to a bus line, jogs over to the spine, runs down the spine
 * past every station and turns into the end (the contact ring). Lanes sit beside the spine.
 */
import { piecewise } from "@/lib/motion/piecewise";

export interface StationPoint { id: string; x: number; y: number; lane: number; kind: "section" | "entry" }
export interface Point { x: number; y: number }

export type Segment =
  | { kind: "line"; x0: number; y0: number; x1: number; y1: number; len: number }
  | { kind: "arc"; cx: number; cy: number; r: number; a0: number; a1: number; x1: number; y1: number; len: number };

export interface Lane {
  /** The first entry of the run; `data-lane` on the rendered path. */
  id: string;
  /** Where it leaves and rejoins the line it forked from: the parallel gateways. */
  fork: Point;
  join: Point;
  d: string;
  /** Entry ids on this run (lane >= its index), in page order. */
  entries: string[];
  /** Main-path lengths where the lane forks and where it has merged back: its lit window. */
  from: number;
  to: number;
  length: number;
  segments: Segment[];
}

/** A piece of the main path. */
export interface Part { d: string; length: number; segments: Segment[] }

const PI = Math.PI;
const n = (v: number) => String(Math.round(v * 100) / 100);

/** A drawing cursor that records segments (heading is implied: the trace always runs down). */
function pen(x: number, y: number) {
  const segs: Segment[] = [];
  let cx = x;
  let cy = y;
  let len = 0;
  const push = (s: Segment) => {
    segs.push(s);
    len += s.len;
    cx = s.x1;
    cy = s.y1;
  };
  const line = (x1: number, y1: number) => {
    const l = Math.hypot(x1 - cx, y1 - cy);
    if (l > 1e-9) push({ kind: "line", x0: cx, y0: cy, x1, y1, len: l });
  };
  const arc = (ox: number, oy: number, r: number, a0: number, a1: number) =>
    push({ kind: "arc", cx: ox, cy: oy, r, a0, a1, x1: ox + r * Math.cos(a1), y1: oy + r * Math.sin(a1), len: r * Math.abs(a1 - a0) });
  /** Heading down: turn toward `x1` (one quarter arc), run horizontally to `x1`. */
  const turn = (x1: number, r: number) => {
    const s = Math.sign(x1 - cx);
    if (!s) return;
    const rr = Math.min(r, Math.abs(x1 - cx));
    arc(cx + s * rr, cy, rr, s > 0 ? PI : 0, PI / 2);
    line(x1, cy);
  };
  /** Heading down: S-jog over to `x1` and head down again. Uses 2r of height. */
  const jog = (x1: number, r: number) => {
    const s = Math.sign(x1 - cx);
    if (!s) return;
    const rr = Math.min(r, Math.abs(x1 - cx) / 2);
    arc(cx + s * rr, cy, rr, s > 0 ? PI : 0, PI / 2);
    line(x1 - s * rr, cy);
    arc(x1 - s * rr, cy + rr, rr, -PI / 2, s > 0 ? 0 : -PI);
  };
  return {
    segs,
    line,
    turn,
    jog,
    get len() {
      return len;
    },
  };
}

function toD(start: Point, segs: Segment[]): string {
  let d = `M${n(start.x)} ${n(start.y)}`;
  for (const s of segs)
    d += s.kind === "line" ? `L${n(s.x1)} ${n(s.y1)}` : `A${n(s.r)} ${n(s.r)} 0 0 ${s.a1 > s.a0 ? 1 : 0} ${n(s.x1)} ${n(s.y1)}`;
  return d;
}

/**
 * Builds the main path and the lane paths. `points` are in page order. Lane-0 points sit on
 * the spine (x of the first lane-0 point); a lane-k point sits at spine + k * laneOffset.
 * A lane run is a maximal stretch of consecutive points with lane >= k: it forks halfway
 * before its first point and merges halfway after its last one. `bus` is the y where the
 * origin's drop turns toward the spine (default origin.y + 3r).
 */
export function buildPaths(
  points: StationPoint[],
  opts: { origin: Point; end: Point; laneOffset: number; radius: number; bus?: number },
): {
  main: string;
  /** The main path split at the spine: origin -> spine top, the straight spine, the turn into the end. */
  lead: Part;
  spine: Part & { top: number; bottom: number };
  tail: Part;
  lanes: Lane[];
  stationLengths: number[];
  totalLength: number;
  segments: Segment[];
} {
  const { origin, end, laneOffset, radius: r } = opts;
  const spineX = (points.find((p) => p.lane === 0) ?? points[0])?.x ?? end.x;
  const firstY = points.length ? Math.min(...points.map((p) => p.y)) : end.y;

  const busY = Math.max(origin.y, Math.min(opts.bus ?? origin.y + 3 * r, firstY - 2 * r));
  const m = pen(origin.x, origin.y);
  m.line(origin.x, busY);
  m.jog(spineX, r);
  const spineY = m.segs.at(-1)?.y1 ?? origin.y;
  const spineLen = m.len;
  const along = (y: number) => spineLen + Math.max(0, y - spineY);
  const leadN = m.segs.length;

  const lastY = points.length ? Math.max(...points.map((p) => p.y)) : spineY;
  const turnR = Math.min(r, Math.abs(end.x - spineX));
  const turnY = Math.max(end.y - turnR, lastY, spineY);
  m.line(spineX, turnY);
  const spineN = m.segs.length;
  m.turn(end.x, r);
  const part = (from: number, to: number, start: Point): Part => {
    const segments = m.segs.slice(from, to);
    return { d: toD(start, segments), length: segments.reduce((a, x) => a + x.len, 0), segments };
  };

  const lanes: Lane[] = [];
  const maxLane = Math.max(0, ...points.map((p) => p.lane));
  for (let k = 1; k <= maxLane; k++) {
    const xPrev = spineX + (k - 1) * laneOffset;
    const xk = spineX + k * laneOffset;
    const rr = Math.min(r, Math.abs(laneOffset) / 2);
    for (let i = 0; i < points.length; i++) {
      if (points[i].lane < k) continue;
      let j = i;
      while (j + 1 < points.length && points[j + 1].lane >= k) j++;
      const before = i > 0 ? points[i - 1].y : spineY;
      const after = j + 1 < points.length ? points[j + 1].y : turnY;
      const forkY = (before + points[i].y) / 2 - rr;
      const mergeY = (points[j].y + after) / 2 - rr;
      const l = pen(xPrev, forkY);
      l.jog(xk, r);
      l.line(xk, mergeY);
      l.jog(xPrev, r);
      lanes.push({
        id: points[i].id,
        fork: { x: xPrev, y: forkY },
        join: { x: l.segs.at(-1)!.x1, y: l.segs.at(-1)!.y1 },
        d: toD({ x: xPrev, y: forkY }, l.segs),
        entries: points.slice(i, j + 1).map((p) => p.id),
        from: along(forkY),
        to: along(mergeY + 2 * rr),
        length: l.len,
        segments: l.segs,
      });
      i = j;
    }
  }

  return {
    main: toD(origin, m.segs),
    lead: part(0, leadN, origin),
    spine: { ...part(leadN, spineN, { x: spineX, y: spineY }), top: spineY, bottom: turnY },
    tail: part(spineN, m.segs.length, { x: spineX, y: turnY }),
    lanes,
    stationLengths: points.map((p) => along(p.y)),
    totalLength: m.len,
    segments: m.segs,
  };
}

/** The point at `len` along `segs` (clamped). Pure arithmetic, safe in a frame callback. */
export function pointAt(segs: Segment[], len: number): Point {
  if (!segs.length) return { x: 0, y: 0 };
  let rest = Math.max(0, len);
  for (const s of segs) {
    if (rest <= s.len) {
      const t = s.len ? rest / s.len : 0;
      if (s.kind === "line") return { x: s.x0 + (s.x1 - s.x0) * t, y: s.y0 + (s.y1 - s.y0) * t };
      const a = s.a0 + (s.a1 - s.a0) * t;
      return { x: s.cx + s.r * Math.cos(a), y: s.cy + s.r * Math.sin(a) };
    }
    rest -= s.len;
  }
  const last = segs[segs.length - 1];
  return { x: last.x1, y: last.y1 };
}

/**
 * Scroll position -> lit length. Station i is reached when its document y crosses
 * `viewportLine` px below the top of the viewport. Piecewise-linear, clamped, and forced
 * monotonic (running max) so out-of-order input can never make the line retreat.
 * With `maxScroll`, stations the line could never reach are compressed into the last half
 * viewport of scrolling (from maxScroll - 1.25 * viewportLine), so the end lights exactly at
 * the bottom of the page.
 */
export function progressMap(
  stationYs: number[],
  stationLengths: number[],
  viewportLine: number,
  maxScroll = Infinity,
): (scrollY: number) => number {
  const pts = progressPoints(stationYs, stationLengths, viewportLine, maxScroll);
  return pts.length ? piecewise(pts) : () => 0;
}

/** The `[scrollY, length]` breakpoints behind `progressMap`. */
export function progressPoints(
  stationYs: number[],
  stationLengths: number[],
  viewportLine: number,
  maxScroll = Infinity,
): [number, number][] {
  let mx = -Infinity;
  let ml = -Infinity;
  const pts = stationYs.map((y, i): [number, number] => {
    mx = Math.max(mx, y - viewportLine);
    ml = Math.max(ml, stationLengths[i]);
    return [mx, ml];
  });
  const last = pts.at(-1)?.[0] ?? 0;
  if (last > maxScroll) {
    const a = Math.max(pts[0][0], maxScroll - 1.25 * viewportLine);
    for (const p of pts) if (p[0] > a) p[0] = a + ((p[0] - a) * (maxScroll - a)) / (last - a);
  }
  return pts;
}

/**
 * The length along a downward path `segs` where it first reaches `y` (clamped to the path), so
 * something on a lane keeps level with the main path. Arcs are solved by bisection: measure-time only.
 */
export function lengthAtY(segs: Segment[], y: number): number {
  let at = 0;
  for (const s of segs) {
    const y0 = s.kind === "line" ? s.y0 : s.cy + s.r * Math.sin(s.a0);
    if (y <= y0) return at;
    if (y < s.y1) {
      if (s.kind === "line") return at + ((y - y0) / (s.y1 - y0)) * s.len;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (s.cy + s.r * Math.sin(s.a0 + (s.a1 - s.a0) * mid) < y) lo = mid;
        else hi = mid;
      }
      return at + lo * s.len;
    }
    at += s.len;
  }
  return at;
}

/** Lengths along `segs` where a value of the length stops being linear: segment ends, arcs in `arcSteps` pieces. */
export function lengthKnots(segs: Segment[], arcSteps = 8): number[] {
  const out: number[] = [];
  let at = 0;
  for (const s of segs) {
    const k = s.kind === "arc" ? arcSteps : 1;
    for (let i = 1; i <= k; i++) out.push(at + (s.len * i) / k);
    at += s.len;
  }
  return out;
}

/**
 * Scroll offsets (0..maxScroll, ascending) for keyframes of a scroll-driven animation: the
 * breakpoints of `points` plus every offset where the mapped length crosses a knot. Linear
 * interpolation between them reproduces any value that is linear in the length between knots.
 */
export function scrollStops(points: [number, number][], knots: number[], maxScroll: number): number[] {
  const out = [0, maxScroll];
  points.forEach(([s1, l1], i) => {
    out.push(s1);
    if (!i) return;
    const [s0, l0] = points[i - 1];
    if (l1 === l0) return;
    for (const k of knots) if ((k - l0) * (k - l1) < 0) out.push(s0 + ((k - l0) / (l1 - l0)) * (s1 - s0));
  });
  return [...new Set(out.filter((s) => s >= 0 && s <= maxScroll))].sort((a, b) => a - b);
}

/** A pad is filled once the trace's length has reached it (half a pixel of slack). */
export function isPassed(length: number, padLength: number): boolean {
  return length >= padLength - 0.5;
}

type Run = { d: string; segments: Segment[]; length: number };

/**
 * A task box the line runs around, as two halves drawn at once: from `from` (the station)
 * straight over to the box's left edge at `from.y`, then one half up and over the top, the
 * other down and along the bottom, meeting halfway down the right edge. `from.y` is clamped
 * into the left edge's straight part.
 */
export function taskHalves(from: Point, box: { x0: number; y0: number; x1: number; y1: number }, r: number): [Run, Run] {
  const { x0, y0, x1, y1 } = box;
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  const sy = Math.min(Math.max(from.y, y0 + rr), y1 - rr);
  const mid = (y0 + y1) / 2;
  const half = (up: boolean): Run => {
    const segs: Segment[] = [];
    let cx = from.x;
    let cy = sy;
    const line = (x: number, y: number) => {
      const len = Math.hypot(x - cx, y - cy);
      if (len > 1e-9) segs.push({ kind: "line", x0: cx, y0: cy, x1: x, y1: y, len });
      cx = x;
      cy = y;
    };
    const arc = (ox: number, oy: number, a0: number, a1: number) => {
      cx = ox + rr * Math.cos(a1);
      cy = oy + rr * Math.sin(a1);
      if (rr > 0) segs.push({ kind: "arc", cx: ox, cy: oy, r: rr, a0, a1, x1: cx, y1: cy, len: (rr * PI) / 2 });
    };
    line(x0, sy);
    if (up) {
      line(x0, y0 + rr);
      arc(x0 + rr, y0 + rr, PI, 1.5 * PI);
      line(x1 - rr, y0);
      arc(x1 - rr, y0 + rr, -PI / 2, 0);
    } else {
      line(x0, y1 - rr);
      arc(x0 + rr, y1 - rr, PI, PI / 2);
      line(x1 - rr, y1);
      arc(x1 - rr, y1 - rr, PI / 2, 0);
    }
    line(x1, mid);
    return { d: toD({ x: from.x, y: sy }, segs), segments: segs, length: segs.reduce((n, x) => n + x.len, 0) };
  };
  return [half(true), half(false)];
}

/** A stretch of a run along which x and y never turn back; `at` is its start length on the run. */
export interface Leg { segs: Segment[]; d: string; at: number; len: number; dx: 1 | -1; dy: 1 | -1 }

/**
 * Splits a run where it turns back in x or y. Along a leg the drawn part is exactly what lies
 * behind the token in both axes, so a clip with one corner on the token reveals it.
 */
export function monotoneLegs(segs: Segment[]): Leg[] {
  const sign = (v: number) => (v > 1e-6 ? 1 : v < -1e-6 ? -1 : 0);
  const out: { segs: Segment[]; at: number; len: number; dx: number; dy: number }[] = [];
  let at = 0;
  for (const s of segs) {
    const x0 = s.kind === "line" ? s.x0 : s.cx + s.r * Math.cos(s.a0);
    const y0 = s.kind === "line" ? s.y0 : s.cy + s.r * Math.sin(s.a0);
    const sx = sign(s.x1 - x0);
    const sy = sign(s.y1 - y0);
    let cur = out[out.length - 1];
    if (!cur || sx * cur.dx < 0 || sy * cur.dy < 0) out.push((cur = { segs: [], at, len: 0, dx: 0, dy: 0 }));
    cur.segs.push(s);
    cur.len += s.len;
    cur.dx ||= sx;
    cur.dy ||= sy;
    at += s.len;
  }
  return out.map((l) => ({ ...l, d: toD(pointAt(l.segs, 0), l.segs), dx: l.dx < 0 ? -1 : 1, dy: l.dy < 0 ? -1 : 1 }));
}

/**
 * A pinned scene holds its content still while the page scrolls `from`..`to`: the progress
 * map gets those two breakpoints (lengths `l0`, `l1`, chosen so the lit tip visibly moves
 * down the pinned screen) and loses any inside them. Still clamped-monotonic.
 */
export function pinnedPoints(points: [number, number][], pins: { from: number; to: number; l0: number; l1: number }[]): [number, number][] {
  let out = points.slice();
  for (const p of pins) {
    if (p.to <= p.from) continue;
    out = out.filter(([s]) => s <= p.from || s >= p.to);
    out.push([p.from, p.l0], [p.to, p.l1]);
  }
  out.sort((x, y) => x[0] - y[0]);
  let ml = -Infinity;
  const res: [number, number][] = [];
  for (const [s, l] of out) {
    ml = Math.max(ml, l);
    if (res.length && res[res.length - 1][0] === s) res[res.length - 1][1] = ml;
    else res.push([s, ml]);
  }
  return res;
}

/** The scroll offset where the piecewise map `stops` first reaches length `L` (clamped). */
export function scrollAt(stops: [number, number][], L: number): number {
  if (!stops.length) return 0;
  if (L <= stops[0][1]) return stops[0][0];
  for (let i = 1; i < stops.length; i++) {
    const [s0, l0] = stops[i - 1];
    const [s1, l1] = stops[i];
    if (L <= l1) return l1 === l0 ? s0 : s0 + ((L - l0) / (l1 - l0)) * (s1 - s0);
  }
  return stops[stops.length - 1][0];
}

/** Keyframes for `animate()`: sorted, offsets clamped into [0, 1], a repeated offset keeps its first keyframe. */
export function keyframeOffsets<T extends { offset: number }>(kf: T[]): T[] {
  const out: T[] = [];
  for (const k of [...kf].sort((a, b) => a.offset - b.offset)) {
    const o = Math.min(1, Math.max(0, k.offset));
    if (out.length && o <= out[out.length - 1].offset) continue;
    out.push({ ...k, offset: o });
  }
  return out;
}
