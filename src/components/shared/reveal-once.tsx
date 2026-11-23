"use client";

import { useEffect, useRef, type ComponentProps } from "react";

/**
 * Sets `data-in` once, the first time `threshold` of the element is visible. It arms itself
 * (`data-armed`) only after mount, so with no JS the CSS shows the final state; the
 * stylesheet hides the element only while armed and not yet in.
 */
export function RevealOnce({ threshold = 0.5, ...props }: ComponentProps<"div"> & { threshold?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        el.dataset.in = "";
        io.disconnect();
      },
      { threshold },
    );
    el.dataset.armed = "";
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return <div ref={ref} {...props} />;
}
