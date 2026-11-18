"use client";

import { useEffect, useRef } from "react";
import { onFrame, onMeasure } from "@/lib/motion/scroll-engine";
import { BAND, createFluid, type Tuning, type InkPalette } from "./fluid";
import type { InkSplatDetail } from "./ink-canvas";
import "./ink-bg.css";

// The body's look of the same ink: one thin colour per mode. Light: a pale pen blue that shifts
// hue more than lightness; dark (and the scene bands in light mode): a muted pen blue. Worst
// case (densest ink, --mute text): 4.53:1 on light paper-2, 5.32:1 on dark paper-2, 5.20:1 on
// the light-mode scene ground. ink-bg.css repeats these for the static fallback. Thin ink reaches
// that cap sooner than in the hero (gain), so the body shows the ink's structure, not a haze.
const BODY: InkPalette = {
  light: { a: [0.66, 0.76, 1], b: [0.66, 0.76, 1], alpha: 0.19, deep: 1, gain: 4 },
  dark: { a: [0.22, 0.3, 0.62], b: [0.22, 0.3, 0.62], alpha: 0.14, deep: 1, gain: 4 },
};
/** Below the hero: 30 fps, slower to fade, wider and calmer strokes anywhere, soon after input stops. */
const BODY_TUNE: Tuning = { scale: 0.5, dyeRes: 256, fps: 30, dyeDiss: 0.08, every: 1.4, quiet: 1.2, strength: 0.6, radius: 0.016, speed: 90, x: [0.05, 0.95], y: [0.05, 0.95] };
/** The ink travels with the page at this fraction of the scroll: it lingers, then leaves upward. */
const CARRY = 0.45;
/** Pointer gain and strength: in the hero, and (fainter, slower) over the body. */
const HERO_PTR = { gain: 2600, strength: 0.16, radius: 0.003 };
const BODY_PTR = { gain: 1400, strength: 0.12, radius: 0.004 };

type Saver = Navigator & { connection?: { saveData?: boolean } };

/**
 * The Ink homepage's one ink field, hero included: a canvas fixed to the viewport above the
 * tone grounds and below all content. The hero palette sits above the hero's bottom edge and
 * the thin body palette below it, so the ink the visitor stirred in the hero scrolls on into
 * the page and thins out instead of being swapped for another layer.
 *
 * Below the hero it answers the page: scrolling carries the field (at CARRY) and stirs a wake
 * from the lower edge, a section arriving at the reading line drops a little ink beside it, and
 * mouse and pen keep stirring it.
 *
 * `html[data-ink-ambient]`: `live` while the canvas runs, `static` for reduced motion, data
 * saver or no WebGL2 (ink-bg.css then shows pre-rendered blooms per section and the hero its own
 * still frame or image). Nothing under `prefers-contrast: more` or forced colours, nor with
 * `?ink-capture` (the hero steps its own field there). Paused on hidden tabs.
 */
export function InkAmbient() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const html = document.documentElement;
    const rm = matchMedia("(prefers-reduced-motion: reduce)");
    const hc = matchMedia("(prefers-contrast: more), (forced-colors: active)");
    let teardown: (() => void) | undefined;

    const setup = (): (() => void) | undefined => {
      if (hc.matches || new URLSearchParams(location.search).has("ink-capture")) return;
      const off = () => void delete html.dataset.inkAmbient;
      if (rm.matches || (navigator as Saver).connection?.saveData) {
        html.dataset.inkAmbient = "static";
        return off;
      }
      const heroMode = () => (html.classList.contains("dark") ? "dark" : "light");
      // The scene bands carry the dark palette in both modes (data-tone-ink).
      const bodyMode = () => (html.classList.contains("dark") || html.dataset.toneInk !== undefined ? "dark" : "light");
      const fluid = createFluid(canvas, {
        mode: heroMode(),
        body: { palette: BODY, tune: BODY_TUNE },
        // Lost for good: drop the listeners, then the static blooms and the hero image.
        onFail: () => {
          teardown?.();
          teardown = undefined;
          html.dataset.inkAmbient = "static";
        },
        // A restored context starts empty.
        onRestore: () => start(),
      });
      if (!fluid) {
        html.dataset.inkAmbient = "static";
        return off;
      }
      fluid.setMode(heroMode(), bodyMode());
      html.dataset.inkAmbient = "live";

      const offs: (() => void)[] = [];
      const listen = (t: EventTarget, type: string, fn: (e: never) => void) => {
        t.addEventListener(type, fn as EventListener, { passive: true });
        offs.push(() => t.removeEventListener(type, fn as EventListener));
      };

      // Geometry from the measure path only: the hero's end (document y) and the viewport.
      const hero = document.getElementById("top");
      let heroEnd = 0;
      let vw = 1;
      let vh = 1;
      /** Scroll the hero rests through (a nudge, a collapsing address bar) before the handover starts. */
      let hold = 0;
      const measure = () => {
        heroEnd = hero ? hero.getBoundingClientRect().bottom + scrollY : 0;
        vw = canvas.clientWidth || 1;
        vh = canvas.clientHeight || 1;
        hold = vh * (vw < 700 ? 0.25 : 0.18);
      };
      measure();
      offs.push(onMeasure(measure));
      const toSim = (cx: number, cy: number): [number, number] => [cx / vw, 1 - cy / vh];
      /**
       * Hero bottom in canvas units (y up). At rest the blend band sits below the canvas (the hero
       * is all hero ink); after the hold, over 30 % of a viewport of scroll, it catches up with the edge,
       * before any body text is in view.
       */
      const edgeAt = (y: number) => 1 - (heroEnd - y) / vh - BAND * Math.max(0, 1 - Math.max(0, y - hold) / (0.3 * vh));

      const timers: ReturnType<typeof setTimeout>[] = [];
      offs.push(() => timers.forEach(clearTimeout));
      /** The bloom out of the period (12 radial splats), or a few slow drops when it is out of view. */
      const start = () => {
        const p = document.querySelector(".ink-hero .period")?.getBoundingClientRect();
        const [ox, oy] = p ? toSim(p.left + p.width / 2, p.top + p.height * 0.6) : [0, -1];
        if (oy < 0.05 || oy > 0.95) {
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * 6.283;
            fluid.splat(0.08 + Math.random() * 0.84, 0.08 + Math.random() * 0.84, Math.cos(a) * 90, Math.sin(a) * 90, 0.22, 0.012);
          }
          return;
        }
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * 6.283;
          const f = 240 + Math.random() * 220;
          const x = ox + (Math.random() - 0.5) * 0.02;
          const y = oy + (Math.random() - 0.5) * 0.02;
          timers.push(setTimeout(() => fluid.splat(x, y, Math.cos(a) * f, Math.sin(a) * f, 0.5, 0.0045), 250 + i * 55));
        }
      };
      let dead = false;
      (document.fonts?.ready ?? Promise.resolve()).then(() => !dead && (measure(), start()));
      offs.push(() => (dead = true));

      // Scroll: where the hero ends, the carry, and a wake from the lower edge on a fast scroll.
      let lastY = scrollY;
      let lastEff = Math.max(0, lastY - hold);
      let wake = 0;
      let dir = 1;
      fluid.setEdge(edgeAt(lastY));
      offs.push(
        onFrame((y, dt) => {
          const eff = Math.max(0, y - hold);
          const dy = eff - lastEff;
          if (y !== lastY) dir = Math.sign(y - lastY);
          lastY = y;
          lastEff = eff;
          canvas.dataset.carry = String(Math.round(eff)); // test hook: scroll past the hold
          fluid.setEdge(edgeAt(y));
          if (!dy) return;
          fluid.carry((CARRY * dy) / vh);
          const v = dy / vh / Math.max(dt, 1 / 120); // viewports per second
          // One broad, dye-free push every ~150 ms: a stream of narrow ones draws drip lines.
          if (Math.abs(v) > 0.4 && (wake += dt) > 0.15) {
            wake = 0;
            const push = Math.max(-1, Math.min(1, v / 3)) * 160;
            fluid.splat(0.15 + Math.random() * 0.7, v > 0 ? 0.15 : 0.85, (Math.random() - 0.5) * 60, push, 0, 0.05);
          }
        }),
      );

      // A section reaching the reading line (40 % down) drops a little ink in the margin beside it.
      let current = "";
      let first = true;
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting || e.target.id === current) continue;
            current = e.target.id;
            if (first) continue; // the section a load lands on gets none
            const x = vw >= 900 ? 0.7 + Math.random() * 0.22 : 0.15 + Math.random() * 0.7;
            const a = (Math.random() - 0.5) * 1.2;
            fluid.splat(x, 0.58, Math.sin(a) * 120, dir * Math.cos(a) * 120, 0.3, 0.009); // rises with the page on the way down
          }
          first = false;
        },
        { rootMargin: "-40% 0px -60% 0px" },
      );
      document.querySelectorAll("section[id]").forEach((s) => s.id !== "top" && !s.parentElement?.closest("section[id]") && io.observe(s));
      offs.push(() => io.disconnect());

      const mo = new MutationObserver(() => fluid.setMode(heroMode(), bodyMode()));
      mo.observe(html, { attributes: true, attributeFilter: ["class", "data-tone-ink"] });
      offs.push(() => mo.disconnect());

      const sync = () => (document.hidden ? fluid.pause() : fluid.resume());
      listen(document, "visibilitychange", sync);
      sync();

      // Mouse and pen stir it everywhere. Touch only in the hero (tap drops ink, a drag stirs):
      // below it every scroll starts with a touch.
      let last: [number, number] | null = null;
      const stir = (cx: number, cy: number) => {
        const p = toSim(cx, cy);
        const k = cy < heroEnd - scrollY ? HERO_PTR : BODY_PTR;
        if (last) {
          const dx = p[0] - last[0];
          const dy = p[1] - last[1];
          if (dx || dy) fluid.splat(p[0], p[1], dx * k.gain, dy * k.gain, k.strength, k.radius);
        }
        last = p;
      };
      listen(window, "pointermove", (e: PointerEvent) => e.pointerType !== "touch" && stir(e.clientX, e.clientY));
      // Leaving the window: the next entry starts a new stroke instead of a jump across the screen.
      listen(document, "pointerout", (e: PointerEvent) => !e.relatedTarget && (last = null));
      if (hero) {
        listen(hero, "touchstart", (e: TouchEvent) => {
          const t = e.touches[0];
          last = null;
          stir(t.clientX, t.clientY);
          const [x, y] = toSim(t.clientX, t.clientY);
          fluid.splat(x, y, 0, 0, 0.4, 0.0035);
        });
        listen(hero, "touchmove", (e: TouchEvent) => stir(e.touches[0].clientX, e.touches[0].clientY));
        listen(hero, "touchend", () => (last = null));
      }

      // The period click: a saturated pen-blue blot (the show pass caps its alpha, so text over
      // it keeps its contrast), then six jets on a ring around it, evenly spaced and turned off
      // the radius so they cancel out (the blot stays on the period) and curl it outward. In
      // dark mode the capped blot is the same value as the ink already there, so it first clears
      // a ring of paper to sit on.
      listen(document, "ink:splat", (e: CustomEvent<InkSplatDetail>) => {
        const [x, y] = toSim(e.detail.x, e.detail.y);
        if (heroMode() === "dark") fluid.erase(x, y, 0.03, 0.97);
        fluid.splat(x, y, 0, 0, 3, 0.006, true);
        const turn = Math.random() * 1.047;
        for (let i = 0; i < 6; i++) {
          const a = turn + i * 1.047;
          const d = a + 0.6;
          fluid.splat(x + (Math.cos(a) * 0.03 * vh) / vw, y + Math.sin(a) * 0.03, Math.cos(d) * 260, Math.sin(d) * 260, 0.25, 0.0025, true);
        }
      });

      // Opening a panel or a Dux bar tab lets a little ink run out from the control.
      // Capture phase: React has not flipped aria-expanded yet.
      const drop = (e: MouseEvent) => {
        const el = (e.target as Element | null)?.closest?.('.dp-trigger[aria-expanded="false"], .dxb-tab[aria-selected="false"]');
        if (!el) return;
        const r = el.getBoundingClientRect();
        const [x, y] = toSim(r.left + 12, r.bottom);
        for (let i = 0; i < 3; i++) {
          const a = -0.5 - Math.random() * 1.6; // fanning down and to the right
          fluid.splat(x, y, Math.cos(a) * 160, Math.sin(a) * 160, 0.22, 0.006);
        }
      };
      document.addEventListener("click", drop, { capture: true, passive: true });
      offs.push(() => document.removeEventListener("click", drop, { capture: true }));

      return () => {
        offs.forEach((f) => f());
        fluid.destroy();
        off();
      };
    };

    const restart = () => {
      teardown?.();
      teardown = setup();
    };
    restart();
    rm.addEventListener("change", restart);
    hc.addEventListener("change", restart);
    return () => {
      rm.removeEventListener("change", restart);
      hc.removeEventListener("change", restart);
      teardown?.();
    };
  }, []);
  return <canvas ref={ref} className="ink-ambient" aria-hidden="true" />;
}
