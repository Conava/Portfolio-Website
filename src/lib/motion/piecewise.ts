/** Pure maps from scene progress to choreography values. */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Local 0..1 progress of `p` inside the window [from, to], clamped. */
export function segment(p: number, from: number, to: number): number {
  return clamp01((p - from) / (to - from));
}

/** Linear interpolation through `points` (sorted by x), clamped at both ends. */
export function piecewise(points: [number, number][]): (x: number) => number {
  return (x) => {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i];
      if (x <= x1) {
        const [x0, y0] = points[i - 1];
        return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
      }
    }
    return points[points.length - 1][1];
  };
}

/** Discrete step index 0..n for progress `p` (n only at p = 1). */
export function steps(p: number, n: number): number {
  return Math.floor(clamp01(p) * n);
}
