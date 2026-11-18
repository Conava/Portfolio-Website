/**
 * Shared scroll engine for both designs: sticky stages, one passive scroll
 * listener, one rAF loop, geometry cached outside the frame loop.
 *
 * Browser-only; nothing runs at import time. Frame callbacks only write
 * (transform, opacity, clip-path, stroke-dashoffset). Every layout read lives
 * in the measure path (load, debounced resize, fonts.ready, ResizeObserver).
 *
 * Scene CSS gating (each scene's own stylesheet implements it):
 *   @media (scripting: enabled) and (min-width: <bp>) and (prefers-reduced-motion: no-preference) {
 *     [data-scene="x"]:not([data-scene-disabled]) { height: 240vh; }   // stage inside is position: sticky
 *   }
 * Server markup renders the scene's final state; JS applies the real progress
 * on mount. Without the pin height the range is <= 0 and progress is 1.
 */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Scene progress for a stage starting at document offset `top` with a scroll `range`. */
export function progressFor(scrollY: number, top: number, range: number): number {
  return range <= 0 ? 1 : clamp01((scrollY - top) / range);
}

const LN20 = Math.log(20);

/**
 * Exponential approach of `prev` toward `target`. `smoothing` is the time in
 * seconds to close 95 % of a step (0 = none), independent of frame rate.
 * `smoothing: 0.5` stands in for GSAP's `scrub: 0.5`.
 */
export function smooth(prev: number, target: number, dt: number, smoothing: number): number {
  if (smoothing <= 0) return target;
  return target + (prev - target) * Math.exp((-LN20 * dt) / smoothing);
}

// ---- frame loop -----------------------------------------------------------

/** Return `true` to keep the loop running (still easing); otherwise it idles until the next scroll. */
type FrameCb = (scrollY: number, dt: number) => boolean | void;

const frameSubs = new Set<FrameCb>();
let raf = 0;
let last = 0;
let scrollY = 0;

function tick(now: number) {
  raf = 0;
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
  let again = false;
  for (const cb of Array.from(frameSubs)) if (cb(scrollY, dt) === true) again = true;
  if (again) {
    last = now;
    raf = requestAnimationFrame(tick);
  } else last = 0;
}

function requestTick() {
  if (!raf && frameSubs.size) raf = requestAnimationFrame(tick);
}

function onScroll() {
  scrollY = window.scrollY;
  requestTick();
}

/** Subscribes to the shared scroll/rAF loop. Returns the unsubscribe function. */
export function onFrame(cb: FrameCb): () => void {
  if (!frameSubs.size) {
    scrollY = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  frameSubs.add(cb);
  requestTick();
  return () => {
    frameSubs.delete(cb);
    if (frameSubs.size) return;
    window.removeEventListener("scroll", onScroll);
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  };
}

// ---- measure --------------------------------------------------------------

const measureSubs = new Set<() => void>();
let ro: ResizeObserver | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | undefined;

function measureAll() {
  if (!measureSubs.size) return;
  scrollY = window.scrollY;
  for (const cb of Array.from(measureSubs)) cb();
  requestTick();
}

function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(measureAll, 150);
}

/** Subscribes to geometry invalidation: load, resize (150 ms debounce), fonts.ready, body ResizeObserver. */
export function onMeasure(cb: () => void): () => void {
  if (!measureSubs.size) {
    window.addEventListener("load", measureAll);
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(measureAll);
    ro = new ResizeObserver(measureAll);
    ro.observe(document.body);
  }
  measureSubs.add(cb);
  return () => {
    measureSubs.delete(cb);
    if (measureSubs.size) return;
    window.removeEventListener("load", measureAll);
    window.removeEventListener("resize", onResize);
    clearTimeout(resizeTimer);
    ro?.disconnect();
    ro = null;
  };
}

// ---- scenes ---------------------------------------------------------------

export interface Scene {
  /** Re-measures geometry now (e.g. after a layout change the observers cannot see). */
  refresh(): void;
  /** Stops updates, shows the final state and drops the pin (`data-scene-disabled`). */
  disable(): void;
  destroy(): void;
  readonly progress: number;
}

const EMIT_EPS = 0.0005;

/**
 * Drives `onProgress(p)` for a pinned stage wrapper `el` (the tall element whose
 * child is `position: sticky`). `onActive` follows visibility; callers toggle
 * `will-change` there.
 */
export function createScene(
  el: HTMLElement,
  opts: { smoothing?: number; onProgress: (p: number) => void; onActive?: (active: boolean) => void },
): Scene {
  const smoothing = opts.smoothing ?? 0;
  let top = 0;
  let range = 0;
  let p = 1;
  let emitted = NaN;
  let first = true; // first frame lands on the target: mount and anchor loads skip the catch-up
  let live = true;

  const emit = (v: number) => {
    emitted = v;
    opts.onProgress(v);
  };

  const measure = () => {
    if (!live) return;
    top = el.getBoundingClientRect().top + window.scrollY;
    range = el.offsetHeight - window.innerHeight;
  };

  const frame = (y: number, dt: number) => {
    if (!live) return false; // destroyed or disabled mid-tick: never emit after disable()
    const target = progressFor(y, top, range);
    if (range <= 0) {
      p = 1;
      if (emitted !== 1) emit(1);
      return false;
    }
    let next = first ? target : smooth(p, target, dt, smoothing);
    first = false;
    if (Math.abs(next - target) < EMIT_EPS) next = target; // reach the exact end, no end-of-travel gap
    p = next;
    if (!(Math.abs(p - emitted) <= EMIT_EPS) || (p === target && emitted !== target)) emit(p);
    return p !== target;
  };

  const io = new IntersectionObserver(([e]) => opts.onActive?.(e.isIntersecting));
  if (opts.onActive) io.observe(el);

  measure();
  const offMeasure = onMeasure(measure);
  let offFrame: (() => void) | null = onFrame(frame);

  const stop = () => {
    live = false;
    offFrame?.();
    offFrame = null;
    offMeasure();
    io.disconnect();
  };

  return {
    refresh() {
      measure();
      requestTick();
    },
    disable() {
      if (!live) return;
      stop();
      el.setAttribute("data-scene-disabled", "");
      opts.onActive?.(false);
      p = 1;
      emit(1);
    },
    destroy: stop,
    get progress() {
      return p;
    },
  };
}
