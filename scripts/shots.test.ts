import { expect, test } from "bun:test";
import { parseOptions } from "./shots";

test("--frames must be a positive integer", () => {
  expect(parseOptions(["--frames", "3"]).frames).toBe(3);
  for (const bad of ["0", "-1", "x", "1.5"]) expect(() => parseOptions(["--frames", bad])).toThrow("--frames");
});

test("--frames defaults depend on the mode", () => {
  expect(parseOptions([]).frames).toBe(6);
  expect(parseOptions(["--frames-mode", "action", "--action", "click:a"]).frames).toBe(40);
});

test("frames-mode flags parse and pair --at with --action", () => {
  const o = parseOptions(["--", "--frames-mode", "action", "--action", "click:#a", "--action", "key:Escape", "--at", "0", "--at", "9", "--reduced"]);
  expect(o.actions).toEqual([{ kind: "click", arg: "#a", at: 0 }, { kind: "key", arg: "Escape", at: 9 }]);
  expect(o.reduced).toBe(true);
  expect(parseOptions(["--frames-mode", "scroll", "--target", "#x"]).steps).toBe(120);
  expect(() => parseOptions(["--frames-mode", "scroll"])).toThrow("--target");
  expect(() => parseOptions(["--frames-mode", "action", "--action", "tap:x"])).toThrow("--action");
  expect(() => parseOptions(["--frames-mode", "bogus"])).toThrow("--frames-mode");
  expect(() => parseOptions(["--unknown"])).toThrow();
});
