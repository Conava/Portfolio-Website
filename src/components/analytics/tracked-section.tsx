"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { dwellBucket, trackEvent } from "@/lib/analytics";

/** A `<section id>` that sends one `section_view` with a dwell bucket per page view. */
export function TrackedSection({
  id,
  children,
  ...props
}: ComponentProps<"section"> & { id: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let total = 0;
    let since: number | null = null; // start of current visible stretch
    let sent = false;
    let visible = false; // last IntersectionObserver state

    const flush = () => {
      if (since !== null) {
        total += performance.now() - since;
        since = null;
      }
      const dwell = dwellBucket(total);
      if (dwell && !sent) {
        sent = true;
        trackEvent("section_view", { section: id, dwell });
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]; // latest state wins
        visible = entry.isIntersecting;
        if (entry.isIntersecting) {
          if (since === null && !sent) since = performance.now();
        } else if (since !== null) {
          flush();
        }
      },
      { rootMargin: "-50% 0px -50% 0px" }
    );
    io.observe(el);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
      else if (since === null && !sent && visible) since = performance.now();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    // No flush on cleanup: SPA unmounts drop the unsent dwell (the site is a
    // single page, so pagehide/visibilitychange cover real exits).
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [id]);

  return (
    <section {...props} id={id} ref={ref}>
      {children}
    </section>
  );
}
