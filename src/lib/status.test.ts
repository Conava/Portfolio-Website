import { expect, test } from "bun:test";
import { createTranslator } from "next-intl";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import { statusLine } from "./status";
import type { EducationContent, Job, Locale, School, WorkContent } from "./types";

const job = (id: string, start: string, end: string | null, brief?: string) =>
  ({ id, company: id, role: `${id} role`, start, end, brief }) as Job;
const school = (id: string, start: string, end: string | null, brief?: string) =>
  ({ id, name: id, degree: "M.S.", field: "CS", start, end, brief }) as School;

const work: WorkContent = {
  jobs: [job("adobe", "2026-07", null, "Working student at Adobe"), job("otto", "2025-08", "2026-06"), job("ta", "2026-04", "2026-12", "TA")],
};
const education: EducationContent = {
  schools: [school("gatech", "2027-01", null, "M.S. in Computer Science at Georgia Tech"), school("uhh", "2022-10", "2026-12")],
};

const line = (today: string, locale: Locale = "en", w = work, e = education) => {
  const t = createTranslator({ locale, messages: locale === "de" ? de : en, namespace: "hero" });
  return statusLine(w, e, today, locale, (what, date) => t("statusFrom", { what, date }));
};

test("before the latest school starts: current jobs, then the school with its start month", () => {
  expect(line("2026-11")).toBe("Working student at Adobe. TA. M.S. in Computer Science at Georgia Tech from January 2027.");
});

test("an end month still counts as current; the month after it does not", () => {
  expect(line("2026-12")).toContain("TA.");
  expect(line("2027-01")).not.toContain("TA");
});

test("once the latest school has started it reads as current", () => {
  expect(line("2027-01")).toBe("Working student at Adobe. M.S. in Computer Science at Georgia Tech.");
  expect(line("2027-09")).toBe("Working student at Adobe. M.S. in Computer Science at Georgia Tech.");
});

test("an ended latest school and ended jobs drop out; no brief falls back to the plain facts", () => {
  const w = { jobs: [job("otto", "2025-08", "2026-06")] };
  const e = { schools: [school("uhh", "2022-10", "2026-12")] };
  expect(line("2027-02", "en", w, e)).toBe("");
  expect(line("2026-11", "en", { jobs: [job("acme", "2026-01", null)] }, e)).toBe("acme role, acme. M.S., CS, uhh.");
});

test("German uses the German month and phrasing", () => {
  const w = { jobs: [job("adobe", "2026-07", null, "Werkstudent bei Adobe")] };
  const e = { schools: [school("gatech", "2027-01", null, "M.S. in Informatik an der Georgia Tech")] };
  expect(line("2026-11", "de", w, e)).toBe("Werkstudent bei Adobe. M.S. in Informatik an der Georgia Tech ab Januar 2027.");
});
