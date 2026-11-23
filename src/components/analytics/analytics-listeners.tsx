"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { classifyClick, sectionOf, trackEvent, truncate } from "@/lib/analytics";

const DEPTHS = [25, 50, 75, 100] as const;

/** Mount once in the locale layout. Renders nothing. */
export function AnalyticsListeners() {
  const pathname = usePathname();

  // Outbound / resume / email clicks (capture phase; modified clicks count).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // A prevented click went nowhere (e.g. the resume link that opens the language chooser).
      if (e.defaultPrevented) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a) return;
      const hit = classifyClick(a.getAttribute("href") ?? "", location.origin);
      if (!hit) return;
      const section = sectionOf(a);
      if (hit.name === "outbound_click") {
        const label =
          a.getAttribute("data-track-label") ?? (a.textContent ?? "").trim();
        trackEvent("outbound_click", {
          host: hit.host,
          url: hit.url,
          label: truncate(label, 80),
          section,
        });
      } else if (hit.name === "resume_download") {
        trackEvent("resume_download", { section, version: hit.version });
      } else {
        trackEvent(hit.name, { section });
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Scroll depth: each threshold once per pathname.
  useEffect(() => {
    const fired = new Set<number>();
    let docHeight = 0;
    let queued = false;
    let raf = 0;
    let fresh = true; // re-measure on first scroll after navigation
    const measure = () => {
      docHeight = document.documentElement.scrollHeight;
    };
    const check = () => {
      queued = false;
      const total = docHeight - window.innerHeight;
      if (total <= 0) return;
      const pct = (window.scrollY / total) * 100;
      for (const d of DEPTHS) {
        if (pct >= d && !fired.has(d)) {
          fired.add(d);
          trackEvent("scroll_depth", { depth: d });
        }
      }
    };
    const onScroll = () => {
      if (queued) return;
      if (fresh) {
        fresh = false;
        measure();
      }
      queued = true;
      raf = requestAnimationFrame(check);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      window.removeEventListener("load", measure);
    };
  }, [pathname]);

  return null;
}
