import { describe, expect, test } from "bun:test";
import { thin } from "./thin";

// Oct 2025 .. Nov 2026: 14 ticks, January at index 3.
const months = Array.from({ length: 14 }, (_, i) => i === 3);
// Jan 2025 .. Dec 2026: 24 ticks, Januaries at 0 and 12.
const twoYears = Array.from({ length: 24 }, (_, i) => i % 12 === 0);
const idx = (b: boolean[]) => b.flatMap((v, i) => (v ? [i] : []));

describe("thin", () => {
  test("keeps every January", () => {
    for (const max of [1, 4, 7, 14]) expect(thin(months, max)[3]).toBe(true);
    for (const max of [1, 4, 7]) expect(idx(thin(twoYears, max)).filter((i) => i % 12 === 0)).toEqual([0, 12]);
  });
  test("keeps the first tick unless a January sits too close for both labels", () => {
    expect(thin(months, 7)[0]).toBe(true); // 3 ticks apart, room for two dated labels at step 2
    expect(thin(months, 4)[0]).toBe(false); // step 4 needs 5
    expect(thin(months.map(() => false), 4)[0]).toBe(true);
  });
  test("shows about max labels, never closer than the step (one more beside a dated one)", () => {
    for (const [must, max] of [[months, 4], [months, 7], [twoYears, 4], [twoYears, 7]] as const) {
      const step = Math.ceil(must.length / max);
      const shown = idx(thin(must, max));
      expect(shown.length).toBeLessThanOrEqual(max + 2);
      shown.slice(1).forEach((v, k) => {
        const dated = must[v] || must[shown[k]] || shown[k] === 0;
        expect(v - shown[k]).toBeGreaterThanOrEqual(step + (dated ? 1 : 0));
      });
    }
  });
  test("a dated label leaves its neighbour a tick of room", () => {
    expect(thin([true, false, false], 7)).toEqual([true, false, true]);
  });
});
