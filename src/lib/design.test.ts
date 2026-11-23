import { expect, test } from "bun:test";
import { DESIGN_LABELS, DESIGNS, resolveDesign, type Design } from "./design";
import { nextDesign, parseDesigns } from "./design-values";

test("precedence: cookie > env > fallback", () => {
  expect(resolveDesign({ cookie: "thread", env: "keynote", fallback: "keynote" })).toBe("thread");
  expect(resolveDesign({ cookie: null, env: "thread", fallback: "keynote" })).toBe("thread");
  expect(resolveDesign({ cookie: null, env: null, fallback: "keynote" })).toBe("keynote");
});

test("invalid or empty values are ignored per level", () => {
  expect(resolveDesign({ cookie: "atelier", env: "THREAD", fallback: "keynote" })).toBe("keynote");
  expect(resolveDesign({ cookie: "", env: "thread", fallback: "keynote" })).toBe("thread");
});

test("flow and type are designs; the header icon cycles through all four", () => {
  expect(resolveDesign({ cookie: "flow", env: "thread", fallback: "keynote" })).toBe("flow");
  expect(resolveDesign({ cookie: null, env: "type", fallback: "keynote" })).toBe("type");
  expect(DESIGN_LABELS.flow).toBe("Flow");
  expect(DESIGN_LABELS.type).toBe("Type");
  const seen: Design[] = [DESIGNS[0]];
  for (let i = 1; i < DESIGNS.length; i++) seen.push(nextDesign(seen[i - 1]));
  expect(seen).toEqual(["keynote", "thread", "flow", "type"]);
  expect(nextDesign("type")).toBe("keynote");
});

test("DESIGNS env: a comma list enables only those designs; unset, empty or nothing valid enables all", () => {
  expect(parseDesigns("keynote,type")).toEqual(["keynote", "type"]);
  expect(parseDesigns(" type , keynote,atelier")).toEqual(["keynote", "type"]);
  for (const v of [undefined, "", "atelier"]) expect(parseDesigns(v)).toEqual([...DESIGNS]);
});

test("disabled designs are ignored in cookie and env; a disabled default falls back to the first enabled", () => {
  const enabled = ["keynote", "type"] as const;
  expect(resolveDesign({ cookie: "flow", env: "thread", fallback: "keynote", enabled })).toBe("keynote");
  expect(resolveDesign({ cookie: "type", env: null, fallback: "keynote", enabled })).toBe("type");
  expect(resolveDesign({ cookie: null, env: null, fallback: "flow", enabled: ["thread", "type"] })).toBe("thread");
});

test("the header icon cycles through the enabled designs only", () => {
  expect(nextDesign("keynote", ["keynote", "type"])).toBe("type");
  expect(nextDesign("type", ["keynote", "type"])).toBe("keynote");
});
