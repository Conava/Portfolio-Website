import sharp from "sharp";

/** Pixel delta at which a channel counts as changed (out of 255). */
const THRESHOLD = 16;

function changed(a: Uint8Array, b: Uint8Array, i: number, threshold: number): boolean {
  return (
    Math.abs(a[i] - b[i]) > threshold ||
    Math.abs(a[i + 1] - b[i + 1]) > threshold ||
    Math.abs(a[i + 2] - b[i + 2]) > threshold ||
    Math.abs(a[i + 3] - b[i + 3]) > threshold
  );
}

function sameSize(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length || a.length % 4) throw new Error(`frame sizes differ: ${a.length} vs ${b.length} bytes`);
}

/** Raw RGBA buffers: fraction of pixels whose largest channel delta is above `threshold`. */
export function diffRatio(a: Uint8Array, b: Uint8Array, threshold = THRESHOLD): number {
  sameSize(a, b);
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (changed(a, b, i, threshold)) n++;
  return n / (a.length / 4);
}

export type Box = { x: number; y: number; w: number; h: number };

/** Bounding box of the changed pixels between two raw RGBA frames of `width` px, or null. */
export function changedBox(a: Uint8Array, b: Uint8Array, width: number, threshold = THRESHOLD): Box | null {
  sameSize(a, b);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0; i < a.length; i += 4) {
    if (!changed(a, b, i, threshold)) continue;
    const p = i / 4, x = p % width, y = Math.floor(p / width);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type Analysis = { spikes: number[]; dead: [number, number][]; firstResponse: number | null };

/**
 * Reads a series of neighbor-frame diff ratios (index i = frame i -> i+1).
 * - spike: ratio > spikeFactor x the median of its ±3 neighbors, and > 0.002 (a pop);
 * - dead: >= deadMin consecutive ratios < deadEps between the first and last active pair
 *   (inclusive index ranges; resting before or after the motion is not dead);
 * - firstResponse: the first active pair (ratio >= deadEps), or null if nothing moved.
 */
export function analyze(ratios: number[], opts: { spikeFactor?: number; deadEps?: number; deadMin?: number } = {}): Analysis {
  const { spikeFactor = 4, deadEps = 0.0005, deadMin = 6 } = opts;
  const spikes: number[] = [];
  ratios.forEach((r, i) => {
    const near = [...ratios.slice(Math.max(0, i - 3), i), ...ratios.slice(i + 1, i + 4)];
    if (r > 0.002 && r > spikeFactor * (near.length ? median(near) : 0)) spikes.push(i);
  });
  const active = ratios.map((r) => r >= deadEps);
  const first = active.indexOf(true);
  const last = active.lastIndexOf(true);
  const dead: [number, number][] = [];
  for (let i = first + 1, start = -1; first >= 0 && i <= last; i++) {
    if (!active[i] && start < 0) start = i;
    if (active[i] && start >= 0) {
      if (i - start >= deadMin) dead.push([start, i - 1]);
      start = -1;
    }
  }
  return { spikes, dead, firstResponse: first >= 0 ? first : null };
}

export type Raw = { data: Uint8Array; width: number; height: number };

/** Decodes a PNG to raw RGBA. */
export async function readRaw(file: string): Promise<Raw> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/** Line chart of the ratios (frames on x, diff ratio on y), spikes in red, dead stretches shaded. */
export async function writePlot(file: string, ratios: number[], a: Analysis): Promise<void> {
  const W = 1200, H = 400, L = 60, R = 20, T = 20, B = 40;
  const max = Math.max(0.01, ...ratios);
  const x = (i: number) => L + (ratios.length > 1 ? (i / (ratios.length - 1)) * (W - L - R) : 0);
  const y = (r: number) => T + (1 - r / max) * (H - T - B);
  const pts = ratios.map((r, i) => `${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = f * max;
    return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#ddd"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(3)}</text>`;
  });
  const xTicks = ratios.map((_, i) => i).filter((i) => i % Math.max(1, Math.ceil(ratios.length / 20)) === 0)
    .map((i) => `<text x="${x(i)}" y="${H - B + 16}" text-anchor="middle">${i}</text>`);
  const dead = a.dead.map(([s, e]) => `<rect x="${x(s)}" y="${T}" width="${Math.max(2, x(e) - x(s))}" height="${H - T - B}" fill="#4a90d9" fill-opacity=".15"/>`);
  const spikes = a.spikes.map((i) => `<circle cx="${x(i)}" cy="${y(ratios[i])}" r="5" fill="none" stroke="#d33" stroke-width="2"/><text x="${x(i)}" y="${y(ratios[i]) - 9}" text-anchor="middle" fill="#d33">${i}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif" font-size="11">
<rect width="100%" height="100%" fill="#fff"/>${ticks.join("")}${dead.join("")}${xTicks.join("")}
<polyline points="${pts}" fill="none" stroke="#222" stroke-width="1.5"/>${spikes.join("")}
<text x="${W / 2}" y="${H - 6}" text-anchor="middle">frame pair (i -> i+1); red = spike, blue = dead stretch</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}
