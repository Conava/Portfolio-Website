import { expect, test } from "bun:test";
import { inkSwapNow } from "./tone-bands";

test("towards dark: swap once the scene layer reaches half opacity", () => {
  expect(inkSwapNow(true, 0)).toBe(false);
  expect(inkSwapNow(true, 0.49)).toBe(false);
  expect(inkSwapNow(true, 0.5)).toBe(true);
  expect(inkSwapNow(true, 1)).toBe(true);
});

test("towards light: swap once the scene layer falls to half opacity", () => {
  expect(inkSwapNow(false, 1)).toBe(false);
  expect(inkSwapNow(false, 0.51)).toBe(false);
  expect(inkSwapNow(false, 0.5)).toBe(true);
  expect(inkSwapNow(false, 0)).toBe(true);
});
