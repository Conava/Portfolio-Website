/**
 * Scroll stepping for the devline run: while the scene is pinned, one gesture moves exactly one
 * stage. Pure functions; the scene feeds them wheel, key and touch input.
 */

/** A gap this long between wheel events ends a gesture (trackpad momentum sends events every frame). */
export const PAUSE_MS = 180;
/** Time a stage needs to be readable; only after it can a new push inside one gesture step again. */
export const READ_MS = 1200;

export interface Gesture {
  last: number;
  stepAt: number;
  prev: number;
}

export const createGesture = (): Gesture => ({ last: -Infinity, stepAt: -Infinity, prev: 0 });

/**
 * One wheel event (`now`: the event's own timestamp): returns the step it asks for (1 down, -1 up)
 * or 0 to swallow it. A gesture steps on its first event; later events step only after the stage is
 * readable and only on a fresh push (the delta jumps up), which decaying momentum never does. A pause
 * starts a new gesture, but while the stage is not yet readable only a deliberate delta does (a wheel
 * notch, at least as strong as the last event): a busy main thread can hold back a trackpad stream or
 * a fling for a few hundred ms, and that gap must not count as a second gesture.
 */
export function wheelStep(g: Gesture, now: number, dy: number): -1 | 0 | 1 {
  const mag = Math.abs(dy);
  const fresh = now - g.last > PAUSE_MS && (now - g.stepAt >= READ_MS || mag >= Math.max(20, g.prev));
  const push = now - g.stepAt >= READ_MS && g.prev > 0 && mag >= 2 * g.prev && mag >= 20;
  g.last = now;
  g.prev = mag;
  if (!mag || !(fresh || push)) return 0;
  g.stepAt = now;
  return dy > 0 ? 1 : -1;
}

/** The new target after a step from `target`, with at most one stage queued ahead of `cur` (the stage playing). */
export function queueStep(target: number, dir: number, cur: number, last: number): number {
  const to = Math.min(last, Math.max(0, target + dir));
  return Math.abs(to - cur) > 2 ? target : to;
}

/** Scrolling out of the scene is plain page scroll: up from the first stage, down from the last. */
export const releases = (target: number, dy: number, last: number) => (dy < 0 && target <= 0) || (dy > 0 && target >= last);

/** The stage whose place is nearest to scroll position `y`, or -1 when the scene is not pinned. */
export function stageFromScroll(y: number, top: number, step: number, last: number): number {
  const s = (y - top) / step;
  if (s < -2 / step || s > last + 2 / step) return -1;
  return Math.min(last, Math.max(0, Math.round(s)));
}
