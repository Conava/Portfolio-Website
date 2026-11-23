import { describe, expect, test } from "bun:test";
import { createGesture, queueStep, releases, stageFromScroll, wheelStep } from "./stepper";

/** Feeds wheel events `[time ms, deltaY]` and returns the steps they produced. */
const feed = (events: [number, number][]) => {
  const g = createGesture();
  return events.map(([t, dy]) => wheelStep(g, t, dy)).filter((d) => d !== 0);
};

describe("one scroll gesture is one stage", () => {
  test("one wheel notch steps one stage in its direction", () => {
    expect(feed([[1000, 100]])).toEqual([1]);
    expect(feed([[1000, -100]])).toEqual([-1]);
  });

  test("a trackpad burst of 15 small deltas steps one stage only", () => {
    expect(feed(Array.from({ length: 15 }, (_, i) => [1000 + 16 * i, 4 + (i % 3)] as [number, number]))).toEqual([1]);
  });

  test("momentum that keeps decaying for seconds never steps a second time", () => {
    const tail = Array.from({ length: 180 }, (_, i) => [1000 + 16 * i, Math.max(1, 60 * 0.98 ** i)] as [number, number]);
    expect(feed(tail)).toEqual([1]);
  });

  test("the next gesture after a pause steps again, also backwards", () => {
    expect(feed([[1000, 100], [1030, 100], [1300, 100], [1600, -100]])).toEqual([1, 1, -1]);
  });

  test("a fresh push inside a long gesture steps again once the stage is readable", () => {
    const slow = Array.from({ length: 90 }, (_, i) => [1000 + 16 * i, 3] as [number, number]);
    expect(feed([...slow, [1000 + 16 * 90, 40]])).toEqual([1, 1]);
  });

  test("a trackpad burst that stalls on a busy main thread (a gap in its events) still steps one stage only", () => {
    const burst = (t0: number) => Array.from({ length: 5 }, (_, i) => [t0 + 16 * i, 6] as [number, number]);
    expect(feed([...burst(1000), ...burst(1300), ...burst(1700)])).toEqual([1]);
  });

  test("a decaying fling that stalls on a busy main thread steps one stage only", () => {
    const fling = Array.from({ length: 60 }, (_, i) => [1000 + 16 * i + (i >= 8 ? 250 : 0), Math.max(1, Math.round(50 * 0.94 ** i))] as [number, number]);
    expect(feed(fling)).toEqual([1]);
  });

  test("a fresh push before the stage is readable does not step", () => {
    expect(feed([[1000, 3], [1016, 3], [1032, 40]])).toEqual([1]);
  });
});

describe("queue, ends and scroll position", () => {
  test("at most one step is queued ahead of what is playing", () => {
    expect(queueStep(4, 1, 3.4, 8)).toBe(5);
    expect(queueStep(5, 1, 3.4, 8)).toBe(5);
    expect(queueStep(4, -1, 3.4, 8)).toBe(3);
    expect(queueStep(8, 1, 8, 8)).toBe(8);
    expect(queueStep(0, -1, 0, 8)).toBe(0);
  });

  test("normal page scroll is released above the first stage and below the last", () => {
    expect(releases(0, -10, 8)).toBe(true);
    expect(releases(8, 10, 8)).toBe(true);
    expect(releases(0, 10, 8)).toBe(false);
    expect(releases(8, -10, 8)).toBe(false);
    expect(releases(4, 10, 8)).toBe(false);
  });

  test("a scroll position picks the nearest stage; outside the scene it is not pinned", () => {
    expect(stageFromScroll(1000, 1000, 300, 8)).toBe(0);
    expect(stageFromScroll(1000 + 3 * 300 + 140, 1000, 300, 8)).toBe(3);
    expect(stageFromScroll(1000 + 3 * 300 + 160, 1000, 300, 8)).toBe(4);
    expect(stageFromScroll(1000 + 8 * 300, 1000, 300, 8)).toBe(8);
    expect(stageFromScroll(990, 1000, 300, 8)).toBe(-1);
    expect(stageFromScroll(1000 + 8 * 300 + 10, 1000, 300, 8)).toBe(-1);
  });
});
