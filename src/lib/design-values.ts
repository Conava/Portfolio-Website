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

/** The design after `current` in DESIGNS, wrapping around: the header icon steps through all of them. */
export function nextDesign(current: Design): Design {
  return DESIGNS[(DESIGNS.indexOf(current) + 1) % DESIGNS.length];
}
