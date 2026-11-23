// Client-safe: design.ts imports next/headers, so client components import from here.
export const DESIGNS = ["keynote", "thread", "flow", "type"] as const;
export type Design = (typeof DESIGNS)[number];
export const DESIGN_LABELS: Record<Design, string> = {
  keynote: "Ink",
  thread: "Trace",
  flow: "Flow",
  type: "Type",
};

export function isDesign(value: unknown): value is Design {
  return typeof value === "string" && (DESIGNS as readonly string[]).includes(value);
}

/** The designs a `DESIGNS` comma list names, in DESIGNS order; unset, empty or nothing valid means all of them. */
export function parseDesigns(value: string | undefined): readonly Design[] {
  const listed = (value ?? "").split(",").map((s) => s.trim());
  const enabled = DESIGNS.filter((d) => listed.includes(d));
  return enabled.length ? enabled : DESIGNS;
}

/** The design after `current` among the enabled ones, wrapping around: the header icon steps through them. */
export function nextDesign(current: Design, enabled: readonly Design[] = DESIGNS): Design {
  return enabled[(enabled.indexOf(current) + 1) % enabled.length];
}
