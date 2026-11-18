/**
 * Damped spring, semi-implicit Euler (dt capped at 1/30 s). Used for Trace's head (170/26, critically
 * damped) and Ink's period tap (300/24, about 5 % overshoot). The overshoot is
 * done in JS on purpose: a CSS cubic-bezier with y > 1 would trip the
 * `bounce-easing` rule, which stays clean for all CSS easings.
 */
export interface Spring {
  /** Advances toward `target` by `dt` seconds (capped at 1/30) and returns the new value. */
  step(target: number, dt: number): number;
  readonly value: number;
  readonly velocity: number;
  /** True once value and velocity are within 1e-3 of rest at the last target (value snaps to it). */
  readonly settled: boolean;
}

const EPS = 1e-3;

export function createSpring(
  { stiffness, damping, mass = 1 }: { stiffness: number; damping: number; mass?: number },
  initial: number,
): Spring {
  let value = initial;
  let velocity = 0;
  let settled = true;
  return {
    step(target, dt) {
      // Substeps of <= 1/240 s keep 60 Hz frames close to the analytic curve
      // (one 1/60 step halves the 300/24 overshoot).
      const t = Math.min(dt, 1 / 30);
      const n = Math.ceil(t * 240);
      const h = t / n;
      for (let i = 0; i < n; i++) {
        velocity += ((-stiffness * (value - target) - damping * velocity) / mass) * h;
        value += velocity * h;
      }
      settled = Math.abs(value - target) < EPS && Math.abs(velocity) < EPS;
      if (settled) {
        value = target;
        velocity = 0;
      }
      return value;
    },
    get value() {
      return value;
    },
    get velocity() {
      return velocity;
    },
    get settled() {
      return settled;
    },
  };
}
