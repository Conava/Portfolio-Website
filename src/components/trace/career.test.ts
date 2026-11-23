import { describe, expect, test } from "bun:test";
import type { HomeContent, School } from "@/lib/types";
import { careerInputs, careerLayout, type CareerInput } from "./career";

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

  test("running entries are solid up to the today line and continue dotted to their end or the axis end", () => {
    expect([t.a.kind, t.c.kind, t.bsc.kind, t.ms.kind]).toEqual(["done", "now", "now", "next"]);
    expect(t.c.x1).toBe(l.today);
    expect(t.c.ahead).toBe(1);
    expect(t.bsc.x1).toBe(l.today);
    expect(t.bsc.ahead).toBeCloseTo(t.ms.x0);
    expect([t.a.ahead, t.ms.ahead]).toEqual([null, null]);
    expect(careerLayout(input, "2024-09").today).toBeGreaterThan(l.today);
  });

  test("upcoming open entries run to the axis end", () => {
    expect(t.ms.x1).toBe(1);
    expect(t.bsc.out).toBe(false);
    expect(l.ticks.map((k) => k.label)).toEqual(["2023", "2024", "2025"]);
  });

  test("a short overlapping entry keeps its label inside: two lines, its box widened to the left, its end kept", () => {
    // Axis 2022-01 through 2025-07 (43 months). "Assistant", 9 characters, needs 9 x 0.55 + 1 months.
    expect(t.b).toMatchObject({ out: false, wrap: true });
    expect(t.b.x1).toBeCloseTo(20 / 43, 10);
    expect(t.b.x0).toBeCloseTo((20 - 5.95) / 43, 10);
  });

  test("a short entry on a lane's first row still puts its label outside", () => {
    const first = careerLayout([{ id: "x", band: "work", label: "Teaching Assistant", start: "2023-06", end: "2023-08" }, input[3]], "2024-06");
    const x = first.tasks.find((k) => k.id === "x")!;
    expect(x).toMatchObject({ out: true, wrap: false });
  });
});

describe("careerInputs", () => {
  const school = (o: Partial<School>) =>
    ({ id: "s", name: "Uni", degree: "M.S.", field: "Computer Science", start: "2027-01", end: null, ...o }) as School;
  const labels = (schools: School[]) =>
    careerInputs({ work: { jobs: [] }, education: { schools } } as unknown as HomeContent).map((x) => x.label);

  test("a school's short label from content names the degree when the long one does not fit", () => {
    expect(labels([school({ short: "M.S. CS" })])).toEqual(["M.S. CS"]);
    expect(labels([school({})])).toEqual(["M.S."]);
  });
});
