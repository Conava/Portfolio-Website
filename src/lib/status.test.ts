import { expect, test } from "bun:test";
import { statusLines } from "./status";
import type { EducationContent, Job, School, WorkContent } from "./types";

const job = (id: string, start: string, end: string | null, brief?: string) =>
  ({ id, company: id, role: `${id} role`, start, end, brief }) as Job;
const school = (id: string, start: string, end: string | null, brief?: string) =>
  ({ id, name: id, degree: "M.S.", field: "CS", start, end, brief }) as School;

const work: WorkContent = {
  jobs: [job("adobe", "2026-07", null, "Cloud Software Engineer at Adobe"), job("otto", "2025-08", "2026-06"), job("ta", "2026-04", "2026-12", "TA")],
};
const education: EducationContent = {
  schools: [school("gatech", "2027-01", null, "CS master's student at Georgia Tech"), school("uhh", "2022-10", "2026-12")],
};

test("current jobs, then the latest school, upcoming or running, without its start date", () => {
  expect(statusLines(work, education, "2026-11")).toEqual(["Cloud Software Engineer at Adobe", "TA", "CS master's student at Georgia Tech"]);
  expect(statusLines(work, education, "2027-09")).toEqual(["Cloud Software Engineer at Adobe", "CS master's student at Georgia Tech"]);
});

test("an end month still counts as current; the month after it does not", () => {
  expect(statusLines(work, education, "2026-12")).toContain("TA");
  expect(statusLines(work, education, "2027-01")).not.toContain("TA");
});

test("an ended latest school and ended jobs drop out; no brief falls back to the plain facts", () => {
  const w = { jobs: [job("otto", "2025-08", "2026-06")] };
  const e = { schools: [school("uhh", "2022-10", "2026-12")] };
  expect(statusLines(w, e, "2027-02")).toEqual([]);
  expect(statusLines({ jobs: [job("acme", "2026-01", null)] }, e, "2026-11")).toEqual(["acme role, acme", "M.S., CS, uhh"]);
});
