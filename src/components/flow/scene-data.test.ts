import { expect, test } from "bun:test";
import { getHomeContent } from "@/lib/content";
import type { HomeContent, School } from "@/lib/types";
import { sceneData } from "./scene-data";

const school = (id: string, start: string, end: string | null, status: School["status"]) =>
  ({ id, start, end, status }) as School;
const withSchools = (schools: School[]) =>
  ({ bpmnscript: { sample: "a {\n  bb\n}" }, education: { schools } }) as unknown as HomeContent;

test("code lines keep their length and indent", () => {
  expect(sceneData(withSchools([]), "2026-11").code).toEqual([[3, 0], [2, 2], [1, 0]]);
});

test("schools sit on one time axis; an overlapping one stacks, an upcoming one is open-ended", () => {
  const d = sceneData(
    withSchools([
      school("ms", "2027-01", null, "upcoming"),
      school("bsc", "2022-10", "2026-11", "completed"),
      school("x", "2024-08", "2025-05", "completed"),
    ]),
    "2026-11",
  );
  expect(d.schools.map((s) => s.lane)).toEqual([0, 1, 0]);
  // item: where the school stands in the text
  expect(d.schools.map((s) => s.item)).toEqual([1, 2, 0]);
  expect(d.schools[0].x0).toBe(0);
  expect(d.schools[2].x1).toBe(1);
  expect(d.schools[2].upcoming).toBe(true);
  expect(d.schools[1].x0).toBeGreaterThan(d.schools[0].x0);
  expect(d.schools[1].x1).toBeLessThan(d.schools[0].x1);
});

test("an in-progress school is marked current", () => {
  const d = sceneData(withSchools([school("a", "2020-01", "2027-01", "in-progress"), school("b", "2018-01", "2019-12", "completed")]), "2021-01");
  expect(d.schools.map((s) => s.current)).toEqual([false, true]);
});

test("a current school without an end runs to today", () => {
  const d = sceneData(withSchools([school("a", "2020-01", null, "in-progress")]), "2021-01");
  expect(d.schools[0].x1).toBe(1);
});

test("counts come from the copy: services, the migration, OTTO's applications, one job per entry in text order", async () => {
  const d = sceneData(await getHomeContent("en"), "2026-11");
  expect(d.services).toBe(5);
  expect(d.migrate).toEqual([9, 10]);
  expect(d.intake).toBe(4);
  expect(d.jobs.map((j) => j.id)).toEqual(["otto", "uhh-ta", "msg-life"]);
  expect(d.jobs[0].months).toBe(11);
  expect(d.prs).toBe(6);
  // Dux Player with its plugins and dux-cast is one projects entry after devline, then the other four.
  expect(d.projects).toBe(5);
  expect(sceneData(await getHomeContent("de"), "2026-11")).toMatchObject({ services: 5, migrate: [9, 10], intake: 4 });
});

test("the devline run form follows the run's stages: gates where the run stops, the example's tasks, docs and end options", async () => {
  for (const l of ["en", "de"] as const) {
    const d = sceneData(await getHomeContent(l), "2026-11");
    expect(d.run).toEqual({ ids: ["idea", "route", "brainstorm", "design", "plan", "implement", "docs", "reviews", "deep-review", "final"], gates: [2, 4, 9], tasks: 3, docs: 3, options: 4 });
  }
});

test("each featured Dux PR stands for the part of the shell it changed, read from its title", async () => {
  const d = sceneData(await getHomeContent("en"), "2026-11");
  expect(d.duxParts).toEqual(["profiles", "monitor", "monitor", "network", "wallpaper", "bar"]);
  const pr = (title: string) => ({ ref: "x#1", title, blurb: "" });
  const c = { bpmnscript: { sample: "" }, dux: { featuredPrs: [pr("fix(bar): typo"), pr("docs: readme"), pr("feat(sysmon): x")], projects: [] } } as unknown as HomeContent;
  expect(sceneData(c, "2026-11").duxParts).toEqual(["bar", null, "monitor"]);
});

test("copy without a number still gives a whole form", () => {
  const d = sceneData(withSchools([]), "2026-11");
  expect(d.services).toBeGreaterThan(0);
  expect(d.migrate[0]).toBeLessThanOrEqual(d.migrate[1]);
  expect(d.jobs).toEqual([]);
  expect(d.intake).toBeGreaterThan(0);
  expect(d.run).toBeNull();
});

test("the real content fits the scene: at most 12 code lines, every school on the axis", async () => {
  for (const l of ["en", "de"] as const) {
    const d = sceneData(await getHomeContent(l), "2026-11");
    expect(d.code.length).toBeGreaterThan(0);
    expect(d.code.length).toBeLessThanOrEqual(12);
    for (const s of d.schools) expect(0 <= s.x0 && s.x0 < s.x1 && s.x1 <= 1).toBe(true);
  }
});
