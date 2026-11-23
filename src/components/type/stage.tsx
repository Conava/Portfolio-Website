"use client";

import { useLayoutEffect } from "react";
import {
  LIGHT,
  counter,
  counterRow,
  outline,
  pickCounter,
  setFont,
  GLYPH_PX,
  type FontSpec,
} from "./glyph";

/** Rest weight of the facade words; scroll speed adds up to MAX_GAIN (variable wght). */
const W_REST = 780;
const MAX_GAIN = 50;
/** The window is traced a little lighter than the ink, so the ink always covers its edge. */
const W_HOLE = 740;
/** Scroll the hero rests before its flight, in stage heights (mirrors the CSS); more on phones,
 * where the address bar collapses on the first scroll. */
const HOLD = 0.18;
const HOLD_PHONE = 0.3;
/** Share of the dolly after which the room is at full size; the wall then flies past the reader. */
const ARRIVE = 0.62;
/** How much larger than the window the room starts: the reader already looks into it. */
const PEEK = 1.2;
/** Scroll after the flight lands for a room marked `data-ty-rest`, in stage heights (mirrors the CSS). */
const REST = 0.6;
/** Scroll after the flight lands for every other room, in stage heights (mirrors the CSS): the
 * stage stays pinned while the eased camera catches up, so the room arrives at its top. */
const SETTLE = 0.15;
/** Most the eased camera may trail the scroll, in flights. LAG times the longest flight (0.9
 * stage heights) stays under SETTLE, so the flight has ended when the stage scrolls on. */
const LAG = 0.12;
const STRETCH: Record<string, CanvasFontStretch> = {
  "62.5%": "extra-condensed",
  "75%": "condensed",
  "100%": "normal",
  "112.5%": "semi-expanded",
  "125%": "expanded",
};

interface Letter {
  ch: string;
  cx: number;
  by: number;
  inkL: number;
  inkR: number;
  top: number;
  line: number;
}
interface Label {
  el: HTMLSpanElement;
  x0: number;
  x1: number;
  y: number;
  ph: number;
  sp: number;
}
interface Facade {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ann: HTMLElement;
  word: HTMLElement;
  labelText: string[];
  labels: Label[];
  /** Flight facades only (the first child of a sticky stage). */
  fly?: { room: HTMLElement; stage: HTMLElement; inner: HTMLElement };
  // measured
  W: number;
  H: number;
  F: number;
  font: FontSpec;
  letters: Letter[];
  shadows: { path: Path2D; x0: number; y0: number; x1: number; y1: number }[];
  cache?: HTMLCanvasElement;
  cacheRect: number[];
  colors: { ground: string; ink: string; shade: string; rim: string };
  hole?: {
    path: Path2D;
    rim: Path2D;
    C: [number, number];
    cw: number;
    ch: number;
    S: number;
  };
  land?: { O: [number, number]; s0: number };
  /** The facade transform last drawn (hit-testing the window). */
  view?: { s: number; tx: number; ty: number };
  top: number;
  flyPx: number;
  e: number;
  drawn: string;
  on: boolean;
  /** measure() run it was laid out in; 0 = not yet */ laid: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * The Type facades: draws each facade word with its long shadow on a canvas and, with motion,
 * flies the camera through a counter of the word into the room behind it as the page scrolls.
 * Native scroll drives it (the stage is CSS-sticky); nothing runs while no facade is on screen.
 */
export function TypeStage() {
  // Layout effect: the live mode must be set before Next scrolls to a hash after a client navigation.
  useLayoutEffect(() => startStage(), []);
  return null;
}

function startStage(): () => void {
  const root = document.documentElement;
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  let live = !mq.matches;
  root.dataset.tyMode = live ? "live" : "static";

  const facades: Facade[] = [
    ...document.querySelectorAll<HTMLElement>("[data-ty-facade]"),
  ].map((el) => {
    const canvas = el.querySelector("canvas")!;
    const stage = el.parentElement!;
    const flies = stage.classList.contains("ty-stage");
    return {
      el,
      canvas,
      ctx: canvas.getContext("2d")!,
      ann: el.querySelector<HTMLElement>("[data-ty-ann]")!,
      word: el.querySelector<HTMLElement>("[data-ty-word]")!,
      labelText: JSON.parse(el.dataset.tyLabels || "[]"),
      labels: [],
      fly: flies
        ? {
            room: stage.parentElement!,
            stage,
            inner: stage.querySelector<HTMLElement>("[data-ty-in]")!,
          }
        : undefined,
      W: 0,
      H: 0,
      F: 0,
      font: { family: "sans-serif", stretch: "normal" },
      letters: [],
      shadows: [],
      cacheRect: [],
      colors: {
        ground: "#000",
        ink: "#fff",
        shade: "#000",
        rim: "transparent",
      },
      top: 0,
      flyPx: 1,
      e: 0,
      drawn: "",
      on: true, // matches the markup: no data-off yet
      laid: 0,
    };
  });

  let vw = innerWidth,
    vh = innerHeight,
    dprFull = 1,
    mobile = false,
    ready = false,
    dead = false,
    gen = 0;
  const lastTr = new Map<Facade, string>();
  let raf = 0,
    last = performance.now(),
    lastY = scrollY,
    wx = 0,
    wv = 0,
    td = 0,
    lastMove = 0;

  function measure() {
    vw = innerWidth;
    vh = innerHeight;
    dprFull = Math.min(devicePixelRatio || 1, 1.5);
    mobile = vw < 700;
    ready = true;
    // Nearest facade first, the rest one per idle slot: tracing glyphs is the costly part,
    // and a facade not laid out yet simply keeps its plain DOM word.
    const run = ++gen;
    const order = facades
      .map((f) => ({ f, d: Math.abs(f.el.getBoundingClientRect().top) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.f);
    const step = () => {
      if (dead || run !== gen) return;
      const f = order.shift();
      if (!f) return;
      if (f.laid !== run) prepare(f, run);
      if (order.length) idle(step);
    };
    step();
  }
  function prepare(f: Facade, run = gen) {
    f.ann.style.transform = "";
    f.ann.style.opacity = "";
    if (f.fly) f.fly.inner.style.transform = "";
    lastTr.delete(f);
    // A facade inside a room's scaled interior (the closing name) is measured at rest.
    const host = f.fly ? null : f.el.closest<HTMLElement>("[data-ty-in]");
    const hostTr = host?.style.transform ?? "";
    if (host) host.style.transform = "";
    layout(f);
    if (host) host.style.transform = hostTr;
    f.laid = run;
    f.drawn = "";
    // No traced letters (e.g. a length-changing uppercase): keep the plain DOM word.
    if (f.letters.length) f.el.dataset.ready = "";
    else delete f.el.dataset.ready;
    kick();
  }
  const idle = (fn: () => void) =>
    "requestIdleCallback" in window
      ? requestIdleCallback(fn, { timeout: 300 })
      : setTimeout(fn, 16);

  function layout(f: Facade) {
    const fr = f.el.getBoundingClientRect();
    f.W = fr.width;
    f.H = fr.height;
    const cs = getComputedStyle(f.word);
    f.F = parseFloat(cs.fontSize);
    f.font = {
      family: cs.fontFamily,
      stretch: STRETCH[cs.fontStretch] ?? "normal",
    };
    const fcs = getComputedStyle(f.el);
    f.colors = {
      ground: fcs.getPropertyValue("--ty-ground").trim(),
      ink: fcs.getPropertyValue("--ty-ink").trim(),
      shade: fcs.getPropertyValue("--ty-shade").trim(),
      rim: fcs.getPropertyValue("--ty-rim").trim(),
    };
    if (f.fly) {
      const rr = f.fly.room.getBoundingClientRect();
      // The facade is one stage height (100lvh); the stage itself grows with open panels.
      const hold = f.fly.room.hasAttribute("data-ty-hold") ? (mobile ? HOLD_PHONE : HOLD) * f.el.offsetHeight : 0;
      const rest = (f.fly.room.hasAttribute("data-ty-rest") ? REST : SETTLE) * f.el.offsetHeight;
      f.top = rr.top + scrollY + hold;
      f.flyPx = Math.max(1, f.fly.room.offsetHeight - f.fly.stage.offsetHeight - rest - hold);
    } else {
      f.top = fr.top + scrollY;
    }

    // Letters where the DOM put them (kerning and line breaks included), in facade coordinates.
    const node = f.word.firstChild;
    const text = (node?.textContent ?? "").toLocaleUpperCase(root.lang || "en");
    const m = document.createElement("canvas").getContext("2d")!;
    setFont(m, f.font, f.F, W_REST);
    const fm = m.measureText("H");
    const asc = fm.fontBoundingBoxAscent,
      desc = fm.fontBoundingBoxDescent;
    const range = document.createRange();
    f.letters = [];
    let line = 0,
      prevTop = -Infinity;
    if (node && text.length === node.textContent!.length)
      for (let i = 0; i < text.length; i++) {
        if (text[i] === " ") continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.top - prevTop > f.F * 0.3 && prevTop !== -Infinity) line++;
        prevTop = r.top;
        const lm = m.measureText(text[i]);
        const cx = (r.left + r.right) / 2 - fr.left;
        const by = r.top - fr.top + (r.height - (asc + desc)) / 2 + asc;
        f.letters.push({
          ch: text[i],
          cx,
          by,
          line,
          inkL: cx - lm.actualBoundingBoxLeft,
          inkR: cx + lm.actualBoundingBoxRight,
          top: by - lm.actualBoundingBoxAscent,
        });
      }

    // Long shadow: every outline edge that faces away from the light, swept along it, as one
    // vector path per letter ('nonzero' fills the union). Crisp at any zoom.
    const L = f.F * (mobile ? 0.3 : 0.42);
    const d: [number, number] = [L * LIGHT[0], L * LIGHT[1]];
    const k = f.F / GLYPH_PX;
    f.shadows = f.letters.map((l) => {
      const o = outline(l.ch, f.font, W_REST);
      const path = new Path2D();
      o.loops.forEach((loop, li) => {
        for (let i = 0; i < loop.length; i++) {
          if (!o.casts[li][i]) continue;
          const p = loop[i],
            q = loop[(i + 1) % loop.length];
          const px = l.cx + p[0] * k,
            py = l.by + p[1] * k,
            qx = l.cx + q[0] * k,
            qy = l.by + q[1] * k;
          const cr = (qx - px) * d[1] - (qy - py) * d[0];
          if (Math.abs(cr) < 1e-6) continue;
          if (cr > 0) {
            path.moveTo(px, py);
            path.lineTo(qx, qy);
            path.lineTo(qx + d[0], qy + d[1]);
            path.lineTo(px + d[0], py + d[1]);
          } else {
            path.moveTo(px, py);
            path.lineTo(px + d[0], py + d[1]);
            path.lineTo(qx + d[0], qy + d[1]);
            path.lineTo(qx, qy);
          }
          path.closePath();
        }
      });
      return {
        path,
        x0: l.inkL - 2,
        y0: l.top - 2,
        x1: l.inkR + d[0] + 2,
        y1: l.by + f.F * 0.05 + d[1] + 2,
      };
    });
    if (f.letters.length) {
      // At rest and while small the shadow is a cached bitmap; close up it is filled as vectors.
      const cs2 = cacheScale();
      const x0 = Math.min(...f.letters.map((l) => l.inkL)) - 4,
        y0 = Math.min(...f.letters.map((l) => l.top)) - 4;
      const x1 = Math.max(...f.letters.map((l) => l.inkR)) + d[0] + 4,
        y1 = Math.max(...f.letters.map((l) => l.by)) + f.F * 0.05 + d[1] + 4;
      const cc = f.cache ?? document.createElement("canvas");
      cc.width = Math.ceil((x1 - x0) * cs2);
      cc.height = Math.ceil((y1 - y0) * cs2);
      const cx = cc.getContext("2d")!;
      cx.setTransform(cs2, 0, 0, cs2, -x0 * cs2, -y0 * cs2);
      cx.fillStyle = f.colors.shade;
      for (const sh of f.shadows) cx.fill(sh.path);
      f.cache = cc;
      f.cacheRect = [x0, y0, x1 - x0, y1 - y0];
    }

    // The window: the counter's own outline, and the room framed in it at rest.
    f.hole = undefined;
    f.land = undefined;
    const idx = pickCounter(f.letters.map((l) => l.ch));
    if (f.fly && idx >= 0) {
      const l = f.letters[idx];
      const c = counter(l.ch, f.font, W_HOLE, counterRow(l.ch));
      if (c) {
        const C: [number, number] = [l.cx + c.cx * k, l.by + c.cy * k];
        const cw = c.w * k,
          ch = c.h * k;
        const o = outline(l.ch, f.font, W_HOLE, 640);
        const pts = o.loops.map((lp) =>
          lp.map((p) => [l.cx + p[0] * k, l.by + p[1] * k] as [number, number]),
        );
        const cand = pts
          .filter((p) => inside(p, C))
          .sort((a, b) => area(a) - area(b))[0];
        if (cand) {
          const path = new Path2D(),
            rim = new Path2D(),
            sh = ch * 0.16;
          cand.forEach((p, i) =>
            i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1]),
          );
          path.closePath();
          rim.rect(C[0] - cw * 2, C[1] - ch * 2, cw * 4, ch * 4);
          cand.forEach((p, i) =>
            i
              ? rim.lineTo(p[0] + LIGHT[0] * sh, p[1] + LIGHT[1] * sh)
              : rim.moveTo(p[0] + LIGHT[0] * sh, p[1] + LIGHT[1] * sh),
          );
          rim.closePath();
          // The camera zooms about the counter's centre; this scale makes the counter swallow the
          // viewport (an ellipse of semi-axes s·cw/2, s·ch/2 around C contains its farthest corner).
          const S =
            Math.hypot(
              (2 * Math.max(C[0], f.W - C[0])) / cw,
              (2 * Math.max(C[1], f.H - C[1])) / ch,
            ) * 1.25;
          f.hole = { path, rim, C, cw, ch, S };
          const focus =
            f.fly.inner.querySelector<HTMLElement>("[data-ty-focus]") ??
            f.fly.inner;
          const r = focus.getBoundingClientRect();
          const sr = f.fly.stage.getBoundingClientRect();
          const Pt: [number, number] = [
            r.left - sr.left + Math.min(r.width, vw) / 2,
            r.top - sr.top + r.height / 2,
          ];
          // At most C_y / Pt_y, so the room's top edge starts at or below the stage top and only
          // rises from there (it lands at the stage top).
          const s0 = clamp(
            Math.min(
              PEEK * Math.min((0.7 * ch) / r.height, (0.8 * cw) / Math.min(r.width, vw)),
              C[1] / Math.max(1, Pt[1]),
            ),
            0.02,
            0.6,
          );
          // The fixed point of the room's zoom: Pt (scaled by s0 about it) sits in the counter at
          // the start, and every point of the room moves in a straight line to its place.
          const O: [number, number] = [
            (C[0] - Pt[0] * s0) / (1 - s0),
            (C[1] - Pt[1] * s0) / (1 - s0),
          ];
          f.land = { O, s0 };
        }
      }
    }
    buildLabels(f);
  }

  function cacheScale() {
    return dprFull > 1.2 ? 1.8 * dprFull : 2.6 * dprFull;
  }

  function buildLabels(f: Facade) {
    f.labels.forEach((l) => l.el.remove());
    f.labels = [];
    const first = f.letters.filter((l) => l.line === 0);
    if (!first.length) return;
    // Spread the labels over the roof line: label n spans its share of the first line's letters.
    const n = f.labelText.length;
    for (let i = 0; i < f.labelText.length; i++) {
      const t = f.labelText[i];
      const a = first[Math.floor((i * first.length) / n)];
      const b =
        first[
          Math.max(
            Math.floor(((i + 1) * first.length) / n) - 1,
            Math.floor((i * first.length) / n),
          )
        ];
      const el = document.createElement("span");
      el.className = "ty-lbl";
      el.setAttribute("aria-hidden", "true");
      el.textContent = t;
      f.ann.appendChild(el);
      const w = el.offsetWidth;
      const x0 = a.inkL + w / 2,
        x1 = Math.max(x0, b.inkR - w / 2);
      if (
        f.labels.some(
          (o) =>
            x0 - w / 2 < o.x1 + o.el.offsetWidth / 2 + 10 &&
            x1 + w / 2 > o.x0 - o.el.offsetWidth / 2 - 10,
        ) ||
        x1 + w / 2 > f.W
      ) {
        // Keep the first labels in list order; the first one that does not fit ends the row.
        el.remove();
        break;
      }
      f.labels.push({
        el,
        x0,
        x1,
        y: Math.min(a.top, b.top) - 10,
        ph: i * 1.7,
        sp: 0.22 + (i % 3) * 0.05,
      });
    }
  }

  /** `moving`: mid-flight frames render at 3/4 resolution (a fast zoom hides it; it halves the fill cost). */
  function draw(
    f: Facade,
    s: number,
    tx: number,
    ty: number,
    weight: number,
    hole: boolean,
    rimA: number,
    moving = false,
  ) {
    const c = f.ctx,
      cv = f.canvas;
    const dpr = moving ? dprFull * 0.75 : dprFull;
    const w = Math.round(f.W * dpr),
      h = Math.round(f.H * dpr);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = f.colors.ground;
    c.fillRect(0, 0, w, h);
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty);
    f.view = { s, tx, ty };
    const CACHE = cacheScale() / dprFull;
    if (s <= CACHE && f.cache) {
      const r = f.cacheRect;
      c.drawImage(f.cache, r[0], r[1], r[2], r[3]);
    } else {
      const X0 = -tx / s,
        Y0 = -ty / s,
        X1 = (f.W - tx) / s,
        Y1 = (f.H - ty) / s;
      c.fillStyle = f.colors.shade;
      for (const sh of f.shadows)
        if (sh.x1 > X0 && sh.x0 < X1 && sh.y1 > Y0 && sh.y0 < Y1)
          c.fill(sh.path);
    }
    if (hole && f.hole) {
      c.globalCompositeOperation = "destination-out";
      c.fill(f.hole.path);
      c.globalCompositeOperation = "source-over";
      // The window's rim casts the same hard shadow into the room behind.
      if (rimA > 0.01) {
        c.save();
        c.clip(f.hole.path);
        c.globalAlpha = rimA;
        c.fillStyle = f.colors.rim;
        c.fill(f.hole.rim, "evenodd");
        c.restore();
      }
    }
    setFont(c, f.font, f.F, weight);
    c.textAlign = "center";
    c.fillStyle = c.strokeStyle = f.colors.ink;
    c.lineWidth = f.F * 0.006;
    c.lineJoin = "round";
    for (const l of f.letters) {
      c.fillText(l.ch, l.cx, l.by);
      // A hairline stroke hides tracing slivers at rest; close up it only costs raster time.
      if (s < 3) c.strokeText(l.ch, l.cx, l.by);
    }
  }

  /** `t` null = at rest in the middle of each label's span (reduced motion). */
  function placeLabels(f: Facade, t: number | null) {
    for (const l of f.labels) {
      const x = lerp(
        l.x0,
        l.x1,
        t === null ? 0.5 : 0.5 + 0.5 * Math.sin(t * l.sp + l.ph),
      );
      l.el.style.transform = `translate(${x.toFixed(1)}px,${l.y.toFixed(1)}px) translate(-50%,-100%)`;
    }
  }

  function show(f: Facade, on: boolean) {
    if (f.on === on) return;
    f.on = on;
    // Only the paint goes (CSS on [data-off]); headings and CTAs stay in the accessibility tree.
    if (on) delete f.el.dataset.off;
    else f.el.dataset.off = "";
    if (!on) {
      f.canvas.width = 0; // release the backing store while far away
      f.canvas.height = 0;
      f.drawn = "";
    }
  }

  function frame(now: number) {
    raf = 0;
    if (dead || !ready) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const y = scrollY;
    const v = Math.abs(y - lastY) / vh / Math.max(dt, 1e-3);
    lastY = y;
    // Living detail: the words gain a little weight with scroll speed, on a critically damped spring.
    const goal = live ? clamp(v * 40, 0, MAX_GAIN) : 0;
    wv += ((goal - wx) * 90 - wv * 2 * Math.sqrt(90)) * dt;
    wx += wv * dt;
    const weight = Math.round(W_REST + clamp(wx, 0, MAX_GAIN));
    td += dt;
    const t = td;
    // The label drift runs for a few seconds after the last scroll, then the loop sleeps.
    const drifting = now - lastMove < 4000;
    let busy = Math.abs(goal - wx) > 0.3 || Math.abs(wv) > 0.3;

    for (const f of facades) {
      if (!f.laid) continue;
      const fl = f.fly && live && f.hole && f.land ? f.fly : null;
      if (!fl) {
        // A facade at rest: the word, its shadow and the drifting labels.
        // Inside a sticky stage the document position says nothing: ask the box.
        const top = f.el.closest(".ty-stage") ? f.el.getBoundingClientRect().top : f.top - y;
        const near = top < vh * 1.5 && top + f.H > -vh * 0.5;
        show(f, near);
        if (!near) continue;
        const visible = top < vh && top + f.H > 0;
        const key = `${weight}`;
        if (f.drawn !== key && (visible || !f.drawn)) {
          draw(f, 1, 0, 0, weight, false, 0);
          f.drawn = key;
        }
        if (visible && live) {
          placeLabels(f, t);
          if (drifting) busy = true;
        } else if (!live) placeLabels(f, null);
        continue;
      }
      const p = (y - f.top) / f.flyPx;
      const offBelow = f.top - y > vh * 1.5;
      // Just past the landing the camera may still be catching up (see LAG); beyond that it has landed.
      const done = p >= 1 + LAG;
      if (done || offBelow) {
        show(f, false);
        fl.stage.toggleAttribute("data-landed", done);
        f.ann.style.opacity = done ? "0" : "";
        f.e = done ? 1 : 0;
        rest(f);
        continue;
      }
      // The dolly: one exponential zoom per flight, its clock eased a little behind the scroll.
      const target = clamp(p, 0, 1);
      f.e += (target - f.e) * (1 - Math.exp(-dt * 10));
      // A fast flick: the camera trails by at most LAG, measured on the unclamped scroll so it
      // reaches the landing within the settle scroll.
      f.e = clamp(f.e, clamp(p - LAG, 0, 1), clamp(p + LAG, 0, 1));
      if (Math.abs(target - f.e) < 1e-4) f.e = target;
      else busy = true;
      const e = f.e;
      // The room arrives with the zoom: full size at ARRIVE, then only the wall keeps flying.
      const u = Math.min(1, e / ARRIVE);
      fl.stage.toggleAttribute("data-landed", u >= 0.999);
      f.el.toggleAttribute("data-thru", e > 0.02);
      if (e >= 0.999) {
        show(f, false);
        f.ann.style.opacity = "0";
        rest(f);
        continue;
      }
      show(f, true);
      const { C, S } = f.hole!;
      const { O, s0 } = f.land!;
      // The wall zooms about the counter's centre, which stays where it is on screen.
      const s = Math.pow(S, e);
      const tx = C[0] * (1 - s),
        ty = C[1] * (1 - s);
      const key = `${e.toFixed(5)}|${weight}`;
      // Below the fold only the first frame is drawn, so it is ready when it scrolls in.
      if (f.drawn !== key && (f.top - y < vh || !f.drawn)) {
        draw(f, s, tx, ty, weight, true, 1 - smooth(0.4, 0.8, e), e > 0);
        f.drawn = key;
      }
      const op = 1 - ease(clamp(e / 0.3, 0, 1));
      f.ann.style.opacity = String(op);
      f.ann.style.transform =
        e > 0 ? `translate(${tx}px,${ty}px) scale(${s})` : "";
      const top = f.top - y;
      if (top < vh && top > -vh) {
        placeLabels(f, t);
        if (drifting) busy = true;
      }
      if (u >= 0.999) {
        rest(f);
        continue;
      }
      // Composite the room while it moves: scaling it is then a GPU transform instead of a
      // fresh raster per frame (the browser re-rasters it sharp once it rests).
      if (fl.inner.style.willChange !== "transform")
        fl.inner.style.willChange = "transform";
      // The room behind: framed by the window, growing from s0 to 1 about O, eased out so it
      // settles into place at ARRIVE instead of stopping dead.
      const si = Math.pow(s0, Math.pow(1 - u, 3));
      const tr = `translate(${(O[0] * (1 - si)).toFixed(2)}px,${(O[1] * (1 - si)).toFixed(2)}px) scale(${si.toFixed(5)})`;
      if (lastTr.get(f) !== tr) {
        lastTr.set(f, tr);
        fl.inner.style.transform = tr;
      }
    }
    if (busy) raf = requestAnimationFrame(frame);
  }

  /** The room at rest: no transform, no layer. */
  function rest(f: Facade) {
    const fl = f.fly!;
    if (fl.inner.style.transform) {
      fl.inner.style.transform = "";
      lastTr.delete(f);
    }
    if (fl.inner.style.willChange) fl.inner.style.willChange = "";
  }

  function kick() {
    lastMove = performance.now();
    if (!raf && !dead) raf = requestAnimationFrame(frame);
  }

  /** Focus or a hash inside a room still behind its facade: scroll to where it is in the open. */
  function reveal(el: Element | null): boolean {
    const f = facades.find((x) => x.fly && el && x.fly.inner.contains(el));
    if (!f || !live || !el || !f.fly) return false;
    if (!f.laid) prepare(f);
    const end = f.top + f.flyPx;
    if (scrollY >= end) return true;
    const prev = f.fly.inner.style.transform;
    f.fly.inner.style.transform = "";
    const off =
      el.getBoundingClientRect().top - f.fly.stage.getBoundingClientRect().top;
    f.fly.inner.style.transform = prev;
    // ceil: scrollY is whole pixels; a fractional end would leave the flight at p = 0.9999, the word still up.
    scrollTo({ top: Math.ceil(end + Math.max(0, off - vh * 0.25)), behavior: "instant" });
    return true;
  }
  const onFocus = (e: FocusEvent) => {
    const el = e.target as Element;
    // A click already lands on something the reader sees; only keyboard focus needs moving to.
    if (!el.matches(":focus-visible")) return;
    reveal(el);
    // A facade's own controls (the hero CTAs) are invisible once its flight is past: scroll back to it.
    const f = facades.find((x) => x.fly && x.ann.contains(el));
    if (f && live && f.laid && scrollY > f.top + f.flyPx * 0.1)
      scrollTo({ top: f.top, behavior: "instant" });
  };
  // After a client navigation Next scrolls to the hash before the live layout (flight spacing)
  // exists, so a target outside the rooms is scrolled to again once measured.
  const onHash = () => {
    const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el && !reveal(el)) el.scrollIntoView({ behavior: "instant" });
  };

  // The wall lets pointer events through (CSS), so the room is clickable wherever it shows in the
  // window; a press on the wall itself must not reach the hidden room behind it.
  const onPress = (e: MouseEvent) => {
    if (e.detail === 0 && e.type === "click") return; // keyboard activation
    const f = facades.find((x) => x.fly?.inner.contains(e.target as Node));
    if (!f || !live || !f.on || !f.fly) return;
    let open = false;
    if (f.hole && f.view && f.el.dataset.ready !== undefined) {
      const r = f.el.getBoundingClientRect();
      const { s, tx, ty } = f.view;
      const c = f.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      open = c.isPointInPath(f.hole.path, (e.clientX - r.left - tx) / s, (e.clientY - r.top - ty) / s);
      c.restore();
    }
    if (!open) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  let rt = 0;
  const remeasure = () => {
    clearTimeout(rt);
    rt = window.setTimeout(measure, 120);
  };
  const ro = new ResizeObserver(remeasure);
  const mo = new MutationObserver(remeasure);
  const onMode = () => {
    live = !mq.matches;
    root.dataset.tyMode = live ? "live" : "static";
    remeasure();
  };
  const onScroll = () => kick();

  const fam = getComputedStyle(facades[0]?.word ?? root).fontFamily;
  Promise.all(
    Object.values(STRETCH).map((st) =>
      document.fonts.load(`${W_REST} ${st} 100px ${fam}`),
    ),
  )
    .catch(() => undefined)
    .then(() => document.fonts.ready)
    .then(() => {
      if (dead) return;
      measure();
      onHash();
      ro.observe(document.body);
      mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    });
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("focusin", onFocus);
  addEventListener("pointerdown", onPress, true);
  addEventListener("click", onPress, true);
  addEventListener("hashchange", onHash);
  mq.addEventListener("change", onMode);

  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    clearTimeout(rt);
    ro.disconnect();
    mo.disconnect();
    removeEventListener("scroll", onScroll);
    removeEventListener("focusin", onFocus);
    removeEventListener("pointerdown", onPress, true);
    removeEventListener("click", onPress, true);
    removeEventListener("hashchange", onHash);
    mq.removeEventListener("change", onMode);
    for (const f of facades) {
      f.labels.forEach((l) => l.el.remove());
      delete f.el.dataset.ready;
    }
    delete root.dataset.tyMode;
  };
}

function inside(poly: [number, number][], [x, y]: [number, number]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      c = !c;
  }
  return c;
}
function area(poly: [number, number][]) {
  return Math.abs(
    poly.reduce((a, p, i) => {
      const q = poly[(i + 1) % poly.length];
      return a + p[0] * q[1] - q[0] * p[1];
    }, 0),
  );
}
