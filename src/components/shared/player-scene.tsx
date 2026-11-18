"use client";

import Image from "next/image";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { onMeasure, progressFor } from "@/lib/motion/scroll-engine";
import { segment } from "@/lib/motion/piecewise";
import type { DuxProject, Image as Shot } from "@/lib/types";
import { useScene } from "./use-motion";
import "./player-scene.css";

type Props = { project: DuxProject; title: string; pinLength: "320vh" | "300vh"; minWidth: 900 | 960 };

/** The shrink beat ends here; the three states share the rest of the travel. */
const SHRINK = 0.3;
const TITLE_OUT = 0.25;
/** Half the crossfade, in state progress (0..1 over 30-100 %): the next shot fades in over 2 * FADE. */
const FADE = 0.05;

const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

/**
 * The Dux Player keynote moment, shared by both designs: a full-bleed screenshot
 * shrinks into its window (0-30 %), then three states crossfade with captions and
 * progress ticks (30-100 %). Without a pin (no JS, reduced motion, narrow screens,
 * fewer than 3 images) the same screenshots render as a snap-scroll row with
 * captions beneath. Place it full width (Ink: inside a `data-tone="scene"` band);
 * the row insets itself to the design's content edge (`--pscene-inset`), the
 * window centers in the host and the cover state always fills the viewport.
 */
export function PlayerScene({ project, title, pinLength, minWidth }: Props) {
  const shots = project.images ?? [];
  if (!shots.length) return null;
  if (shots.length < 3)
    return (
      <div className="pscene">
        <Shots shots={shots} label={title} minWidth={minWidth} />
      </div>
    );
  return <PinnedPlayer shots={shots.slice(0, 3)} title={title} pinLength={pinLength} minWidth={minWidth} />;
}

/** Static: the snap-scroll row of figures. Pinned: the window the three shots stack in. */
function Shots({
  shots,
  label,
  minWidth,
  children,
  cover,
}: {
  shots: Shot[];
  label: string;
  minWidth: number;
  children?: ReactNode;
  cover?: boolean;
}) {
  const pinned = `(min-width: ${minWidth}px)`;
  return (
    <div className="pscene-frame" role="region" aria-label={label} tabIndex={0}>
      {shots.map((s, i) => (
        <figure key={s.src} className="pscene-item">
          <Image
            className="pscene-img"
            src={s.src}
            alt={s.alt}
            width={s.width}
            height={s.height}
            // Only the first shot is ever seen at cover size: it fills the viewport's width or, when
            // the viewport is relatively taller than the shot, its height. The others stay inside
            // the window (--fw).
            sizes={
              cover && i === 0
                ? `${pinned} max(100vw, ${((100 * s.width) / s.height).toFixed(1)}vh), 85vw`
                : `${pinned} min(1040px, 92vw), 85vw`
            }
          />
          {s.caption && <figcaption className="pscene-cap">{s.caption}</figcaption>}
        </figure>
      ))}
      {children}
    </div>
  );
}

type Els = { stage: HTMLElement; frame: HTMLElement; imgs: HTMLElement[]; veil: HTMLElement; title: HTMLElement; ticks: HTMLElement[]; caps: HTMLElement[] };
type Geo = { cover: number; dx: number; dy: number; radius: number; top: number; range: number; vh: number };

function PinnedPlayer({ shots, title, pinLength, minWidth }: { shots: Shot[]; title: string; pinLength: string; minWidth: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef<{ els: Els | null; geo: Geo | null; p: number; cap: number; dirty: boolean; y: number; snap: boolean }>({
    els: null,
    geo: null,
    p: 1,
    cap: 2,
    dirty: false,
    y: NaN,
    snap: false,
  });

  const els = (): Els => {
    const s = st.current;
    if (s.els) return s.els;
    const root = ref.current!;
    const one = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    const all = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    return (s.els = {
      stage: one(".pscene-stage"),
      frame: one(".pscene-frame"),
      imgs: all(".pscene-img"),
      veil: one(".pscene-veil"),
      title: one(".pscene-title"),
      ticks: all(".pscene-ticks b"),
      caps: all(".pscene-caps > p"),
    });
  };

  // Layout reads only here: first frame, resize, fonts, body size changes.
  const measure = (): Geo => {
    const { stage, frame } = els();
    const fw = frame.offsetWidth;
    const fh = frame.offsetHeight;
    const sh = stage.clientHeight;
    const vw = document.documentElement.clientWidth;
    const left = stage.getBoundingClientRect().left;
    return (st.current.geo = {
      cover: Math.max(vw / fw, sh / fh, 1),
      // Offsets that put the window's center on the viewport's center (the stage is the viewport while stuck).
      dx: vw / 2 - (left + frame.offsetLeft + fw / 2),
      dy: sh / 2 - (frame.offsetTop + fh / 2),
      radius: parseFloat(getComputedStyle(frame).getPropertyValue("--s-r-frame")) || 0,
      top: ref.current!.getBoundingClientRect().top + window.scrollY,
      range: ref.current!.offsetHeight - window.innerHeight,
      vh: window.innerHeight,
    });
  };

  /** Back to the stylesheet (static row or pinned final state). */
  const clear = () => {
    const s = st.current;
    if (!s.dirty) return;
    const e = els();
    for (const el of [e.frame, e.veil, e.title, ...e.imgs, ...e.ticks, ...e.caps]) el.removeAttribute("style");
    e.frame.tabIndex = 0; // the static row scrolls, so it takes keyboard focus
    s.dirty = false;
    s.cap = 2;
  };

  /** Writes progress p: transform, opacity and clip-path only. */
  const apply = (smoothed: number) => {
    const s = st.current;
    s.p = smoothed;
    const root = ref.current;
    if (!root || !sceneRef.current || root.hasAttribute("data-scene-disabled")) return clear();
    const e = els();
    const g = s.geo ?? measure();
    if (!s.dirty) e.frame.tabIndex = -1; // pinned, nothing to scroll (and the clip would hide the ring)
    s.dirty = true;

    // A jump of more than a viewport (anchor, Home/End) lands at once instead of
    // replaying the scene over the smoothing time; follow the raw position until
    // the smoothed one has caught up.
    const y = window.scrollY;
    if (Math.abs(y - s.y) > g.vh) s.snap = true;
    s.y = y;
    const raw = progressFor(y, g.top, g.range);
    if (s.snap && Math.abs(smoothed - raw) < 0.002) s.snap = false;
    const p = s.snap ? raw : smoothed;

    const t = easeInOutQuad(segment(p, 0, SHRINK));
    const scale = g.cover + (1 - g.cover) * t;
    const shift = `translate(${(g.dx * (1 - t)).toFixed(2)}px, ${(g.dy * (1 - t)).toFixed(2)}px)`;
    e.frame.style.transform = `${shift} scale(${scale.toFixed(4)})`;
    // The clip applies before the scale: divide so the on-screen radius is radius * t.
    e.frame.style.clipPath = `inset(0 round ${((g.radius * t) / scale).toFixed(2)}px)`;
    const over = String(1 - segment(p, 0, TITLE_OUT));
    e.veil.style.opacity = over;
    e.title.style.opacity = over;
    e.title.style.transform = shift;

    // Each shot fades in on top of the previous one, which stays opaque underneath and hides
    // only once covered: no dip to the background, never two half-visible shots.
    const q = segment(p, SHRINK, 1);
    const fadeIn = (i: number) => (i === 0 ? 1 : segment(q, i / 3 - FADE, i / 3 + FADE));
    e.imgs.forEach((img, i) => {
      const covered = i < e.imgs.length - 1 && fadeIn(i + 1) >= 1;
      img.style.opacity = covered ? "0" : String(fadeIn(i));
    });
    e.ticks.forEach((b, i) => (b.style.transform = `scaleX(${segment(q, i / 3, (i + 1) / 3).toFixed(4)})`));

    // Captions are a discrete swap; CSS fades them over 160 ms.
    const cap = p < SHRINK ? -1 : q < 1 / 3 ? 0 : q < 2 / 3 ? 1 : 2;
    if (cap !== s.cap || !e.caps[0].style.opacity) {
      e.caps.forEach((c, i) => (c.style.opacity = i === cap ? "1" : "0"));
      s.cap = cap;
    }
  };

  const sceneRef = useScene(ref, {
    minWidth,
    smoothing: 0.5,
    onProgress: apply,
    onActive: (a) => ref.current?.toggleAttribute("data-active", a),
  });

  useEffect(() => {
    const off = onMeasure(() => {
      if (!sceneRef.current) return;
      measure();
      apply(st.current.p);
    });
    // Decode the screenshots a viewport ahead, one at a time in display order, so the first
    // pinned frame does not pay for it and the three decodes never land in the same frame.
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        void (async () => {
          for (const img of els().imgs as HTMLImageElement[]) {
            img.loading = "eager";
            await img.decode().catch(() => {});
          }
        })();
      },
      { rootMargin: "100% 0px" },
    );
    io.observe(ref.current!);
    return () => {
      off();
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ref} className="pscene" data-scene="player" data-min={minWidth} style={{ "--pscene-pin": pinLength } as CSSProperties}>
      <div className="pscene-stage">
        <Shots shots={shots} label={title} minWidth={minWidth} cover>
          <div className="pscene-veil" />
        </Shots>
        <p className="pscene-title" aria-hidden>
          {title}
        </p>
        <div className="pscene-ticks" aria-hidden>
          <i>
            <b />
          </i>
          <i>
            <b />
          </i>
          <i>
            <b />
          </i>
        </div>
        {/* Pinned only: captions sit outside the clipped, scaled window. The figcaptions serve the
            static row; while pinned the images' alt texts carry the content, so these are visual only. */}
        <div className="pscene-caps" aria-hidden>
          {shots.map((s) => (
            <p key={s.src}>{s.caption}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
