import { expect, test } from "bun:test";
import { analyze, changedBox, diffRatio } from "./frame-diff";

const img = (w: number, h: number) => new Uint8Array(w * h * 4).fill(255);

test("diffRatio counts pixels whose max channel delta exceeds the threshold", () => {
  const a = img(10, 10);
  expect(diffRatio(a, a.slice())).toBe(0);
  const b = a.slice();
  b[4 * 37 + 1] = 55; // one pixel, green -200
  expect(diffRatio(a, b)).toBe(0.01);
  const c = a.slice();
  c[0] = 250; // -5, under the default threshold
  expect(diffRatio(a, c)).toBe(0);
  expect(() => diffRatio(a, img(5, 5))).toThrow();
});

test("changedBox bounds the changed pixels", () => {
  const a = img(10, 10);
  const b = a.slice();
  b[4 * (2 * 10 + 3)] = 0; // (3,2)
  b[4 * (5 * 10 + 7)] = 0; // (7,5)
  expect(changedBox(a, b, 10)).toEqual({ x: 3, y: 2, w: 5, h: 4 });
  expect(changedBox(a, a, 10)).toBeNull();
});

test("analyze: smooth ramp has no spikes", () => {
  const ramp = Array.from({ length: 30 }, (_, i) => 0.01 + i * 0.001);
  expect(analyze(ramp).spikes).toEqual([]);
});

test("analyze: a single jump is one spike", () => {
  const r = Array(20).fill(0.01);
  r[10] = 0.2;
  expect(analyze(r).spikes).toEqual([10]);
});

test("analyze: a flat run in the middle of motion is a dead stretch; trailing rest is not", () => {
  const r = [0.02, 0.02, 0.02, ...Array(8).fill(0), 0.02, 0.02, ...Array(10).fill(0)];
  const a = analyze(r);
  expect(a.dead).toEqual([[3, 10]]);
  expect(a.firstResponse).toBe(0);
});

test("analyze: all zeros has no first response", () => {
  expect(analyze(Array(10).fill(0))).toEqual({ spikes: [], dead: [], firstResponse: null });
});
