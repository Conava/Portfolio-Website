import type { Locale, YearMonth } from "./types";

const MINUS = "−";
const NNBSP = " ";

const valid = (d: Date) => !Number.isNaN(d.getTime());

export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(n);
}

/** EN "78.0%"; DE "78,0 %" with a narrow no-break space (Intl's own percent style uses U+00A0). */
export function formatPercent(value: number, locale: Locale, digits = 1): string {
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  return locale === "de" ? `${n}${NNBSP}%` : `${n}%`;
}

export function formatLineChanges(additions: number, deletions: number, locale: Locale): string {
  return `+${formatNumber(additions, locale)} ${MINUS}${formatNumber(deletions, locale)}`;
}

export function formatMonth(ym: YearMonth, locale: Locale, month: "short" | "long" = "short"): string {
  const d = new Date(`${ym}-01T00:00:00Z`);
  if (!valid(d)) return ym;
  return new Intl.DateTimeFormat(locale, { month, year: "numeric", timeZone: "UTC" }).format(d);
}

export function formatRange(start: YearMonth, end: YearMonth | null, locale: Locale, presentLabel: string): string {
  return `${formatMonth(start, locale)} – ${end ? formatMonth(end, locale) : presentLabel}`;
}

/** How long a dated entry ran, months inclusive, whole years from two years on ("8 months", "3 Jahre"). */
export function formatDuration(start: YearMonth, end: YearMonth, locale: Locale): string {
  const m = (+end.slice(0, 4) - +start.slice(0, 4)) * 12 + (+end.slice(5) - +start.slice(5)) + 1;
  const [n, unit] = m >= 24 ? [Math.round(m / 12), "year"] : [m, "month"];
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(n);
}

export function formatDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (!valid(d)) return iso;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

/** Date and time in the site owner's zone, with the zone named ("CET"/"MEZ"), so the tooltip is unambiguous. */
export function formatDateTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (!valid(d)) return iso;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
    timeZoneName: "short",
  }).format(d);
}

/** Relative to `now`; under a minute reads "now" via numeric: "auto". An invalid date or `now` returns `iso`. */
export function formatRelative(iso: string, now: Date, locale: Locale): string {
  const d = new Date(iso);
  if (!valid(d) || !valid(now)) return iso;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const sec = Math.round((d.getTime() - now.getTime()) / 1000);
  if (Math.abs(sec) < 60) return rtf.format(0, "second");
  if (Math.abs(sec) < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (Math.abs(sec) < 86400) return rtf.format(Math.round(sec / 3600), "hour");
  return rtf.format(Math.round(sec / 86400), "day");
}
