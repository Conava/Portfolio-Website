"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

const WIDE = "(min-width: 760px)";
// Server render has no layout; the browser measures before paint.
const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The featured PRs as a Dux Shell bar: one tab per PR, and the selected PR's row hangs under the
 * bar as a connected popout (the bar-and-popout move from dux-shell#4129). `children` is the
 * server-rendered PR list; its rows become the tab panels, in order. Without JS or below 760px the
 * list stays a plain ledger.
 */
export function DuxBar({ labels, label, children }: { labels: string[]; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [wide, setWide] = useState(false);
  const [active, setActive] = useState(0);
  const [neck, setNeck] = useState<{ x: number; w: number; s: number; bw: number } | null>(null);

  useEffect(() => {
    const mq = matchMedia(WIDE);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Rows become tab panels; the active one is the popout.
  useEffect(() => {
    ref.current?.querySelector(".gh-list")?.[wide ? "setAttribute" : "removeAttribute"]("role", "presentation");
    const rows = Array.from(ref.current?.querySelectorAll<HTMLElement>(".gh-row") ?? []);
    rows.forEach((r, i) => {
      if (wide) {
        r.id = `dxb-panel-${i}`;
        r.setAttribute("role", "tabpanel");
        r.setAttribute("aria-labelledby", `dxb-tab-${i}`);
        r.toggleAttribute("data-active", i === active);
      } else {
        r.removeAttribute("role");
        r.removeAttribute("aria-labelledby");
        r.removeAttribute("data-active");
      }
    });
  }, [wide, active]);

  // The neck and highlight follow the active tab.
  useIso(() => {
    if (!wide) return;
    const measure = () => {
      const t = tabs.current[active];
      if (t) setNeck({ x: t.offsetLeft - (bar.current?.scrollLeft ?? 0), w: t.offsetWidth, s: bar.current?.scrollLeft ?? 0, bw: bar.current?.offsetWidth ?? 0 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    const b = bar.current;
    b?.addEventListener("scroll", measure);
    return () => {
      ro.disconnect();
      b?.removeEventListener("scroll", measure);
    };
  }, [wide, active]);

  const onKey = (e: KeyboardEvent) => {
    const n = labels.length;
    const next = { ArrowRight: active + 1, ArrowLeft: active - 1 + n, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActive(next % n);
    tabs.current[next % n]?.focus();
  };

  return (
    <div
      ref={ref}
      className="dxb"
      data-bar={wide ? "" : undefined}
      style={neck ? ({ "--nx": `${neck.x}px`, "--nw": `${neck.w}px`, "--ns": `${neck.s}px`, "--bw": `${neck.bw}px` } as CSSProperties) : undefined}
    >
      {wide && (
        <div ref={bar} className="dxb-bar" data-ink-dark="" role="tablist" aria-label={label} onKeyDown={onKey}>
          <span className="dxb-hl" aria-hidden="true" />
          {labels.map((l, i) => (
            <button
              key={l}
              ref={(el) => void (tabs.current[i] = el)}
              id={`dxb-tab-${i}`}
              type="button"
              role="tab"
              className="dxb-tab"
              aria-selected={i === active}
              aria-controls={`dxb-panel-${i}`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      {wide && <span className="dxb-neck" data-ink-dark="" aria-hidden="true" />}
      <div className="dxb-pop" data-ink-dark={wide ? "" : undefined}>
        {children}
      </div>
    </div>
  );
}
