import { expect, test } from "bun:test";
import {
  formatDate, formatDateTime, formatDuration, formatLineChanges, formatMonth, formatNumber, formatPercent, formatRange, formatRelative,
} from "./format";

test("numbers and percent per locale", () => {
  expect(formatNumber(8963, "en")).toBe("8,963");
  expect(formatNumber(8963, "de")).toBe("8.963");
  expect(formatPercent(78, "en")).toBe("78.0%");
  expect(formatPercent(78, "de")).toBe("78,0 %");
  expect(formatPercent(78.25, "en", 0)).toBe("78%");
});

test("line changes use U+2212", () => {
  expect(formatLineChanges(16764, 2632, "en")).toBe("+16,764 −2,632");
  expect(formatLineChanges(1, 0, "de")).toBe("+1 −0");
});

test("months and ranges", () => {
  expect(formatMonth("2026-07", "en")).toBe("Jul 2026");
  expect(formatMonth("2026-07", "de")).toBe("Juli 2026");
  expect(formatRange("2026-07", null, "en", "present")).toBe("Jul 2026 – present");
  expect(formatRange("2026-07", null, "de", "heute")).toBe("Juli 2026 – heute");
  expect(formatRange("2025-08", "2026-06", "en", "present")).toBe("Aug 2025 – Jun 2026");
});

test("dates", () => {
  expect(formatDate("2026-10-31T12:00:00Z", "en")).toBe("Oct 31, 2026");
  expect(formatDate("2026-10-31T12:00:00Z", "de")).toBe("31. Okt. 2026");
  // Europe/Berlin with the zone named: summer and winter time.
  expect(formatDateTime("2026-10-31T12:00:00Z", "en")).toBe("Oct 31, 2026, 01:00 PM GMT+1");
  expect(formatDateTime("2026-07-01T12:00:00Z", "de")).toBe("1. Juli 2026, 14:00 MESZ");
});

test("invalid dates return the input", () => {
  expect(formatDate("nope", "en")).toBe("nope");
  expect(formatRelative("nope", new Date(), "en")).toBe("nope");
  expect(formatDateTime("nope", "en")).toBe("nope");
  expect(formatMonth("nope", "en")).toBe("nope");
});

test("relative time", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  expect(formatRelative("2026-11-09T11:48:00Z", now, "en")).toBe("12 min. ago");
  expect(formatRelative("2026-11-09T05:00:00Z", now, "en")).toBe("7 hr. ago");
  expect(formatRelative("2026-11-07T12:00:00Z", now, "en")).toBe("2 days ago");
  expect(formatRelative("2026-11-09T11:48:00Z", now, "de")).toBe("vor 12 Min.");
  // Under a minute is "now"; 60 s is the first minute.
  expect(formatRelative("2026-11-09T11:59:01Z", now, "en")).toBe("now");
  expect(formatRelative("2026-11-09T11:59:00Z", now, "en")).toBe("1 min. ago");
  // Future dates (clock skew) read forward.
  expect(formatRelative("2026-11-09T14:00:00Z", now, "en")).toBe("in 2 hr.");
  expect(formatRelative("2026-11-09T11:48:00Z", new Date(NaN), "en")).toBe("2026-11-09T11:48:00Z");
});

test("durations from content dates, months inclusive, years from two years on", () => {
  expect(formatDuration("2024-03", "2024-03", "en")).toBe("1 month");
  expect(formatDuration("2023-01", "2024-08", "en")).toBe("20 months");
  expect(formatDuration("2020-10", "2023-09", "en")).toBe("3 years");
  expect(formatDuration("2023-01", "2024-08", "de")).toBe("20 Monate");
  expect(formatDuration("2020-10", "2023-09", "de")).toBe("3 Jahre");
});
