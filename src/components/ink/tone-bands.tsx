"use client";

import { useEffect } from "react";

const MAX_FOLLOW_MS = 1000;

/**
 * Whether the text palette should flip now. The scene layer's opacity is the
 * ground's darkness; the palette flips once it has crossed mid-gray on its way
 * to the target side.
 */
export function inkSwapNow(targetDark: boolean, sceneOpacity: number) {
  return targetDark ? sceneOpacity >= 0.5 : sceneOpacity <= 0.5;
}

/**
 * Sets `data-tone-active` on <html> to the tone of the `[data-tone]` block on the
 * line 40 % down the viewport (or the footer's, once the footer is fully in view,
 * so a short last section still gets its band), and `data-tone-ink` when the
 * crossfading ground passes mid-gray. chrome.css turns those into one crossfading
 * ground and a text palette swap; without JS or under reduced motion each block
 * keeps its own static background.
 */
export function ToneBands() {
  useEffect(() => {
    const root = document.documentElement;
    const footer = document.querySelector<HTMLElement>(".ink-ftr[data-tone]");
    const onLine = new Set<Element>();
    let atEnd = false;
    let first = true;
    let raf = 0;

    const sceneOpacity = () => Number(getComputedStyle(document.body, "::after").opacity) || 0;
    const setInk = (tone: string) => {
      if (tone === "scene") root.dataset.toneInk = "";
      else delete root.dataset.toneInk;
    };

    const apply = () => {
      // The innermost block wins (a scene band nested inside a section).
      const hit = atEnd ? footer : [...onLine].find((a) => ![...onLine].some((b) => b !== a && a.contains(b)));
      const tone = (hit as HTMLElement | null | undefined)?.dataset.tone;
      if (!tone || tone === root.dataset.toneActive) return;
      root.dataset.toneActive = tone;
      cancelAnimationFrame(raf);
      if (first) {
        // The first tone (e.g. a load at #bpmnscript) applies without a crossfade.
        root.dataset.toneInit = "";
        setInk(tone);
        void sceneOpacity(); // commit before transitions return
        delete root.dataset.toneInit;
        first = false;
        return;
      }
      // Follow the real ground instead of modelling the transition: retargets
      // that keep the same target opacity and reversals defeat any closed form.
      const dark = tone === "scene";
      if (dark === (root.dataset.toneInk !== undefined)) return;
      // Reduced motion, or no ground pseudo-element (its CSS is motion-gated): nothing
      // fades, so there is nothing to follow.
      const content = getComputedStyle(document.body, "::after").content;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches || content === "none" || content === "normal") {
        setInk(tone);
        return;
      }
      const t0 = performance.now();
      const follow = () => {
        // Hard cap so the loop can never spin forever.
        if (performance.now() - t0 > MAX_FOLLOW_MS || inkSwapNow(dark, sceneOpacity())) setInk(tone);
        else raf = requestAnimationFrame(follow);
      };
      follow();
    };

    const line = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onLine.add(e.target);
          else onLine.delete(e.target);
        }
        apply();
      },
      { rootMargin: "-40% 0px -60% 0px" },
    );
    const end = new IntersectionObserver(
      ([e]) => {
        atEnd = e.isIntersecting;
        apply();
      },
      { threshold: 1 },
    );
    // ponytail: blocks are read once at mount; observe late ones if a section ever renders tones on the client.
    document.querySelectorAll("[data-tone]").forEach((b) => line.observe(b));
    if (footer) end.observe(footer);
    return () => {
      line.disconnect();
      end.disconnect();
      cancelAnimationFrame(raf);
      delete root.dataset.toneActive;
      delete root.dataset.toneInk;
    };
  }, []);
  return null;
}
