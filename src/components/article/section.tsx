import type { ReactNode } from "react";
import { TrackedSection } from "@/components/analytics/tracked-section";
import { articleContext } from "./mdx-article";

/** One article section: its title and place come from `meta.sections`, so the contents list and the body agree. */
export function Section({ id, children }: { id: string; children?: ReactNode }) {
  const section = articleContext().data.meta.sections.find((s) => s.id === id);
  if (process.env.NODE_ENV !== "production") {
    if (!section) throw new Error(`<Section id="${id}"> is not listed in meta.sections`);
    if (id === "links") throw new Error(`<Section id="links"> is reserved for the article's link list`);
  }
  const heading = `${id}-title`;
  return (
    <TrackedSection id={id} aria-labelledby={heading} className="pj-body grid-12 ar-sec">
      <h2 id={heading}>{section?.title ?? id}</h2>
      {children}
    </TrackedSection>
  );
}
