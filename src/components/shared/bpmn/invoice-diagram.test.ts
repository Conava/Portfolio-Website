import { expect, test } from "bun:test";
import { edgeLength } from "./invoice-diagram";

test("edgeLength sums straight runs and a corner's control polygon, rounded up plus one", () => {
  expect(edgeLength("M93,70L175,70")).toBe(83);
  // 110 down, a 5+5 corner, 95 across
  expect(edgeLength("M375,95L375,205Q375,210 380,210L475,210")).toBe(216);
});
