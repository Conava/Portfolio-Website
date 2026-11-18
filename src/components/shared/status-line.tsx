import { getTranslations } from "next-intl/server";
import type { SectionProps } from "@/components/home-types";
import { statusLine } from "@/lib/status";

/** The hero's one-line status (current jobs, the latest school), from content dates and `today`. */
export async function StatusLine({ content, locale, today, className }: Omit<SectionProps, "github"> & { className: string }) {
  const t = await getTranslations({ locale, namespace: "hero" });
  const text = statusLine(content.work, content.education, today, locale, (what, date) => t("statusFrom", { what, date }));
  return text ? <p className={className}>{text}</p> : null;
}
