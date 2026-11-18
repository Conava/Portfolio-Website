import { describe, expect, test } from "bun:test";
import { piecewise, segment, steps } from "./piecewise";
import { createSpring } from "./spring";
import { progressFor, smooth } from "./scroll-engine";

describe("piecewise maps", () => {
  test("segment maps p into a local 0..1 window, clamped", () => {
    expect(segment(0.4, 0.25, 0.55)).toBeCloseTo(0.5, 10);
    expect(segment(0.1, 0.25, 0.55)).toBe(0);
    expect(segment(0.9, 0.25, 0.55)).toBe(1);
  });

  test("piecewise interpolates linearly and clamps at the ends", () => {
    const f = piecewise([
      [0, 0],
      [0.5, 100],
      [1, 120],
    ]);
    expect(f(0.75)).toBeCloseTo(110, 10);
    expect(f(0.25)).toBeCloseTo(50, 10);
    expect(f(-1)).toBe(0);
    expect(f(2)).toBe(120);
  });

  test("steps returns an index 0..n", () => {
    expect(steps(0.99, 14)).toBe(13);
    expect(steps(0, 14)).toBe(0);
    expect(steps(1, 14)).toBe(14);
    expect(steps(-0.5, 14)).toBe(0);
  });
});

/** Steps a spring from 0 toward 1 at 60 Hz for `seconds`; returns peak and settle time. */
function run(stiffness: number, damping: number, seconds = 2) {
  const s = createSpring({ stiffness, damping }, 0);
  let peak = 0;
  let settledAt = Infinity;
  for (let i = 1; i <= seconds * 60; i++) {
    peak = Math.max(peak, s.step(1, 1 / 60));
    if (s.settled && settledAt === Infinity) settledAt = i / 60;
  }
  return { s, peak, settledAt };
}

describe("spring", () => {
  test("170/26 (Trace head) does not overshoot and settles within 1 s", () => {
    const { s, peak, settledAt } = run(170, 26);
    expect(peak).toBeLessThanOrEqual(1.0005);
    expect(settledAt).toBeLessThanOrEqual(1);
    expect(s.value).toBe(1);
    expect(s.velocity).toBe(0);
  });

  test("300/24 (Ink period tap) overshoots by about 3-7 %", () => {
    const { peak } = run(300, 24);
    expect(peak).toBeGreaterThan(1.03);
    expect(peak).toBeLessThan(1.07);
  });

  test("dt is capped at 1/30 s so a long frame cannot blow up", () => {
    const s = createSpring({ stiffness: 300, damping: 24 }, 0);
    expect(s.step(1, 5)).toBeLessThan(2);
  });

  test("retargets mid-flight from its current value and velocity", () => {
    const s = createSpring({ stiffness: 170, damping: 26 }, 0);
    for (let i = 0; i < 10; i++) s.step(1, 1 / 60);
    const mid = s.value;
    const v = s.velocity;
    expect(v).toBeGreaterThan(0);
    s.step(0, 1 / 60);
    // continuous: no jump, it keeps moving the same way for a moment
    expect(Math.abs(s.value - mid)).toBeLessThan(0.1);
    expect(s.settled).toBe(false);
  });
});

describe("progress math", () => {
  test("progressFor maps scroll into the pinned range, clamped", () => {
    expect(progressFor(500, 500, 1000)).toBe(0);
    expect(progressFor(1000, 500, 1000)).toBe(0.5);
    expect(progressFor(0, 500, 1000)).toBe(0);
    expect(progressFor(9999, 500, 1000)).toBe(1);
  });

  test("range <= 0 (static mode, no pin height) is the final state", () => {
    expect(progressFor(0, 500, 0)).toBe(1);
    expect(progressFor(0, 500, -200)).toBe(1);
  });

  test("smoothing 0 returns the target", () => {
    expect(smooth(0, 1, 1 / 60, 0)).toBe(1);
  });

  test("smoothing is the time to close 95 % of a step, frame-rate independent", () => {
    for (const hz of [30, 60, 144]) {
      let p = 0;
      for (let i = 0; i < hz * 0.5; i++) p = smooth(p, 1, 1 / hz, 0.5);
      expect(p).toBeCloseTo(0.95, 6);
    }
  });

  test("smoothing moves toward the target without passing it, in both directions", () => {
    const up = smooth(0.2, 0.8, 1 / 60, 0.5);
    expect(up).toBeGreaterThan(0.2);
    expect(up).toBeLessThan(0.8);
    const down = smooth(0.8, 0.2, 1 / 60, 0.5);
    expect(down).toBeLessThan(0.8);
    expect(down).toBeGreaterThan(0.2);
  });
});
