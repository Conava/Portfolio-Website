import { describe, expect, test } from "bun:test";
import { piecewise } from "@/lib/motion/piecewise";
import {
  buildPaths,
  isPassed,
  keyframeOffsets,
  lengthAtY,
  lengthKnots,
  monotoneLegs,
  pointAt,
  progressMap,
  progressPoints,
  scrollAt,
  scrollStops,
  pinnedPoints,
  taskHalves,
  type StationPoint,
} from "./trace-geometry";

const ARC = (Math.PI / 2) * 8;
const opts = (o: Partial<Parameters<typeof buildPaths>[1]> = {}) => ({
  origin: { x: 100, y: 0 },
  end: { x: 100, y: 400 },
  laneOffset: -18,
  radius: 8,
  ...o,
});
const pt = (id: string, y: number, lane = 0): StationPoint => ({ id, x: 100, y, lane, kind: "entry" });
/** Every command is M, L or an 8 px arc. */
const onlyLinesAndQuarterArcs = (d: string) =>
  expect(d.replace(/M[\d. -]+|L[\d. -]+|A8 8 0 0 [01] [\d. -]+/g, "").trim()).toBe("");

describe("buildPaths", () => {
  test("two stations on lane 0: one straight vertical path", () => {
    const g = buildPaths([pt("a", 100), pt("b", 300)], opts());
    expect(g.lanes).toEqual([]);
    expect(g.totalLength).toBeCloseTo(400, 6);
    expect(g.stationLengths).toEqual([100, 300]);
    expect(g.main).not.toContain("A");
    expect([...g.main.matchAll(/[ML](\S+) /g)].every((m) => m[1] === "100")).toBe(true);
  });

  test("a station on lane 1 opens a lane: straight parts plus 8 px quarter arcs", () => {
    const g = buildPaths([pt("a", 100), pt("b", 300, 1), pt("c", 500)], opts({ end: { x: 100, y: 600 } }));
    expect(g.lanes).toHaveLength(1);
    const [lane] = g.lanes;
    expect(lane.id).toBe("b");
    expect(lane.entries).toEqual(["b"]);
    onlyLinesAndQuarterArcs(lane.d);
    // fork centred between a and b (200), merge between b and c (400): each jog is two arcs + 2 px across
    expect(lane.length).toBeCloseTo(2 + 2 + (392 - 208) + 4 * ARC, 6);
    expect(lane.d).toContain("82 208L82 392"); // runs past b (y 300) at x = 100 - 18
    // lit window on the main path: from the fork (y 192) to the merge (y 408)
    expect(lane.from).toBeCloseTo(192, 6);
    expect(lane.to).toBeCloseTo(408, 6);
    // the parallel gateways sit on the parent line where the lane leaves and rejoins it
    expect(lane.fork).toEqual({ x: 100, y: 192 });
    expect(lane.join.x).toBeCloseTo(100, 6);
    expect(lane.join.y).toBeCloseTo(408, 6);
    // a token on the lane keeps level with the main path: at y 300 it is on the lane, beside b
    const at = pointAt(lane.segments, lengthAtY(lane.segments, 300));
    expect(at.x).toBeCloseTo(82, 6);
    expect(at.y).toBeCloseTo(300, 6);
    expect(lengthAtY(lane.segments, 0)).toBe(0);
    expect(lengthAtY(lane.segments, 9999)).toBeCloseTo(lane.length, 6);
    const mid = pointAt(lane.segments, lengthAtY(lane.segments, 196)); // inside the fork's first arc
    expect(mid.y).toBeCloseTo(196, 3);
    // the head's spine is unaffected
    expect(g.stationLengths).toEqual([100, 300, 500]);
  });

  test("consecutive entries share one lane run; lane 2 forks from lane 1", () => {
    const g = buildPaths(
      [pt("work", 100), pt("adobe", 200, 1), pt("ta", 300, 2), pt("otto", 400, 1), pt("edu", 500)],
      opts({ end: { x: 100, y: 600 } }),
    );
    expect(g.lanes.map((l) => [l.id, l.entries])).toEqual([
      ["adobe", ["adobe", "ta", "otto"]],
      ["ta", ["ta"]],
    ]);
    expect(g.lanes[1].d.startsWith("M82 ")).toBe(true);
    expect(g.lanes[1].d).toContain("64 258L64 342"); // past ta (y 300) at x = 100 - 2 * 18
  });

  test("origin off the spine jogs over at the bus line; the end turns into the terminus", () => {
    const g = buildPaths([pt("a", 200), pt("b", 300)], opts({ origin: { x: 400, y: 50 }, bus: 120, end: { x: 160, y: 500 } }));
    onlyLinesAndQuarterArcs(g.main);
    const toBus = 70;
    const jog = 2 * ARC + (300 - 16);
    expect(g.stationLengths[0]).toBeCloseTo(toBus + jog + (200 - 136), 6);
    const toTurn = 500 - 8 - 136;
    expect(g.totalLength).toBeCloseTo(toBus + jog + toTurn + ARC + (60 - 8), 6);
    // lead + spine + tail is the whole main path
    expect(g.lead.length).toBeCloseTo(toBus + jog, 6);
    expect(g.spine.length).toBeCloseTo(toTurn, 6);
    expect([g.spine.top, g.spine.bottom]).toEqual([136, 492]);
    expect(g.tail.length).toBeCloseTo(ARC + 52, 6);
    expect(g.tail.d.startsWith("M100 492A8 8 0 0 0 108 500")).toBe(true);
    expect(pointAt(g.segments, 0)).toEqual({ x: 400, y: 50 });
    const e = pointAt(g.segments, g.totalLength);
    expect(e.x).toBeCloseTo(160, 6);
    expect(e.y).toBeCloseTo(500, 6);
    const s = pointAt(g.segments, g.stationLengths[1]);
    expect(s.x).toBeCloseTo(100, 6);
    expect(s.y).toBeCloseTo(300, 6);
  });
});

describe("progressMap", () => {
  const f = progressMap([500, 900, 2000], [0, 300, 1200], 400);

  test("hits each station's length exactly when it reaches the viewport line", () => {
    expect(f(100)).toBe(0);
    expect(f(500)).toBe(300);
    expect(f(1600)).toBe(1200);
  });

  test("clamps at both ends", () => {
    expect(f(-50)).toBe(0);
    expect(f(99999)).toBe(1200);
  });

  test("is monotonic, even for out-of-order input", () => {
    const g = progressMap([500, 480, 900, 2000], [0, 100, 300, 1200], 400);
    let prev = -Infinity;
    for (let y = -100; y < 2000; y += 7) {
      const v = g(y);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  test("stations below the last scroll position are compressed into the final stretch, end reached at maxScroll", () => {
    // triggers at 100, 900, 1500, 1700; maxScroll 1000 compresses everything past 500 into 500..1000
    const g = progressMap([500, 1300, 1900, 2100], [0, 300, 900, 1000], 400, 1000);
    expect(g(100)).toBe(0);
    expect(g(1000)).toBe(1000);
    expect(g(500 + (400 * 500) / 1200)).toBeCloseTo(300, 6);
    expect(g(500 + (1000 * 500) / 1200)).toBeCloseTo(900, 6);
    let prev = -Infinity;
    for (let y = 0; y <= 1000; y += 5) {
      expect(g(y)).toBeGreaterThanOrEqual(prev);
      prev = g(y);
    }
  });
});

describe("scrollStops", () => {
  test("keyframes at the stops reproduce the head's position between them (scroll-driven animation)", () => {
    const g = buildPaths([pt("a", 200), pt("b", 300)], opts({ origin: { x: 400, y: 50 }, bus: 120, end: { x: 160, y: 900 } }));
    const ys = [50, 200, 300, 900];
    const pts = progressPoints(ys, [0, ...g.stationLengths, g.totalLength], 300, 700);
    const map = piecewise(pts);
    const floor = g.stationLengths[0];
    const at = (s: number) => pointAt(g.segments, Math.max(map(s), floor));
    const stops = scrollStops(pts, [floor, ...lengthKnots(g.segments)], 700);
    expect(stops[0]).toBe(0);
    expect(stops.at(-1)).toBe(700);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]).toBeGreaterThanOrEqual(stops[i - 1]);
      const [s0, s1] = [stops[i - 1], stops[i]];
      for (const t of [0.25, 0.5, 0.75]) {
        const s = s0 + (s1 - s0) * t;
        const [a, b, c] = [at(s0), at(s1), at(s)];
        expect(Math.hypot(a.x + (b.x - a.x) * t - c.x, a.y + (b.y - a.y) * t - c.y)).toBeLessThan(0.5);
      }
    }
  });
});

describe("scrollAt", () => {
  test("inverts the progress map: first scroll offset reaching a length, clamped", () => {
    const pts: [number, number][] = [[0, 0], [100, 50], [200, 50], [300, 150]];
    expect(scrollAt(pts, 25)).toBe(50);
    expect(scrollAt(pts, 50)).toBe(100); // first reached, not the end of the hold
    expect(scrollAt(pts, 100)).toBe(250);
    expect(scrollAt(pts, -5)).toBe(0);
    expect(scrollAt(pts, 999)).toBe(300);
  });
});

describe("taskHalves", () => {
  const box = { x0: 50, y0: 100, x1: 450, y1: 300 };
  const [up, down] = taskHalves({ x: 20, y: 130 }, box, 10);

  test("both halves leave the station together and meet halfway down the right edge", () => {
    expect(pointAt(up.segments, 30)).toEqual({ x: 50, y: 130 });
    expect(pointAt(down.segments, 30)).toEqual({ x: 50, y: 130 });
    for (const h of [up, down]) {
      const end = pointAt(h.segments, h.length);
      expect(end.x).toBeCloseTo(450, 6);
      expect(end.y).toBeCloseTo(200, 6);
    }
    // up: 30 + 20 (left) + arc + 380 (top) + arc + 90 (right); down: 30 + 160 + arc + 380 + arc + 90
    const arc = (Math.PI / 2) * 10;
    expect(up.length).toBeCloseTo(30 + 20 + 380 + 90 + 2 * arc, 6);
    expect(down.length).toBeCloseTo(30 + 160 + 380 + 90 + 2 * arc, 6);
    const top = pointAt(up.segments, 30 + 20 + arc + 100);
    expect(top.y).toBeCloseTo(100, 6);
    const bottom = pointAt(down.segments, 30 + 160 + arc + 100);
    expect(bottom.y).toBeCloseTo(300, 6);
    expect(up.d.startsWith("M20 130L50 130")).toBe(true);
  });

  test("a station above the box enters on the left edge's straight part", () => {
    expect(taskHalves({ x: 20, y: 0 }, box, 10)[0].segments[0].y1).toBe(110);
  });

  test("each half splits where it turns back in y, into legs monotone in x and y", () => {
    for (const [h, dys] of [[up, [-1, 1]], [down, [1, -1]]] as const) {
      const legs = monotoneLegs(h.segments);
      expect(legs.map((l) => l.dy)).toEqual([...dys]);
      expect(legs.every((l) => l.dx === 1)).toBe(true);
      expect(legs.reduce((n, l) => n + l.len, 0)).toBeCloseTo(h.length, 6);
      expect(legs[1].at).toBeCloseTo(legs[0].len, 6);
      // The turn is the last corner: the second leg starts where that corner arc does.
      expect(legs[1].segs[0].kind).toBe("arc");
      expect(legs[1].d.startsWith("M440 ")).toBe(true);
    }
  });
});

describe("pinnedPoints", () => {
  test("replaces breakpoints inside a pin with its own two, keeps the rest, stays monotonic", () => {
    const pts: [number, number][] = [[0, 0], [100, 100], [250, 200], [300, 260], [600, 400]];
    const out = pinnedPoints(pts, [{ from: 200, to: 500, l0: 180, l1: 380 }]);
    expect(out).toEqual([[0, 0], [100, 100], [200, 180], [500, 380], [600, 400]]);
    const f = piecewise(out);
    let prev = -Infinity;
    for (let s = 0; s <= 600; s += 3) {
      expect(f(s)).toBeGreaterThanOrEqual(prev);
      prev = f(s);
    }
    // a pin end beyond the next station's length holds instead of retreating
    expect(pinnedPoints([[0, 0], [400, 300]], [{ from: 100, to: 200, l0: 50, l1: 350 }])).toEqual([[0, 0], [100, 50], [200, 350], [400, 350]]);
  });
});

describe("keyframeOffsets", () => {
  test("sorts, clamps into [0, 1] and drops a repeated offset", () => {
    const out = keyframeOffsets([{ offset: 0.5, v: "b" }, { offset: -0.2, v: "a" }, { offset: 0.5, v: "x" }, { offset: 1.4, v: "c" }]);
    expect(out).toEqual([{ offset: 0, v: "a" }, { offset: 0.5, v: "b" }, { offset: 1, v: "c" }]);
  });
});

describe("isPassed", () => {
  test("fills a pad the trace has reached or jumped past, not one still ahead", () => {
    expect(isPassed(100, 100)).toBe(true);
    expect(isPassed(99.6, 100)).toBe(true);
    expect(isPassed(5000, 100)).toBe(true);
    expect(isPassed(99, 100)).toBe(false);
  });
});
