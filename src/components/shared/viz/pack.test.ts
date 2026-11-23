import { expect, test } from "bun:test";
import { packRows } from "./pack";

const m = (x: number, right = 3.5) => ({ x, left: 3.5, right });

test("marks that would touch stack; a free row is reused", () => {
  // 200 px plot: 0 and 10 px are 10 px apart, need 3.5 + 3.5 + 1.5 = 8.5.
  expect(packRows([m(0), m(0.05), m(0.06), m(0.5)], 200, 1.5)).toEqual([0, 0, 1, 0]);
});

test("a count label widens its mark", () => {
  expect(packRows([m(0, 3.5 + 10), m(0.05)], 200, 1.5)).toEqual([0, 1]);
});
