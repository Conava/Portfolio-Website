import type { SectionProps } from "@/components/home-types";
import { statusLines } from "@/lib/status";

/** The hero's status (current jobs, the latest school), one per line, from content dates and `today`. */
export function StatusLine({ content, today, className }: Omit<SectionProps, "github"> & { className: string }) {
  const lines = statusLines(content.work, content.education, today);
  return lines.length ? (
    <p className={className}>
      {lines.map((l, i) => (
        <span key={l} style={{ display: "block" }}>
          {l}
          {i < lines.length - 1 && <span className="sr-only">. </span>}
        </span>
      ))}
    </p>
  ) : null;
}
