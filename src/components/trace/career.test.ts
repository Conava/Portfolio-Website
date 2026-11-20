import { describe, expect, test } from "bun:test";
import { careerLayout, type CareerInput } from "./career";

const input: CareerInput[] = [
  { id: "a", band: "work", label: "A", start: "2023-01", end: "2023-12" },
  { id: "b", band: "work", label: "Teaching Assistant", start: "2023-06", end: "2023-08" },
  { id: "c", band: "work", label: "C", start: "2024-01", end: null },
  { id: "bsc", band: "edu", label: "B.Sc.", start: "2022-01", end: "2024-12" },
  { id: "ms", band: "edu", label: "M.S.", start: "2025-01", end: null },
];

describe("careerLayout", () => {
  const l = careerLayout(input, "2024-06");
  const t = Object.fromEntries(l.tasks.map((x) => [x.id, x]));

  test("work and education are separate lanes with their own overlap rows", () => {
    expect(l.rows).toEqual({ work: 2, edu: 1 });
    expect([t.a.row, t.b.row, t.c.row, t.bsc.row, t.ms.row]).toEqual([0, 1, 0, 0, 0]);
  });

  test("open-ended running entries stop on the today line; a set end is drawn up to it", () => {
    expect([t.a.kind, t.c.kind, t.bsc.kind, t.ms.kind]).toEqual(["done", "now", "now", "next"]);
    expect(t.c.x1).toBe(l.today);
    expect(t.bsc.x1).toBeGreaterThan(l.today);
    expect(careerLayout(input, "2024-09").today).toBeGreaterThan(l.today);
  });

  test("upcoming open entries run to the axis end; narrow tasks put their label outside", () => {
    expect(t.ms.x1).toBe(1);
    expect(t.b.out).toBe(true);
    expect(t.bsc.out).toBe(false);
    expect(l.ticks.map((k) => k.label)).toEqual(["2023", "2024", "2025"]);
  });
});
