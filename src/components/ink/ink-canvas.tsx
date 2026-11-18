"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { onMeasure } from "@/lib/motion/scroll-engine";
import { createFluid } from "./fluid";
import "./ink-canvas.css";

/** Detail of the `ink:splat` event the hero dispatches (client coordinates). */
export type InkSplatDetail = { x: number; y: number };

type CaptureWindow = Window & { __inkCapture?: (n: number) => void };

const STATIC_STEPS = 70;

/**
 * The hero's ink when the live field (`InkAmbient`, ink-bg.tsx, which runs the hero and the page
 * below as one field) does not. Place it as a direct child of the hero (`position: relative`).
 *
 * - Reduced motion: one settled frame (bloom from `originRef`, the period, + 70 steps), no loop.
 * - `?ink-capture`: no loop; `window.__inkCapture(n)` steps the bloomed field.
 * - No WebGL2 / float buffers, `saveData`, more contrast or forced colours, or a live field that
 *   gave up (`html[data-ink-ambient="static"]` with motion): the pre-rendered `fallback` image.
 * - Otherwise it stays empty: the live field draws the hero.
 */
export function InkCanvas({
  originRef,
  fallback,
}: {
  originRef: RefObject<HTMLElement | null>;
  fallback: { light: string; dark: string };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [useImage, setUseImage] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) {
      setUseImage(true);
      return;
    }

    const html = document.documentElement;
    const modeNow = () => (html.classList.contains("dark") ? "dark" : "light");
    const rm = matchMedia("(prefers-reduced-motion: reduce)");
    const hc = matchMedia("(prefers-contrast: more), (forced-colors: active)");
    const capture = new URLSearchParams(location.search).has("ink-capture");
    let teardown: (() => void) | null = null;

    /** With motion: wait for the live field; take the image if there is none. */
    const live = () => {
      if (hc.matches) {
        setUseImage(true);
        return null;
      }
      const check = () => html.dataset.inkAmbient === "static" && setUseImage(true);
      const mo = new MutationObserver(check);
      mo.observe(html, { attributes: true, attributeFilter: ["data-ink-ambient"] });
      check();
      return () => mo.disconnect();
    };

    const still = () => {
      let restored: (() => void) | null = null;
      const fluid = createFluid(canvas, {
        mode: modeNow(),
        // Context lost and not restorable: fall back to the pre-rendered image.
        onFail: () => setUseImage(true),
        onRestore: () => restored?.(),
      });
      if (!fluid) {
        // Remounted while the context is lost: wait for the restore and start over; the image takes over otherwise.
        if (canvas.getContext("webgl2")?.isContextLost()) {
          const retry = () => restart();
          canvas.addEventListener("webglcontextrestored", retry, { once: true });
          const off = () => canvas.removeEventListener("webglcontextrestored", retry);
          const t = setTimeout(() => (off(), setUseImage(true)), 4000);
          return () => (clearTimeout(t), off());
        }
        rm.removeEventListener("change", restart);
        setUseImage(true);
        return null;
      }
      const offs: (() => void)[] = [];
      const mo = new MutationObserver(() => fluid.setMode(modeNow()));
      mo.observe(html, { attributes: true, attributeFilter: ["class"] });
      offs.push(() => mo.disconnect());

      let dead = false;
      const fontsReady = document.fonts?.ready ?? Promise.resolve();
      let key = "";
      let kh = 0;
      const designed = () => {
        const c = canvas.getBoundingClientRect();
        const o = originRef.current?.getBoundingClientRect();
        const w = c.width || 1;
        const h = c.height || 1;
        const ox = o ? (o.left + o.width / 2 - c.left) / w : 0.5;
        const oy = o ? 1 - (o.top + o.height * 0.6 - c.top) / h : 0.5;
        const k = `${canvas.clientWidth}@${ox.toFixed(3)}`;
        // A height change under 10% (mobile URL bar) keeps the settled frame.
        if (k === key && Math.abs(canvas.clientHeight - kh) / kh < 0.1) return;
        key = k;
        kh = canvas.clientHeight;
        fluid.clear();
        // The bloom out of the period: 12 radial splats.
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * 6.283;
          const f = 240 + Math.random() * 220;
          fluid.splat(ox + (Math.random() - 0.5) * 0.02, oy + (Math.random() - 0.5) * 0.02, Math.cos(a) * f, Math.sin(a) * f, 0.5, 0.0045);
        }
        if (capture) (window as CaptureWindow).__inkCapture = (n) => fluid.step(n);
        else fluid.step(STATIC_STEPS);
      };
      fontsReady.then(() => !dead && designed());
      restored = () => {
        key = "";
        designed();
      };
      offs.push(onMeasure(() => fontsReady.then(() => !dead && designed())));
      offs.push(() => delete (window as CaptureWindow).__inkCapture);

      return () => {
        dead = true;
        offs.forEach((off) => off());
        // Leave an empty canvas behind (motion turned on: the live field takes over).
        fluid.clear();
        fluid.step(0);
        fluid.destroy();
      };
    };

    const restart = () => {
      teardown?.();
      teardown = rm.matches || capture ? still() : live();
    };
    restart();
    rm.addEventListener("change", restart);
    return () => {
      rm.removeEventListener("change", restart);
      teardown?.();
    };
  }, [originRef]);

  const style = { "--ink-light": `url(${fallback.light})`, "--ink-dark": `url(${fallback.dark})` } as CSSProperties;
  const image = <div className="ink-canvas ink-canvas--image" aria-hidden="true" style={style} />;
  if (useImage) return image;
  return (
    <>
      <canvas ref={ref} className="ink-canvas" aria-hidden="true" />
      {/* No JS: the same pre-rendered frame the no-WebGL path uses. */}
      <noscript>{image}</noscript>
    </>
  );
}
