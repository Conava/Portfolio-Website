import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Ink pins from 900px, Trace from 960px. A media query can't read the breakpoint from a prop, and
// folding both into the 900 block would show Trace's pinned layout before hydration at 900-959.
test("the 900 and 960 pinned blocks stay identical", () => {
  const css = readFileSync(join(import.meta.dir, "player-scene.css"), "utf8");
  const block = (min: number) => {
    const start = css.indexOf(`and (min-width: ${min}px) {`);
    expect(start).toBeGreaterThan(-1);
    const end = css.indexOf("\n}\n", start);
    return css.slice(css.indexOf("\n", start), end).replaceAll(`[data-min="${min}"]`, "");
  };
  expect(block(960)).toBe(block(900));
});
