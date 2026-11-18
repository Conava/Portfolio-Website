import { describe, expect, test } from "bun:test";
import { frameStats } from "./frame-stats";

const smooth = Array<number>(200).fill(16.7);

describe("frameStats", () => {
  test("passes a smooth run", () => {
    const s = frameStats(smooth, []);
    expect(s.frames).toBe(200);
    expect(s.p95).toBeCloseTo(16.7);
    expect(s.over50).toBe(0);
    expect(s.pass).toBe(true);
  });

  test("reports a hitch frame without failing; fails on a long task", () => {
    const hitch = frameStats([...smooth, 64], []);
    expect(hitch.over50).toBe(1);
    expect(hitch.pass).toBe(true);

    const long = frameStats(smooth, [51]);
    expect(long.longTasks).toBe(1);
    expect(long.maxLongTask).toBe(51);
    expect(long.pass).toBe(false);
  });

  test("fails when p95 exceeds 20 ms", () => {
    expect(frameStats(Array<number>(100).fill(25), []).pass).toBe(false);
  });

  test("empty input is not a failure", () => {
    expect(frameStats([], [])).toEqual({ frames: 0, p95: 0, over50: 0, longTasks: 0, maxLongTask: 0, pass: true });
  });
});
