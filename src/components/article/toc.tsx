"use client";

import { useEffect, useState } from "react";
import type { ArticleSection } from "@/lib/types";

/**
 * The article's contents list: plain anchor links (works without JS). With JS, the section
 * crossing the middle of the viewport is marked current; the skin shows it only where the
 * list stays in view (>= 1180 px).
 */
export function Toc({ sections, label }: { sections: ArticleSection[]; label: string }) {
  const [current, setCurrent] = useState<string | null>(null);
  const ids = sections.map((s) => s.id).join(" ");

  useEffect(() => {
    const els = ids
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    // Current = the last section that starts above the middle of the viewport; none above the
    // first. The last section also counts once it is fully in view (it may never reach the middle).
    const update = () => {
      const mid = innerHeight / 2;
      let cur: string | null = null;
      for (const el of els) if (el.getBoundingClientRect().top <= mid) cur = el.id;
      const last = els.at(-1);
      if (last && last.getBoundingClientRect().bottom <= innerHeight) cur = last.id;
      setCurrent(cur);
    };
    // The observers only say when to look again: a section edge crossed the middle, or the last one came fully into view.
    const middle = new IntersectionObserver(update, { rootMargin: "-50% 0px -50% 0px" });
    const end = new IntersectionObserver(update, { threshold: 1 });
    for (const el of els) middle.observe(el);
    if (els.length) end.observe(els[els.length - 1]);
    return () => {
      middle.disconnect();
      end.disconnect();
    };
  }, [ids]);

  return (
    <nav className="ar-toc" aria-label={label}>
      <p className="ar-toc-label" aria-hidden="true">
        {label}
      </p>
      <ol>
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} aria-current={s.id === current ? "true" : undefined}>
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
