import { describe, expect, test } from "bun:test";
import { CAP, emWidth, fitWord } from "./word-fit";
import { pickCounter } from "./glyph";

describe("fitWord", () => {
  test("desktop keeps short words expanded and narrows long ones until the capitals reach 5vw", () => {
    expect(fitWord("Dux", "desktop").stretch).toBe(125);
    const long = fitWord("Berufserfahrung", "desktop");
    expect(long.stretch).toBeLessThan(125);
    expect(long.vw * CAP).toBeGreaterThanOrEqual(5);
  });

  test("the fitted word spans 88% of the viewport width", () => {
    for (const w of ["Marlon Kranz", "Work", "Ausbildung", "BPMNscript"]) {
      const f = fitWord(w, "desktop");
      expect(emWidth(w.toUpperCase(), f.stretch) * f.vw).toBeCloseTo(88, 0);
    }
  });

  test("phone breaks at spaces and sizes by the longest line", () => {
    const f = fitWord("Marlon Kranz", "phone");
    expect(f.lines).toEqual(["MARLON", "KRANZ"]);
    expect(f.stretch).toBe(62.5);
    expect(emWidth("MARLON", 62.5) * f.vw).toBeCloseTo(88, 0);
    // two lines share the same height budget as one
    expect(f.vh).toBeLessThan(fitWord("Dux", "phone").vh);
  });
});

describe("pickCounter", () => {
  test("prefers an O, nearest the middle", () => {
    expect(pickCounter([..."MARLONKRANZ"])).toBe(4);
    expect(pickCounter([..."PROJECTS"])).toBe(2);
  });
  test("falls back through the ranked counters, or -1", () => {
    expect(pickCounter([..."DUX"])).toBe(0);
    expect(pickCounter([..."BERUFSERFAHRUNG"])).toBeGreaterThan(-1);
    expect(pickCounter([..."XYZ"])).toBe(-1);
  });
});
