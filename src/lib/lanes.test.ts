import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { computeLanes, toYearMonth, type DatedEntry } from "./lanes";

const e = (id: string, start: string, end: string | null): DatedEntry => ({ id, label: id, start, end });

describe("computeLanes", () => {
  test("real data shape", () => {
    const r = computeLanes(
      [
        e("uhh", "2022-10", "2026-11"), e("msg", "2023-10", "2024-07"), e("sdsu", "2024-08", "2025-05"),
        e("otto", "2025-08", "2026-06"), e("ta", "2026-04", "2026-07"), e("adobe", "2026-07", null),
        e("gatech", "2027-01", null),
      ],
      "2026-11",
    );
    expect(r.lane).toEqual({ uhh: 0, msg: 1, sdsu: 1, otto: 1, ta: 2, adobe: 1, gatech: 0 });
    expect(r.maxLane).toBe(2);
    expect(r.overlaps).toContainEqual({ a: "uhh", b: "otto", start: "2025-08", end: "2026-06" });
    const starts = r.overlaps.map((o) => o.start);
    expect(starts).toEqual([...starts].sort());
  });

  test("real content files (en and de): UHH on the spine, three lanes at most", () => {
    for (const l of ["en", "de"]) {
      const read = (f: string) => JSON.parse(readFileSync(`content/${l}/data/${f}.json`, "utf8"));
      const items = [...read("work").jobs, ...read("education").schools] as DatedEntry[];
      const r = computeLanes(items.map((x) => e(x.id, x.start, x.end)), "2026-11");
      expect(r.lane["uhh"]).toBe(0);
      expect(r.maxLane).toBe(2);
      expect(r.overlaps.length).toBeGreaterThan(0);
    }
  });

  test("no overlap: all on lane 0", () => {
    const r = computeLanes([e("a", "2020-01", "2020-12"), e("b", "2021-01", "2021-12")], "2026-11");
    expect(r.lane).toEqual({ a: 0, b: 0 });
    expect(r.overlaps).toEqual([]);
    expect(r.maxLane).toBe(0);
  });

  test("a future entry overlaps nothing that ends before it starts", () => {
    const r = computeLanes([e("a", "2026-01", "2026-12"), e("f", "2027-01", null)], "2026-11");
    expect(r.overlaps).toEqual([]);
    expect(r.lane.f).toBe(0);
  });

  test("empty input", () => {
    expect(computeLanes([], "2026-11")).toEqual({ lane: {}, overlaps: [], maxLane: 0 });
  });
});

test("toYearMonth", () => {
  expect(toYearMonth(new Date(Date.UTC(2026, 10, 9)))).toBe("2026-11");
  // UTC, not the local zone: the last minutes of a UTC month stay in it.
  expect(toYearMonth(new Date("2026-11-30T23:59:00Z"))).toBe("2026-11");
  expect(toYearMonth(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12");
});
