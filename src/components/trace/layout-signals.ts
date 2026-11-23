/**
 * How far (px) the sticky ancestor of `el` has moved from its resting spot at the top of its
 * container, so a heading inside a pinned stage can be measured as if the pin had not engaged
 * (stage top minus its container's top). 0 when nothing above `el` is sticky. Measure-time only.
 */
export function stickyShift(el: Element): number {
  for (let n = el.parentElement; n?.parentElement; n = n.parentElement) {
    if (getComputedStyle(n).position === "sticky") return n.getBoundingClientRect().top - n.parentElement.getBoundingClientRect().top;
  }
  return 0;
}

/** Fired on window after a re-measure that changed the trace layer (its height counts toward the page height), so readers of the page height can re-read it. */
export const TRACE_MEASURED = "trace:measured";
