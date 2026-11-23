"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { InkCanvas, type InkSplatDetail } from "@/components/ink/ink-canvas";
import { createSpring } from "@/lib/motion/spring";

const FALLBACK = { light: "/images/ink/ink-light.avif", dark: "/images/ink/ink-dark.avif" };
const WET = 1.12;

/**
 * The hero section with the ink canvas behind it and the name, whose period is
 * the splat origin. Server-rendered content (lede, facts, CTAs) comes in as
 * children so only the name and the period need client code.
 *
 * The period is `aria-hidden`: it is a decorative toy (ink and a little spring),
 * not a control, so it carries no accessible name and takes no focus. Its
 * hit area is enlarged by CSS for pointer and touch.
 */
export function HeroStage({ first, last, children }: { first: string; last: string; children: ReactNode }) {
  const periodRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const dot = periodRef.current;
    if (!dot) return;
    const rm = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    // ponytail: JS spring on purpose, the one overshoot on the site (300/24, ~5 %); a CSS
    // cubic-bezier with y > 1 would break the no-bounce-easing rule for CSS.
    const spring = createSpring({ stiffness: 300, damping: 24 }, 1);
    let target = 1;
    let raf = 0;
    let last = 0;
    let release: ReturnType<typeof setTimeout> | undefined;

    const frame = (t: number) => {
      const v = spring.step(target, last ? (t - last) / 1000 : 1 / 60);
      last = t;
      dot.style.transform = v === 1 ? "" : `scale(${v.toFixed(4)})`;
      raf = spring.settled ? 0 : requestAnimationFrame(frame);
    };
    const go = (to: number) => {
      target = to;
      if (rm.matches) return; // reduced motion: no scale at all
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    const enter = () => fine.matches && go(WET);
    const leave = () => fine.matches && go(1);
    const down = () => go(0.97);
    const click = () => {
      clearTimeout(release);
      go(WET);
      // Touch has no hover state to return from: settle back after the overshoot.
      if (!fine.matches) release = setTimeout(() => go(1), 320);
      const r = dot.getBoundingClientRect();
      // The dot glyph sits on the baseline, about 77 % down the line box (measured at 1440 and 375).
      const detail: InkSplatDetail = { x: r.left + r.width / 2, y: r.top + r.height * 0.77 };
      dot.dispatchEvent(new CustomEvent("ink:splat", { detail, bubbles: true }));
    };
    dot.addEventListener("pointerenter", enter);
    dot.addEventListener("pointerleave", leave);
    dot.addEventListener("pointerdown", down);
    dot.addEventListener("click", click);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(release);
      dot.removeEventListener("pointerenter", enter);
      dot.removeEventListener("pointerleave", leave);
      dot.removeEventListener("pointerdown", down);
      dot.removeEventListener("click", click);
      dot.style.transform = "";
    };
  }, []);

  return (
    <section id="top" data-tone="paper" className="ink-hero">
      <InkCanvas originRef={periodRef} fallback={FALLBACK} />
      <div className="wrap grid-12 ink-hero-in">
        <h1 className="t-name ink-hero-name">
          <span className="l">{first}</span>{" "}
          <span className="l">
            {last}
            <span ref={periodRef} className="period" data-trace-origin aria-hidden="true">
              .
            </span>
          </span>
        </h1>
        {children}
      </div>
    </section>
  );
}
