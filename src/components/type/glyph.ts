/**
 * Glyph geometry for the facades, traced from canvas rasters: the closed counter a camera can
 * fly through, and the outline the long shadow is swept from. Browser only.
 */

/** One hard light from the upper left: shadows fall along +LIGHT. */
export const LIGHT: [number, number] = [0.78, 0.62];

export interface FontSpec {
  family: string;
  /** Canvas `fontStretch` keyword. */
  stretch: CanvasFontStretch;
}

export function setFont(
  ctx: CanvasRenderingContext2D,
  f: FontSpec,
  size: number,
  weight: number,
) {
  ctx.font = `${Math.round(weight)} ${size}px ${f.family}`;
  ctx.fontStretch = f.stretch;
}

interface Raster {
  W: number;
  H: number;
  ox: number;
  oy: number;
  asc: number;
  Fh: number;
  ink: (p: number) => boolean;
  alpha: Uint8ClampedArray;
}

function raster(ch: string, f: FontSpec, Fh: number, weight: number): Raster {
  const c = document.createElement("canvas");
  const x = c.getContext("2d", { willReadFrequently: true })!;
  setFont(x, f, Fh, weight);
  x.textAlign = "center";
  const m = x.measureText(ch);
  const pad = 12;
  const W =
    Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + pad * 2;
  const H =
    Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + pad * 2;
  c.width = W;
  c.height = H;
  const ox = m.actualBoundingBoxLeft + pad;
  const oy = m.actualBoundingBoxAscent + pad;
  setFont(x, f, Fh, weight);
  x.textAlign = "center";
  x.fillStyle = "#fff";
  x.fillText(ch, ox, oy);
  const data = x.getImageData(0, 0, W, H).data;
  const alpha = new Uint8ClampedArray(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = data[p * 4 + 3];
  return {
    W,
    H,
    ox,
    oy,
    asc: m.actualBoundingBoxAscent,
    Fh,
    alpha,
    ink: (p) => alpha[p] > 110,
  };
}

/** Height of the rasters, in px; outlines are scaled from it. */
const FH = 320;

export interface Outline {
  /** Closed loops in glyph units (origin = centre of the advance on the baseline), FH px per em. */
  loops: [number, number][][];
  /** Per edge: does it cast a shadow (stepping along the light leaves the glyph)? */
  casts: boolean[][];
}

const outlineCache = new Map<string, Outline>();
// marching squares: which cell edges a contour crosses, per corner mask
const SEG: (string[] | null)[] = [
  null,
  ["L", "B"],
  ["B", "R"],
  ["L", "R"],
  ["T", "R"],
  ["T", "R", "L", "B"],
  ["T", "B"],
  ["T", "L"],
  ["T", "L"],
  ["T", "B"],
  ["T", "L", "B", "R"],
  ["T", "R"],
  ["L", "R"],
  ["B", "R"],
  ["L", "B"],
  null,
];

/** Outline of a glyph as simplified polygons (marching squares + Douglas-Peucker). */
export function outline(
  ch: string,
  f: FontSpec,
  weight: number,
  px = FH,
): Outline {
  const key = `${ch}|${f.family}|${f.stretch}|${weight}|${px}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  // Traced at `px` (the window needs a finer edge than the shadows); returned in FH units.
  const g = raster(ch, f, px, weight);
  const u = FH / px;
  const { W, H, alpha } = g;
  const inside = (x: number, y: number) => alpha[y * W + x] >= 128;
  const adj = new Map<number, number[]>();
  const pt = new Map<number, [number, number]>();
  const K = (x2: number, y2: number) => x2 * 8192 + y2;
  const link = (p: number, q: number) => {
    (adj.get(p) ?? adj.set(p, []).get(p)!).push(q);
    (adj.get(q) ?? adj.set(q, []).get(q)!).push(p);
  };
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W - 1; x++) {
      const idx =
        (+inside(x, y) << 3) |
        (+inside(x + 1, y) << 2) |
        (+inside(x + 1, y + 1) << 1) |
        +inside(x, y + 1);
      const s = SEG[idx];
      if (!s) continue;
      // Edge keys on a doubled grid; the point itself sits where the alpha crosses 128 (sub-pixel).
      const P: Record<string, [number, number]> = {
        T: [2 * x + 1, 2 * y],
        R: [2 * x + 2, 2 * y + 1],
        B: [2 * x + 1, 2 * y + 2],
        L: [2 * x, 2 * y + 1],
      };
      const a = (xx: number, yy: number) => alpha[yy * W + xx];
      const t = (a0: number, a1: number) =>
        a0 === a1 ? 0.5 : clamp01((128 - a0) / (a1 - a0));
      const Q: Record<string, [number, number]> = {
        T: [x + t(a(x, y), a(x + 1, y)), y],
        R: [x + 1, y + t(a(x + 1, y), a(x + 1, y + 1))],
        B: [x + t(a(x, y + 1), a(x + 1, y + 1)), y + 1],
        L: [x, y + t(a(x, y), a(x, y + 1))],
      };
      for (let i = 0; i < s.length; i += 2) {
        const p = K(...P[s[i]]);
        const q = K(...P[s[i + 1]]);
        pt.set(p, Q[s[i]]);
        pt.set(q, Q[s[i + 1]]);
        link(p, q);
      }
    }
  const seen = new Set<number>();
  const loops: [number, number][][] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop: [number, number][] = [];
    let prev = -1;
    let cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      const [x2, y2] = pt.get(cur)!;
      loop.push([(x2 + 0.5 - g.ox) * u, (y2 + 0.5 - g.oy) * u]);
      const n = adj.get(cur)!;
      const nx = n[0] !== prev ? n[0] : n[1];
      prev = cur;
      cur = nx;
    }
    if (loop.length > 8) loops.push(rdpClosed(loop, 0.5 * u));
  }
  const isIn = (x: number, y: number) => {
    const xi = Math.round(x / u + g.ox);
    const yi = Math.round(y / u + g.oy);
    return xi >= 0 && yi >= 0 && xi < W && yi < H && inside(xi, yi);
  };
  const casts = loops.map((lp) =>
    lp.map((p, i) => {
      const q = lp[(i + 1) % lp.length];
      return !isIn(
        (p[0] + q[0]) / 2 + LIGHT[0] * 2,
        (p[1] + q[1]) / 2 + LIGHT[1] * 2,
      );
    }),
  );
  const res = { loops, casts };
  outlineCache.set(key, res);
  return res;
}

/** Counter centre and size (glyph units, FH px per em) by flood fill from the given row, or null if it is open. */
export function counter(
  ch: string,
  f: FontSpec,
  weight: number,
  rowFrac: number,
): { cx: number; cy: number; w: number; h: number } | null {
  const g = raster(ch, f, FH, weight);
  const { W, H, ink } = g;
  const row = Math.round(g.oy - g.asc * rowFrac);
  let xx = 0;
  while (xx < W && !ink(row * W + xx)) xx++;
  while (xx < W && ink(row * W + xx)) xx++;
  const g0 = xx;
  while (xx < W && !ink(row * W + xx)) xx++;
  if (xx >= W) return null;
  const mask = new Uint8Array(W * H);
  const stack = [row * W + ((g0 + xx) >> 1)];
  let x0 = W,
    y0 = H,
    x1 = 0,
    y1 = 0;
  while (stack.length) {
    const p = stack.pop()!;
    if (mask[p] || ink(p)) continue;
    const y = (p / W) | 0;
    let l = p,
      r = p;
    while (l % W > 0 && !mask[l - 1] && !ink(l - 1)) l--;
    while (r % W < W - 1 && !mask[r + 1] && !ink(r + 1)) r++;
    if (l % W === 0 || r % W === W - 1 || y === 0 || y === H - 1) return null; // leaked: not closed
    x0 = Math.min(x0, l % W);
    x1 = Math.max(x1, r % W);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    for (let q = l; q <= r; q++) {
      mask[q] = 1;
      if (y > 0 && !mask[q - W] && !ink(q - W)) stack.push(q - W);
      if (y < H - 1 && !mask[q + W] && !ink(q + W)) stack.push(q + W);
    }
  }
  return {
    cx: (x0 + x1) / 2 - g.ox,
    cy: (y0 + y1) / 2 - g.oy,
    w: x1 - x0,
    h: y1 - y0,
  };
}
export const GLYPH_PX = FH;

/** Counter rows (fraction of the cap height above the baseline) where the bowl is. */
const ROW: Record<string, number> = {
  P: 0.72,
  R: 0.72,
  B: 0.72,
  A: 0.42,
  "9": 0.68,
  "6": 0.3,
  "8": 0.72,
  "4": 0.55,
};
/** Letters ranked by how well their counter frames a room. */
const RANK = "OQD0PRB968A4";

/** Index of the letter to fly through: the best-ranked counter, nearest the middle of the word. */
export function pickCounter(chars: string[]): number {
  const mid = (chars.length - 1) / 2;
  for (const c of RANK) {
    let best = -1;
    chars.forEach((ch, i) => {
      if (ch === c && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)))
        best = i;
    });
    if (best >= 0) return best;
  }
  return -1;
}
export const counterRow = (ch: string) => ROW[ch] ?? 0.5;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function rdp(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const dx = bx - ax,
    dy = by - ay,
    len = Math.hypot(dx, dy) || 1;
  let mi = 0,
    md = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
    if (d > md) {
      md = d;
      mi = i;
    }
  }
  if (md <= eps) return [pts[0], pts[pts.length - 1]];
  return rdp(pts.slice(0, mi + 1), eps)
    .slice(0, -1)
    .concat(rdp(pts.slice(mi), eps));
}
function rdpClosed(loop: [number, number][], eps: number): [number, number][] {
  let fi = 0,
    fd = 0;
  for (let i = 0; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > fd) {
      fd = d;
      fi = i;
    }
  }
  const a = rdp(loop.slice(0, fi + 1), eps);
  const b = rdp(loop.slice(fi).concat([loop[0]]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
}
