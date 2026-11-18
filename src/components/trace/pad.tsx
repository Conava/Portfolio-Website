import "./trace.css";

/**
 * A Trace station: an anchor to `#station` that sits on the trace in the left gutter
 * (styles in trace.css). Server-friendly on purpose; the trace layer finds pads by their
 * data attributes, sets `--lane` and the overlap sentence (`data-tip`) on merge pads,
 * `data-passed` as the lit line passes, and turns clicks into a smooth scroll.
 * Sections tune the vertical spot with `--pad-y` (default: the middle of the first line).
 */
export function Pad({
  station,
  label,
  kind,
  entryId,
}: {
  station: string;
  label: string;
  kind: "section" | "entry";
  entryId?: string;
}) {
  return (
    <a
      className="pad"
      href={`#${station}`}
      data-station={station}
      data-kind={kind}
      data-entry={entryId}
      data-tip={label}
      data-tip-align="start"
      aria-label={label}
    />
  );
}
