/**
 * Flow's live subject: one set of N metal tokens that takes a new form in every beat of the page
 * and keeps a small motion going inside each form. Client only, loaded lazily (three.js).
 *
 * Each form is a list of N slots (position, size, rotation, glow), built from the beat's content:
 * one part per job, school, PR or project the text lists, tagged with the text item it stands for
 * (`item`), so the part of the item being read lights up. Moving from beat k to k+1 interpolates
 * every token from its slot in form k to its matched slot in form k+1 along a quadratic path, in
 * a fixed order, so one picture turns into the next and nothing pops in.
 *
 * Each form is fitted into its beat's stage (`[data-stage]`), a box in the page layout beside the
 * text; tokens that come near a line of text, a control or the header shrink away (see clearance),
 * so a form's edge may meet the text but never sits under it. Native scroll only.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import type { DuxPart, FlowSceneData } from "./scene-data";

type V3 = THREE.Vector3;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Slot = { p: V3; s: V3; q?: THREE.Quaternion } & Record<string, any>;
/** `u`: a stream token's place along its stream (0..1). */
interface Out { p: V3; q: THREE.Quaternion; s: V3; g: number; c: THREE.Color; b: THREE.Color; u: number }
/** `labels`: where the page's label for each text item stands on the form (group space). */
interface Layout { slots: Slot[]; live?: (sl: Slot, t: number, o: Out) => void; labels?: Map<number, V3> }
type Curve = (u: number, t: number, o: V3) => V3;

const N = 640;
const TAU = Math.PI * 2;
const fract = (x: number) => x - Math.floor(x);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);
const Y = V(0, 1, 0);
const Z = V(0, 0, 1);
const AMBER = new THREE.Color("#ff9838");
const WHITE = new THREE.Color("#ffe6c4");
const MODERN = new THREE.Color("#34353a");
const LEGACY = new THREE.Color("#5b4a3b");
const WALL = new THREE.Color("#141519");
const PANE = new THREE.Color("#5a5b63");
const P = V(), P2 = V(), T = V(), Nn = V();
const out = (): Out => ({ p: V(), q: new THREE.Quaternion(), s: V(), g: 0, c: new THREE.Color(), b: new THREE.Color(), u: 0 });

/* ---------- slot builders ---------- */
function block(arr: Slot[], nx: number, ny: number, nz: number, sp: number, c: V3, tsz: number, extra: Record<string, unknown> = {}) {
  const start = arr.length;
  for (let y = 0; y < ny; y++)
    for (let z = 0; z < nz; z++)
      for (let x = 0; x < nx; x++) {
        const surf = x === 0 || x === nx - 1 || y === 0 || y === ny - 1 || z === 0 || z === nz - 1;
        arr.push({
          p: V(c.x + (x - (nx - 1) / 2) * sp, c.y + (y - (ny - 1) / 2) * sp, c.z + (z - (nz - 1) / 2) * sp),
          s: V(tsz, tsz, tsz),
          lx: x, ly: y, lz: z, nx, ny, nz, surf, idx: arr.length - start,
          ...extra,
        });
      }
}
function line(arr: Slot[], a: V3, b: V3, step: number, tsz: number, extra: Record<string, unknown> = {}) {
  const d = b.clone().sub(a), n = Math.max(1, Math.round(d.length() / step));
  const q = new THREE.Quaternion().setFromUnitVectors(X, d.clone().normalize());
  for (let i = 0; i < n; i++) arr.push({ p: a.clone().addScaledVector(d, (i + 0.5) / n), s: V(tsz * 1.5, tsz * 0.55, tsz * 0.55), q, conn: true, ...extra });
}
function ring(arr: Slot[], n: number, r: number, c: V3, tsz: number, extra: Record<string, unknown> = {}) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    arr.push({ p: V(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, c.z), s: V(tsz * 1.3, tsz * 0.8, tsz * 0.8), q: new THREE.Quaternion().setFromAxisAngle(Z, a + Math.PI / 2), ...extra });
  }
}
function spares(arr: Slot[], anchors: V3[]) {
  let i = 0;
  while (arr.length < N) arr.push({ p: anchors[i++ % anchors.length].clone(), s: V(), spare: true });
  return arr.slice(0, N);
}
function stream(arr: Slot[], lanes: number, per: number, curve: Curve, o: { speed: number; laneW: number; sz: number; hide?: (x: number) => number; twist?: number; ev?: number; packets?: (x: number, t: number) => number; reveal?: number; shape?: [number, number, number]; extra?: Record<string, unknown> }) {
  for (let lane = 0; lane < lanes; lane++)
    for (let k = 0; k < per; k++)
      arr.push({ s: V(), p: V(), stream: true, lane, lanes, k, per, curve, speed: o.speed, laneW: o.laneW, sz: o.sz, hide: o.hide, twist: o.twist || 0, ev: o.ev ?? 0.14, packets: o.packets, reveal: o.reveal, shape: o.shape ?? [2.2, 1, 1], ...o.extra });
}
function liveStream(sl: Slot, t: number, o: Out) {
  const u = fract(sl.k / sl.per + t * sl.speed);
  sl.curve(u, t, P);
  sl.curve(u + 0.002, t, P2);
  T.subVectors(P2, P).normalize();
  if (sl.twist) {
    const a = u * TAU * sl.twist + t * 0.22;
    Nn.set(0, Math.cos(a), Math.sin(a));
  } else Nn.set(0, 1, 0);
  o.p.copy(P).addScaledVector(Nn, (sl.lane - (sl.lanes - 1) / 2) * sl.laneW);
  o.q.setFromUnitVectors(X, T);
  let vis = smooth(0, 0.06, u) * smooth(1, 0.94, u);
  if (sl.hide) vis *= sl.hide(o.p.x);
  // opening: the stream pours in from its far end (u = 1) over `reveal` seconds
  if (sl.reveal && !measure.ext) vis *= smooth(1.06 - (t / sl.reveal) * 1.2, 1.14 - (t / sl.reveal) * 1.2, u);
  o.s.set(sl.sz * sl.shape[0], sl.sz * sl.shape[1], sl.sz * sl.shape[2]).multiplyScalar(vis);
  o.u = u;
  o.g = isEvent(sl.k, sl.lane, sl.ev) ? 0.7 : 0;
  if (sl.packets) o.g = Math.max(o.g, sl.packets(o.p.x, t));
  o.c.copy(AMBER);
}
/** Events sit at a fixed spacing along each lane, offset lane by lane: a regular pattern, not noise. */
function isEvent(k: number, lane: number, ev: number) {
  const every = Math.max(2, Math.round(1 / ev));
  return (k + lane * 3) % every === 0;
}
const hideIn = (ranges: number[][], w = 0.12) => (x: number) => {
  let v = 1;
  for (const [a, b] of ranges) v = Math.min(v, 1 - smooth(a - w, a + w, x) * smooth(b + w, b - w, x));
  return v;
};
const packetsAt = (x0: number, x1: number, speed: number, count: number) => (x: number, t: number) => {
  let g = 0;
  for (let i = 0; i < count; i++) {
    const px = lerp(x0, x1, fract(t * speed + i / count));
    g = Math.max(g, Math.exp(-((x - px) ** 2) * 9));
  }
  return g * 1.1;
};

/* ---------- the forms, one per beat ---------- */
/** `ext`: measuring a form's extent, so every part that can appear counts (all steps shown). */
const measure = { ext: false };
/** The hero stream's path in camera space: far end, control point, near end. */
const HERO = { far: V(10, 6.5, -18), ctl: V(-6.5, 0.4, -3), near: V(4.2, -3, 8) };
/** `focus[k]`: the text item of beat k being read, or -1. */
/** `runState`: the stage the page's devline run figure shows, eased (`rp`, -1 before the figure, n after it), and whether it is pinned. */
/** `view`: the camera plane's size in world units, and the contact ring's ellipse in it (forms laid out in camera space). */
type View = { vw: number; vh: number; ring: { cx: number; cy: number; rx: number; ry: number } };
function buildLayouts(data: FlowSceneData, codeCursor: { cur: number }, focus: number[], runState: { rp: number; pinned: boolean }, view: View): Layout[] {
  const L: Layout[] = [];

  // 0 hero: the open event stream, ten lanes, rising out of the depth past the name; it pours in from
  // its far end when the page opens
  {
    const a: Slot[] = [];
    // in camera space (drawn unscaled, see fit): from far behind the upper right, round past the name,
    // and out toward the viewer at the lower right
    const F = HERO.far, C = HERO.ctl, Nr = HERO.near;
    stream(a, 10, 64, (u, t, o) => {
      const w = 1 - u;
      o.set(0, 0, 0).addScaledVector(Nr, w * w).addScaledVector(C, 2 * w * u).addScaledVector(F, u * u);
      o.y += 0.35 * Math.sin(u * TAU * 1.3 + t * 0.35) * u;
      return o;
    }, { speed: 0.008, laneW: 0.26, sz: 0.13, twist: 0.6, ev: 0.17, reveal: 2.4 });
    L.push({ slots: spares(a, [V()]) });
  }

  // 1 about: one service sits on the stream and processes it
  {
    const a: Slot[] = [];
    block(a, 6, 6, 6, 0.32, V(), 0.28, { svc: 0 });
    stream(a, 6, 70, (u, t, o) => o.set((u - 0.5) * 13, 0.12 * Math.sin(u * 9 + t * 0.6), 0), {
      speed: 0.03, laneW: 0.2, sz: 0.1, ev: 0.1, packets: packetsAt(-6, 6, 0.09, 2),
      hide: (x) => hideIn([[-0.95, 0.95]])(x) * smooth(4.6, 3.6, Math.abs(x)),
    });
    L.push({
      slots: spares(a, [V()]),
      live(sl, t, o) {
        if (sl.svc === 0 && sl.surf) o.g = sl.lx === Math.floor(fract(t * 0.45) * 6) ? 0.6 : 0;
      },
    });
  }

  // 2 earlier work, one row per job as the text lists them. Item 0, the lead job's data onboarding: streams
  // in many formats come in over two channels each to the intake applications; each application keeps a
  // ledger of what came in on which connection (so an update lands exactly where it belongs), everything is
  // translated into one internal format and goes on into the distributed platform and down to the legacy
  // system. An update walks that whole path every few seconds. Every other job: a slab as long as it lasted.
  {
    const nA = data.intake, nS = nA * 2, appY = (i: number) => ((nA - 1) / 2 - i) * 1.05;
    const AX = -2.3, LX = -1.45, TX = 0.75, PX = 3.55, PY = 1.15, GY = -1.5;
    // the formats: bars, cubes, upright sheets, long lines, flat tiles
    const FORMATS: [number, number, number][] = [[2.2, 1, 1], [1, 1, 1], [0.5, 1.7, 1.3], [3.4, 0.5, 0.5], [1.3, 0.45, 1.3]];
    const a: Slot[] = [], labels = new Map<number, V3>();
    for (let s = 0; s < nS; s++) {
      const y0 = ((nS - 1) / 2 - s) * 0.6, y1 = appY(s >> 1) + (s & 1 ? -0.16 : 0.16);
      stream(a, 1, 22, (u, _t, o) => o.set(lerp(-6.4, AX - 0.42, u), lerp(y0, y1, smooth(0.2, 0.95, u)), 0), {
        speed: 0.045 + 0.012 * (s % 3), laneW: 0, sz: 0.085, ev: 0.11, shape: FORMATS[s % FORMATS.length], extra: { src: s },
      });
    }
    for (let i = 0; i < nA; i++) {
      block(a, 3, 3, 2, 0.2, V(AX, appY(i), 0), 0.18, { intake: i, item: 0 });
      for (let j = 0; j < 4; j++) a.push({ p: V(LX + j * 0.2, appY(i), 0), s: V(0.15, 0.15, 0.15), ledger: i, rec: j });
      stream(a, 1, 9, (u, _t, o) => o.set(lerp(LX + 0.85, TX - 0.5, u), lerp(appY(i), appY(i) * 0.25, smooth(0, 1, u)), 0), { speed: 0.09, laneW: 0, sz: 0.075, ev: 0.2, shape: [1, 1, 1], extra: { inner: i } });
    }
    block(a, 4, 4, 3, 0.21, V(TX, 0, 0), 0.19, { core: true, item: 0 });
    // into the platform (up) and to the legacy system (down), both in the internal format
    const out = (y1: number) => (u: number, _t: number, o: V3) => o.set(lerp(TX + 0.55, PX - 1.05, u), lerp(0, y1, smooth(0.1, 0.9, u)), 0);
    stream(a, 2, 12, out(PY), { speed: 0.07, laneW: 0.17, sz: 0.075, ev: 0.2, shape: [1, 1, 1], extra: { toPlat: true } });
    stream(a, 2, 12, out(GY), { speed: 0.07, laneW: 0.17, sz: 0.075, ev: 0.2, shape: [1, 1, 1], extra: { toLegacy: true } });
    for (let d = 0; d < 2; d++) for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) a.push({ p: V(PX + (c - 1.5) * 0.42, PY + (r - 1) * 0.42, (d - 0.5) * 0.42), s: V(0.26, 0.26, 0.26), plat: c + r * 4 + d * 12 });
    block(a, 5, 3, 3, 0.26, V(PX, GY, 0), 0.24, { legacy: true, legacySys: true });
    // each label on the part it names: the incoming streams, the intake applications (under the lowest),
    // the translator, the platform and the legacy system (above them)
    labels.set(0, V(-6.3, (nS / 2) * 0.6 + 0.2, 0));
    labels.set(1, V(AX - 0.3, appY(nA - 1) - 0.95, 0));
    labels.set(2, V(TX - 0.55, 0.8, 0));
    labels.set(3, V(PX - 0.75, PY + 0.75, 0));
    labels.set(4, V(PX - 0.7, GY + 0.62, 0));
    const rowY = Math.min(-(nS / 2) * 0.6, GY - 0.6) - 0.85;
    data.jobs.slice(1, 4).forEach((j, i) => {
      const nx = Math.max(2, Math.min(16, Math.round(j.months / 1.5)));
      block(a, nx, 2, 2, 0.3, V(-6.2 + (nx - 1) * 0.15, rowY - i * 0.8, 0), 0.26, { item: i + 1 });
    });
    // the update: one stream after another, through its application, ledger, the core, out to one record
    const CYC = 2.8;
    const upd = (t: number) => ({ s: Math.floor(t / CYC) % nS, n: Math.floor(t / CYC), ph: fract(t / CYC) });
    L.push({
      slots: spares(a, [V(TX, 0, 0)]),
      labels,
      live(sl, t, o) {
        const { s, n, ph } = upd(t);
        const at = (a0: number, a1: number) => smooth(a0, a0 + 0.04, ph) * smooth(a1 + 0.04, a1, ph);
        if (sl.src !== undefined && sl.src === s && ph < 0.42) o.g = Math.max(o.g, 1.5 * Math.exp(-((o.u - ph / 0.4) ** 2) * 300));
        else if (sl.intake !== undefined) o.g = sl.intake === s >> 1 ? (sl.surf ? 0.75 * at(0.38, 0.55) : 0) : 0;
        else if (sl.ledger !== undefined) {
          // the record of this connection lights, and stays a little lit
          const mine = sl.ledger === s >> 1 && sl.rec === (n >> 1) % 4;
          o.g = mine ? 0.15 + 1.1 * at(0.48, 0.9) : 0.06;
        } else if (sl.inner !== undefined) o.g = sl.inner === s >> 1 && ph > 0.55 && ph < 0.75 ? Math.max(o.g, 1.3 * Math.exp(-((o.u - (ph - 0.55) / 0.2) ** 2) * 60)) : o.g * 0.5;
        else if (sl.core) o.g = sl.surf ? 0.08 + 0.6 * at(0.72, 0.84) : 0;
        else if (sl.toPlat || sl.toLegacy) o.g = ph > 0.82 ? Math.max(o.g * 0.5, 1.3 * Math.exp(-((o.u - (ph - 0.82) / 0.16) ** 2) * 50)) : o.g * 0.5;
        else if (sl.plat !== undefined) o.g = sl.plat === (n * 7 + s) % 24 ? 0.12 + 1.2 * smooth(0.93, 0.98, ph) : 0.04;
        else if (sl.legacySys) o.g = sl.surf ? 0.05 + 0.45 * smooth(0.93, 0.98, ph) : 0;
      },
    });
  }

  // 3 current work, at the scale it runs: services in layers, from the features users see (top) down to the
  // storage layer over the database (bottom), each in a container on a Kubernetes cluster (the plate behind),
  // the same stack in several regions (three drawn: "several", not a count). Git holds the deployed state:
  // a new commit syncs to one region after another, which rolls its containers. Requests travel down the
  // layers; the services the text counts are the team's own (centre region).
  {
    const RXS = [-3.7, 0, 3.7], NL = [6, 5, 4, 2], LY = [2.25, 1.1, -0.05, -1.2], DBY = -2.1, RW = 2.7, GITY = 3.55;
    const nodeX = (l: number, i: number) => (i - (NL[l] - 1) / 2) * (RW / NL[l]);
    const next = (l: number, i: number) => Math.round((i * (NL[l + 1] - 1)) / Math.max(1, NL[l] - 1));
    // the team's own services, picked from the storage layer up
    const ORDER: [number, number][] = [[3, 0], [2, 1], [1, 2], [2, 3], [1, 0], [3, 1]];
    const own = new Set(ORDER.slice(0, data.services).map(([l, i]) => l * 10 + i));
    const a: Slot[] = [], labels = new Map<number, V3>();
    RXS.forEach((cx, r) => {
      // the cluster: a dotted frame around the region's stack
      const fx = RW / 2 + 0.25, fy0 = DBY - 0.5, fy1 = LY[0] + 0.5, fw = fx * 2, fh = fy1 - fy0, per = 2 * (fw + fh), nF = Math.round(per / 0.36);
      for (let j = 0; j < nF; j++) {
        let d = (j / nF) * per;
        const pt = d < fw ? V(cx - fx + d, fy1) : (d -= fw) < fh ? V(cx + fx, fy1 - d) : (d -= fh) < fw ? V(cx + fx - d, fy0) : V(cx - fx, fy0 + d - fw);
        a.push({ p: pt.setZ(-0.3), s: V(0.12, 0.12, 0.06), cluster: r, cy: clamp01((fy1 - pt.y) / fh) });
      }
      NL.forEach((n, l) => {
        for (let i = 0; i < n; i++) {
          const mine = r === 1 && own.has(l * 10 + i), p = V(cx + nodeX(l, i), LY[l], 0);
          const sz = mine ? 0.4 : 0.32;
          a.push({ p, s: V(sz, sz, sz), node: true, region: r, l, i, own: mine });
          if (l + 1 < NL.length) {
            line(a, p, V(cx + nodeX(l + 1, next(l, i)), LY[l + 1], 0), 0.2, 0.07, { edge: true });
            if (i % 2 === 1 && next(l, i) + 1 < NL[l + 1]) line(a, p, V(cx + nodeX(l + 1, next(l, i) + 1), LY[l + 1], 0), 0.2, 0.07, { edge: true });
          } else line(a, p, V(cx + nodeX(l, i), DBY + 0.2, 0), 0.2, 0.07, { edge: true });
        }
      });
      block(a, 6, 1, 2, 0.4, V(cx, DBY, 0), 0.36, { db: r });
      // the sync from Git to this region's cluster
      line(a, V(cx * 0.35, GITY - 0.25, 0), V(cx, LY[0] + 0.55, 0), 0.26, 0.05, { sync: r });
      for (let p = 0; p < 4; p++) a.push({ p: V(cx, LY[0], 0), s: V(), req: p, region: r });
    });
    for (let c = 0; c < 8; c++) a.push({ p: V((c - 3.5) * 0.36, GITY, 0), s: V(0.26, 0.26, 0.26), commit: c });
    labels.set(0, V(RXS[0] - RW / 2 - 0.45, LY[0] - 0.12, 0));
    labels.set(1, V(RXS[0] - RW / 2 - 0.45, LY[3] - 0.12, 0));
    labels.set(2, V(-1.15, GITY + 0.3, 0));
    // a request's way down: from a feature, along the edges, to the database
    const path = (r: number, p: number, t: number, o: V3) => {
      const T = 3.4, ph = fract(t / T + p / 4 + r * 0.13), seg = ph * 4, l = Math.min(3, Math.floor(seg)), f = ease(seg - l);
      let i = (p * 2 + r + Math.floor(t / T + p / 4 + r * 0.13)) % NL[0];
      for (let k = 0; k < l; k++) i = next(k, i);
      const x0 = nodeX(l, i), y0 = LY[l], x1 = l < 3 ? nodeX(l + 1, next(l, i)) : x0, y1 = l < 3 ? LY[l + 1] : DBY + 0.2;
      return o.set(RXS[r] + lerp(x0, x1, f), lerp(y0, y1, f), 0.22);
    };
    const pk = V(), SYNC = 6;
    L.push({
      slots: spares(a, [V(0, 0, 0)]),
      labels,
      live(sl, t, o) {
        // a commit every SYNC seconds; region r receives it r * 0.7 s later and rolls its containers
        const cyc = t / SYNC, ph = fract(cyc), roll = (r: number) => (ph - 0.18 - r * 0.12) / 0.35;
        if (sl.commit !== undefined) o.g = sl.commit === Math.floor(cyc) % 8 ? 0.3 + 0.9 * smooth(0, 0.08, ph) : 0.06;
        else if (sl.sync !== undefined) {
          const d = (ph - 0.05 - sl.sync * 0.12) / 0.13;
          o.g = d > 0 && d < 1 ? 1.2 : 0.04;
        } else if (sl.cluster !== undefined) {
          const w = roll(sl.cluster);
          o.g = w > 0 && w < 1.2 ? 0.08 + 0.8 * smooth(0.2, 0, Math.abs(w - sl.cy)) : 0.06;
        } else if (sl.req !== undefined) {
          path(sl.region, sl.req, t, o.p);
          o.s.setScalar(0.12);
          o.g = 1.4;
          o.c.copy(WHITE);
        } else if (sl.node) {
          // the rollout restarts each container in turn; a request passing lights it
          const w = roll(sl.region) * 6 - (sl.l * 1.2 + sl.i * 0.2);
          if (w > 0 && w < 1) o.s.multiplyScalar(0.35 + 0.65 * Math.abs(1 - 2 * w));
          let g = sl.own ? 0.4 + 0.15 * Math.sin(t * 2 + sl.i) : 0.03;
          for (let p = 0; p < 4; p++) g = Math.max(g, 0.8 * smooth(0.32, 0.05, path(sl.region, p, t, pk).setZ(0).distanceTo(sl.p)));
          o.g = g;
        } else if (sl.edge) o.g = 0.08;
        else if (sl.db !== undefined) o.g = sl.surf ? 0.04 : 0;
      },
    });
  }

  // 4 the migration I lead, a pinned beat in two steps: the old platform on the left, the new one on the
  // right. Item 0: app by app, a copy starts on the new platform, both run side by side while traffic moves
  // over, then the old one stops; traffic never stops. Item 1: the stateful app's state is written to a
  // changelog, a Kafka partition drawn as a commit log of records, and replayed into the app on the new side.
  {
    const [, total] = data.migrate, cols = Math.ceil(total / 2), S = total - 1;
    const ENV = [{ y: 0, z: 0 }], OX = -2.35, NX = 2.35, sp = 0.62;
    const appPos = (e: number, side: number, i: number) => V(side + ((i % cols) - (cols - 1) / 2) * sp, ENV[e].y + 0.33, ENV[e].z + (i < cols ? -0.34 : 0.34));
    const a: Slot[] = [], labels = new Map<number, V3>();
    ENV.forEach((en, e) => {
      for (const [side, old] of [[OX, true], [NX, false]] as const)
        for (let z = 0; z < 3; z++) for (let x = 0; x < cols + 1; x++) a.push({ p: V(side + (x - cols / 2) * 0.6, en.y, en.z + (z - 1) * 0.55), s: V(0.55, 0.06, 0.5), plate: old ? "old" : "new", legacy: old, env: e });
      for (let i = 0; i < total; i++) {
        block(a, 2, 2, 2, 0.27, appPos(e, OX, i), 0.25, { app: i, env: e, old: true, legacy: true });
        block(a, 2, 2, 2, 0.27, appPos(e, NX, i), 0.25, { app: i, env: e, old: false });
      }
      // traffic: in from the left to a router, then over to whichever side serves it
      stream(a, 2, 9, (u, _t, o) => o.set(lerp(-5.7, OX - 1.6, u), en.y + 0.3, en.z), { speed: 0.1, laneW: 0.2, sz: 0.09, ev: 0.3, shape: [1.6, 1, 1], extra: { env: e } });
      stream(a, 1, 14, (u, _t, o) => o.set(lerp(OX - 1.5, NX - 1.6, u), en.y + 0.3 + 0.95 * Math.sin(Math.PI * u), en.z), { speed: 0.07, laneW: 0, sz: 0.09, ev: 0.3, shape: [1.6, 1, 1], extra: { env: e, toNew: true } });
    });
    // under each platform, its name; above the changelog's arc, the changelog
    labels.set(0, V(OX - 1.6, -0.75, 0.9));
    labels.set(1, V(NX - 1.6, -0.75, 0.9));
    // the changelog: records at rising offsets from the old stateful app over to the new one
    const R = 14, l0 = appPos(0, OX, S).add(V(0.2, 0.55, 0)), l1 = appPos(0, NX, S).add(V(-0.2, 0.55, 0));
    labels.set(2, V(-1.1, l0.y + 0.95, 0));
    for (let r = 0; r < R; r++) a.push({ p: l0.clone().lerp(l1, (r + 0.5) / R).add(V(0, 0.55 * Math.sin((Math.PI * (r + 0.5)) / R), 0)), s: V(0.22, 0.09, 0.3), rec: r, recs: R, item: 1 });
    // the migration's progress in apps; it keeps running, and holds at the stateful app while step 2 is read
    const st = { m: -0.5, at: -1, log: 0 }, END = total + 2.5;
    const sync = (t: number) => {
      if (t === st.at) return;
      const dt = st.at < 0 || t < st.at ? 0 : Math.min(0.1, t - st.at);
      st.at = t;
      if (measure.ext) {
        st.m = S + 0.6;
        st.log = 1;
        return;
      }
      const hold = focus[4] === 1;
      if (hold) st.m += (S + 0.6 - st.m) * (1 - Math.exp(-dt * 3));
      else st.m = st.m + dt / 1.5 > END ? -0.5 : st.m + dt / 1.5;
      st.log = clamp01(st.log + (hold ? dt : -dt * 2) / 1.2);
    };
    // 0..1: how far app i has come, and the end-of-loop reset
    const phase = (_e: number, i: number) => st.m - i;
    const reset = () => smooth(END - 1, END, st.m);
    L.push({
      slots: spares(a, [appPos(0, NX, 0), appPos(0, OX, 0)]),
      labels,
      live(sl, t, o) {
        sync(t);
        if (sl.app !== undefined) {
          const p = phase(sl.env, sl.app), rs = reset();
          let v = sl.old ? 1 - smooth(1.0, 1.35, p) : smooth(0, 0.35, p);
          if (sl.old) v = Math.max(v, rs);
          else v *= 1 - rs;
          // the stateful app on the new side is rebuilt from the changelog while step 2 is read
          if (!sl.old && sl.app === S && st.log > 0) v = Math.min(v, clamp01(st.log * 1.3 * 8 - sl.idx));
          o.s.multiplyScalar(v);
          // both copies run while traffic moves over: the old one drains, the new one takes load
          const both = p > 0.35 && p < 1.0;
          o.g = sl.surf && v > 0.05 ? (both ? 0.25 + 0.35 * Math.max(0, Math.sin(t * 5 + sl.app)) : sl.old ? 0.05 : 0.18) : 0;
        } else if (sl.plate) o.g = sl.plate === "new" ? 0.02 + 0.08 * clamp01(phase(sl.env, total - 1) / 1.4) : 0.02;
        else if (sl.toNew) o.s.multiplyScalar(clamp01(phase(sl.env, 0) * 2) * (1 - reset()));
        else if (sl.rec !== undefined) {
          const w = clamp01(st.log * (sl.recs + 4) - sl.rec);
          o.s.multiplyScalar(w);
          o.p.y += (1 - w) * 0.4;
          const cur = smooth(0, 0.6, fract(t / 4)) * (sl.recs + 1) - 0.5;
          o.g = 0.12 + 0.95 * smooth(0.9, 0, Math.abs(cur - sl.rec)) * st.log;
        }
      },
    });
  }
  // 5 education: one piece per school on a time axis, oldest on the left, each as long as the school
  // lasts: an exchange inside a degree sits on top of it, the school in progress glows, the upcoming
  // one is an open frame. Each piece carries its label from the page (logo and years, see labels).
  {
    const W = 8.4, x = (u: number) => (u - 0.5) * W, sp = 0.3, base = -0.55, LH = 0.95;
    const a: Slot[] = [], labels = new Map<number, V3>();
    line(a, V(x(0) - 0.3, base - 0.55, 0), V(x(1) + 0.3, base - 0.55, 0), 0.2, 0.08, { axis: true });
    data.schools.forEach((s, i) => {
      const c = V(x((s.x0 + s.x1) / 2), base + s.lane * LH, 0);
      const step = s.upcoming ? sp * 0.75 : sp, n = s.upcoming ? 4 : 3, nx = Math.max(2, Math.round(((s.x1 - s.x0) * W) / step));
      // the label stands on the back of the piece's top, at its left end
      labels.set(s.item, V(c.x - ((nx - 1) / 2) * step - 0.13, c.y + ((n - 1) / 2) * step + 0.13, -((n - 1) / 2) * step));
      if (!s.upcoming) {
        block(a, nx, n, n, sp, c, 0.26, { school: i, item: s.item, cur: s.current });
        return;
      }
      // upcoming: only the edges of the slab, open toward the future (no right face)
      const s0 = a.length;
      block(a, nx, n, n, step, c, 0.15, { school: i, item: s.item, upcoming: true });
      a.push(...a.splice(s0).filter((sl) => sl.lx < nx - 1 && [sl.lx === 0, sl.ly % (n - 1) === 0, sl.lz % (n - 1) === 0].filter(Boolean).length >= 2));
    });
    L.push({
      slots: spares(a, [V(x(0.3), base, 0)]),
      labels,
      live(sl, t, o) {
        if (sl.upcoming) o.g = 0.08 + 0.6 * smooth(0.14, 0, Math.abs(fract(t * 0.25) - sl.lx / sl.nx));
        else if (sl.cur) o.g = sl.ly === sl.ny - 1 ? 0.12 + 0.5 * smooth(0.12, 0, Math.abs(fract(t * 0.12) - sl.lx / sl.nx)) : 0;
        else if (sl.axis) o.g = 0.05;
      },
    });
  }

  // 6 BPMNscript: editor lines compile into a BPMN diagram; an instance token walks the process
  {
    const ED = V(-4.25, 0, 0);
    const NO: Record<string, V3> = { start: V(-1.55, 0, 0), t1: V(-0.35, 0, 0), g1: V(0.9, 0, 0), tu: V(2.2, 0.85, 0), td: V(2.2, -0.85, 0), g2: V(3.5, 0, 0), end: V(4.65, 0, 0) };
    // node -> source line of the sample (start, ReviewInvoice, if, SeniorApproval / AutoApprove, closing brace, end)
    const path = (up: boolean): [V3, number][] => {
      const y = up ? 0.85 : -0.85;
      return [[NO.start, 1], [NO.t1, 2], [NO.g1, 3], [V(0.9, y, 0), 3], [up ? NO.tu : NO.td, up ? 4 : 6], [V(3.5, y, 0), up ? 4 : 6], [NO.g2, 7], [NO.end, 8]];
    };
    const a: Slot[] = [];
    for (let r = 0; r < 12; r++) for (let c = 0; c < 9; c++) a.push({ p: V(ED.x + (c - 4) * 0.3, ED.y + (5.5 - r) * 0.3, -0.12), s: V(0.28, 0.28, 0.05), plate: "ed" });
    const top = Math.min(1.35, (data.code.length - 1) * 0.15);
    data.code.forEach(([len, ind], li) => {
      const n = Math.max(1, Math.min(7, Math.ceil(len / 6))), x0 = ED.x - 1.15 + ind * 0.07;
      for (let i = 0; i < n; i++) a.push({ p: V(x0 + i * 0.3 + 0.14, ED.y + top - li * 0.3, 0.02), s: V(0.27, 0.12, 0.06), code: li, kw: i === 0 && len > 3 });
    });
    ring(a, 14, 0.3, NO.start, 0.1, { node: "start" });
    ring(a, 14, 0.3, NO.end, 0.12, { node: "end" });
    ring(a, 10, 0.2, NO.end, 0.1, { node: "end" });
    for (const k of ["t1", "tu", "td"]) block(a, 4, 3, 2, 0.2, NO[k], 0.18, { node: k });
    for (const k of ["g1", "g2"]) {
      const s0 = a.length;
      block(a, 3, 3, 2, 0.19, V(), 0.17, { node: k, gate: true });
      const q = new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 4);
      for (let i = s0; i < a.length; i++) {
        a[i].p.applyQuaternion(q).add(NO[k]);
        a[i].q = q;
      }
    }
    const st = 0.17, cs = 0.08;
    line(a, V(-1.22, 0, 0), V(-0.78, 0, 0), st, cs);
    line(a, V(0.08, 0, 0), V(0.55, 0, 0), st, cs);
    for (const y of [0.85, -0.85]) {
      const sg = Math.sign(y);
      line(a, V(0.9, sg * 0.36, 0), V(0.9, y, 0), st, cs);
      line(a, V(0.9, y, 0), V(1.77, y, 0), st, cs);
      line(a, V(2.63, y, 0), V(3.5, y, 0), st, cs);
      line(a, V(3.5, y, 0), V(3.5, sg * 0.36, 0), st, cs);
    }
    line(a, V(3.86, 0, 0), V(4.33, 0, 0), st, cs);
    a.push({ p: NO.start.clone(), s: V(0.16, 0.16, 0.16), inst: true });
    const ip = V();
    L.push({
      slots: spares(a, [NO.t1, NO.tu, NO.td]),
      live(sl, t, o) {
        const cyc = t / 5.2, pa = path(Math.floor(cyc) % 2 === 0), ph = fract(cyc);
        const seg = ph * (pa.length - 1), si = Math.min(pa.length - 2, Math.floor(seg)), sf = seg - si;
        const cur = pa[sf < 0.5 ? si : si + 1][1];
        if (sl.inst) {
          o.p.lerpVectors(pa[si][0], pa[si + 1][0], ease(sf)).setZ(0.35);
          o.g = 1.6;
          o.c.copy(WHITE);
          o.s.setScalar(0.18);
        } else if (sl.node) {
          ip.lerpVectors(pa[si][0], pa[si + 1][0], ease(sf));
          o.g = smooth(0.6, 0.1, ip.distanceTo(NO[sl.node])) * 0.75;
        } else if (sl.code !== undefined) {
          o.g = (sl.kw ? 0.55 : 0.13) + (sl.code === cur ? 0.7 : 0);
          o.c.copy(sl.kw || sl.code === cur ? AMBER : WHITE);
        } else if (sl.conn) o.g = 0.05;
        codeCursor.cur = cur;
      },
    });
  }

  // 7 Dux Shell, built from small blocks: the wallpaper, the bar along the top with its pills, a popout
  // connected to the bar, a Settings window (profiles with their menu, the network page) and the System
  // Monitor (a live graph, the process list). Each featured PR lights the part of the shell it changed;
  // with no PR being read, one part after another shows what it does.
  {
    const W = 9.6, Hh = 6, a: Slot[] = [];
    const tile = (x: number, y: number, z: number, sx: number, sy: number, sz: number, extra: Record<string, unknown>) => a.push({ p: V(x, y, z), s: V(sx, sy, sz), ...extra });
    // wallpaper
    for (let r = 0; r < 7; r++) for (let c = 0; c < 12; c++) tile((c - 5.5) * 0.8, (3 - r) * 0.84 - 0.2, -0.3, 0.76, 0.8, 0.04, { part: "wallpaper", wc: c, wr: r });
    // the bar: a strip of small segments, pills on it: workspaces, the clock, the tray groups; the last group opens the popout
    const BY = Hh / 2 - 0.05;
    for (let i = 0; i < 32; i++) tile((i - 15.5) * 0.3, BY, 0, 0.28, 0.24, 0.06, { part: "bar", strip: true });
    for (let i = 0; i < 5; i++) tile(-4.3 + i * 0.22 + (i > 1 ? 0.2 : 0), BY, 0.08, i === 1 ? 0.36 : 0.14, 0.12, 0.06, { part: "bar", ws: i });
    for (let i = 0; i < 4; i++) tile(-0.33 + i * 0.22, BY, 0.08, 0.16, 0.12, 0.06, { part: "bar", clock: i });
    const groups = [[1.4, 2], [2.05, 3], [2.95, 3], [3.95, 2]] as const;
    groups.forEach(([x, n], g) => {
      tile(x + ((n - 1) * 0.2) / 2, BY, 0.05, n * 0.2 + 0.08, 0.2, 0.04, { part: "bar", pill: g });
      for (let i = 0; i < n; i++) tile(x + i * 0.2, BY, 0.1, 0.12, 0.12, 0.05, { part: "bar", icon: g });
    });
    // the popout, connected under the last pill groups: avatar and buttons, two sliders, toggle tiles
    const PX0 = 1.75, PX1 = 4.55, PY0 = BY - 0.2, cx = (PX0 + PX1) / 2;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) tile(PX0 + 0.28 + c * 0.56, PY0 - 0.25 - r * 0.47, 0.12, 0.54, 0.45, 0.05, { part: "bar", pop: true, prow: r, pbg: true });
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * TAU;
      tile(PX0 + 0.45 + Math.cos(an) * 0.17, PY0 - 0.45 + Math.sin(an) * 0.17, 0.2, 0.08, 0.08, 0.05, { part: "bar", pop: true, prow: 0 });
    }
    for (let i = 0; i < 4; i++) tile(cx - 0.1 + i * 0.42, PY0 - 0.45, 0.2, 0.26, 0.26, 0.06, { part: "bar", pop: true, prow: 0 });
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < 10; i++) tile(PX0 + 0.75 + i * 0.18, PY0 - 1.0 - s * 0.42, 0.2, 0.16, 0.12, 0.05, { part: "bar", pop: true, prow: 1 + s, track: s, ti: i });
      tile(PX0 + 0.35, PY0 - 1.0 - s * 0.42, 0.2, 0.16, 0.16, 0.06, { part: "bar", pop: true, prow: 1 + s });
    }
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++) {
        const x = PX0 + 0.35 + c * 1.3, y = PY0 - 1.9 - r * 0.47;
        tile(x, y, 0.2, 0.22, 0.22, 0.06, { part: "bar", pop: true, prow: 3 + r, tog: r * 2 + c });
        tile(x + 0.5, y + 0.05, 0.2, 0.6, 0.07, 0.04, { part: "bar", pop: true, prow: 3 + r });
        tile(x + 0.4, y - 0.07, 0.2, 0.4, 0.05, 0.04, { part: "bar", pop: true, prow: 3 + r });
      }
    // Settings: title bar, sidebar, three profile cards with the menu of the one right-clicked, the network page
    const SX0 = -4.35, SY0 = 2.15, sx = (c: number) => SX0 + 0.3 + c * 0.62;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) tile(sx(c), SY0 - 0.3 - r * 0.62, 0.06, 0.6, 0.6, 0.05, { win: "settings", bg: true });
    for (let c = 0; c < 7; c++) tile(sx(c), SY0, 0.1, 0.6, 0.12, 0.06, { win: "settings", title: true });
    for (let r = 0; r < 8; r++) {
      tile(SX0 + 0.25, SY0 - 0.4 - r * 0.42, 0.14, 0.14, 0.14, 0.05, { win: "settings", side: r });
      tile(SX0 + 0.72, SY0 - 0.4 - r * 0.42, 0.14, 0.62, 0.07, 0.04, { win: "settings", side: r });
    }
    for (let i = 0; i < 3; i++)
      for (let q = 0; q < 4; q++) tile(SX0 + 1.75 + i * 0.85 + (q % 2) * 0.32, SY0 - 0.55 - Math.floor(q / 2) * 0.3, 0.14, 0.3, 0.28, 0.05, { part: "profiles", card: i });
    for (let r = 0; r < 4; r++) tile(SX0 + 3.0, SY0 - 0.85 - r * 0.2, 0.32, 0.7, 0.15, 0.05, { part: "profiles", menu: r });
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) tile(SX0 + 1.75 + (c === 0 ? 0 : c === 1 ? 0.65 : 2.1), SY0 - 1.75 - r * 0.42, 0.14, c === 1 ? 1.0 : 0.18, c === 1 ? 0.08 : 0.18, 0.05, { part: "network", net: r, nc: c });
    // System Monitor: title bar, a graph of recent load scrolling left, the process list
    const MX0 = -0.4, MY0 = -0.55, mx = (c: number) => MX0 + 0.3 + c * 0.6;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) tile(mx(c), MY0 - 0.3 - r * 0.58, 0.16, 0.58, 0.56, 0.05, { win: "monitor", bg: true });
    for (let c = 0; c < 5; c++) tile(mx(c), MY0, 0.2, 0.58, 0.12, 0.06, { win: "monitor", title: true });
    for (let c = 0; c < 14; c++) for (let h = 0; h < 5; h++) tile(MX0 + 0.25 + c * 0.18, MY0 - 1.15 + h * 0.15, 0.24, 0.14, 0.12, 0.05, { part: "monitor", gc: c, gh: h });
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) tile(MX0 + 0.35 + (c === 0 ? 0 : c === 1 ? 0.75 : 2.3), MY0 - 1.55 - r * 0.32, 0.24, c === 1 ? 1.2 : 0.18, c === 1 ? 0.07 : 0.14, 0.05, { part: "monitor", proc: r });
    const parts = data.duxParts;
    const cycle = [...new Set(parts.filter((p): p is DuxPart => p !== null))];
    L.push({
      slots: spares(a, [V(0, 0, 0)]),
      live(sl, t, o) {
        const f = focus[7], held = f >= 0 && f < parts.length && parts[f] !== null;
        const T = 3.6, cur = held ? parts[f] : cycle.length ? cycle[Math.floor(t / T) % cycle.length] : null, ph = fract(t / T);
        const on = sl.part !== undefined && sl.part === cur;
        if (sl.part === "wallpaper") {
          // the wallpaper changes with a wipe from the left (folders feed the cycle)
          const w = on ? smooth(0, 0.6, ph) * 12 - sl.wc : -1;
          o.b.copy(WALL).lerp(LEGACY, smooth(2, 6, sl.wr) * 0.7);
          if (w > 1) o.b.lerp(MODERN, 0.8 * smooth(1, 2.5, w) * smooth(1, 0.85, ph));
          o.g = w > 0 && w < 1.2 ? 0.3 : 0;
        } else if (sl.strip) o.g = 0.03;
        else if (sl.ws !== undefined) o.g = sl.ws === 1 ? 0.6 : 0.12;
        else if (sl.clock !== undefined) o.g = 0.3;
        else if (sl.icon !== undefined || sl.pill !== undefined) o.g = sl.pill === 3 || sl.icon === 3 ? (on ? 0.9 : 0.25) : 0.06;
        else if (sl.pop) {
          // connected popout: it unfolds down from the bar, row by row
          const open = on ? smooth(0, 0.08, ph) * 7 - sl.prow : 7;
          o.s.multiplyScalar(clamp01(open));
          if (sl.pbg) o.b.copy(PANE);
          o.g = sl.track !== undefined ? (sl.ti < 6 - sl.track * 2 + 1.5 * Math.sin(t * 0.8 + sl.track) ? 0.45 : 0.03) : sl.tog !== undefined ? (sl.tog % 3 === 0 ? 0.5 : 0.04) : 0.02;
        } else if (sl.card !== undefined) o.g = sl.card === 1 ? (on ? 0.6 : 0.14) : 0.04;
        else if (sl.menu !== undefined) {
          // the menu of the right-clicked profile, then Apply
          const v = on ? smooth(0.1 + sl.menu * 0.04, 0.2 + sl.menu * 0.04, ph) * smooth(0.95, 0.85, ph) : 0;
          o.s.multiplyScalar(v);
          o.g = sl.menu === 0 && ph > 0.5 ? 0.9 : 0.12;
        } else if (sl.net !== undefined) o.g = on ? (sl.net === Math.floor(ph * 3) ? 0.8 : 0.15) : sl.nc === 0 ? 0.08 : 0.02;
        else if (sl.gc !== undefined) {
          // a load graph scrolling left: column c shows the load a moment ago
          const ld = 2.6 + 1.6 * Math.sin((t * 1.2 - sl.gc * 0.35) * 1.3) + Math.sin(t * 2.7 - sl.gc * 0.8);
          o.s.multiplyScalar(sl.gh < ld ? 1 : 0);
          o.g = on ? 0.35 + 0.1 * sl.gh : 0.12;
        } else if (sl.proc !== undefined) o.g = on && sl.proc === Math.floor(t * 0.8) % 3 ? 0.6 : 0.03;
        else if (sl.title) o.g = 0.12;
        else if (sl.bg) o.b.copy(PANE);
        else if (sl.side !== undefined) o.g = sl.side === 1 ? 0.35 : 0.03;
        if (held && sl.part !== undefined && !on) o.g *= 0.3;
      },
    });
  }

  // 8 projects. Item 0, devline: the run as a route of stations, top to bottom, a ring at each approval gate;
  // implement fans out into one lane per task. Beside each station, what it produces. Before the run figure is
  // reached a work item walks the whole route; while it is pinned the route follows the stage shown (lit up to
  // there, the stage's product built); after it, the whole run shows until it dissolves into the next form.
  {
    const run = data.run, ids = run?.ids ?? [], n = ids.length, a: Slot[] = [], labels = new Map<number, V3>();
    const hOf = (id: string) => (id === "implement" ? 1.8 : 0.9);
    const ys: number[] = [];
    let y = 0;
    for (const id of ids) {
      ys.push(y - hOf(id) / 2);
      y -= hOf(id);
    }
    const top = -y / 2;
    for (let k = 0; k < n; k++) ys[k] += top;
    const SX = -1.6, PX = 0.55, tasks = Math.max(1, Math.min(4, run?.tasks ?? 0));
    const laneY = (k: number, i: number) => ys[k] + ((tasks - 1) / 2 - i) * 0.5;
    ids.forEach((id, k) => {
      const ex = { stn: k };
      if (id === "implement") for (let i = 0; i < tasks; i++) block(a, 2, 2, 2, 0.16, V(SX + (i - (tasks - 1) / 2) * 0.36, ys[k], 0), 0.14, { ...ex, lane: i });
      else block(a, 3, 3, 2, 0.17, V(SX, ys[k], 0), 0.15, ex);
      if (run?.gates.includes(k)) ring(a, 14, 0.42, V(SX, ys[k], 0), 0.09, { gate: k });
      if (k + 1 < n) line(a, V(SX, ys[k] - (id === "implement" ? 0.38 : 0.3), 0), V(SX, ys[k + 1] + (ids[k + 1] === "implement" ? 0.38 : 0.3), 0), 0.15, 0.06, { rail: k });
      labels.set(100 + k, V(SX + 0.5, ys[k] - 0.09, 0));
      // the big caption of the stage shown: left of its station, level with it
      labels.set(200 + k, V(SX - 0.6, ys[k], 0));
      // the product, built from small blocks
      const pr = (x: number, yy: number, sx: number, sy: number, extra: Record<string, unknown> = {}) => a.push({ p: V(PX + x * 1.35, yy, 0), s: V(sx * 1.3, sy * 1.3, 0.1), prod: k, ...extra });
      const Y = ys[k];
      if (id === "idea") [3, 2, 4, 2, 3].forEach((w, i, arr) => pr(arr.slice(0, i).reduce((s, v) => s + v * 0.17 + 0.1, 0) + (w * 0.17) / 2, Y, w * 0.17 - 0.03, 0.12, { mark: i < 2 }));
      else if (id === "route") for (let i = 0; i < 5; i++) pr(i * 0.42, Y, 0.3, 0.2, { off: i === 4 });
      else if (id === "brainstorm") [1.8, 1.4, 1.6].forEach((w, i) => pr(w / 2, Y + 0.18 - i * 0.18, w, 0.1));
      else if (id === "design") for (let i = 0; i < 3; i++) for (let q = 0; q < 4; q++) pr(i * 0.7 + (q % 2) * 0.26, Y + 0.13 - Math.floor(q / 2) * 0.26, 0.24, 0.24, { look: i });
      else if (id === "plan") {
        for (let i = 0; i < tasks; i++) pr(0.35, Y + ((tasks - 1) / 2 - i) * 0.17, 0.7, 0.12, { wave: 0 });
        pr(1.3, Y, 0.7, 0.12, { wave: 1 });
      } else if (id === "implement")
        for (let i = 0; i < tasks; i++) {
          for (let s = 0; s < 4; s++) pr(s * 0.36, laneY(k, i), 0.3, 0.2, { lane: i, step: s });
          pr(1.75, laneY(k, i), 0.24, 0.24, { lane: i, rev: true });
        }
      else if (id === "docs") for (let i = 0; i < Math.min(5, run?.docs ?? 0); i++) pr(i * 0.36, Y, 0.26, 0.4, { doc: i });
      else if (id === "reviews") for (let i = 0; i < 3; i++) pr(i * 0.42, Y, 0.3, 0.3, { off: i === 2 });
      else if (id === "deep-review") for (let i = 0; i < 10; i++) pr(i * 0.22, Y, 0.2, 0.2, { sweep: i });
      else if (id === "final") for (let i = 0; i < Math.min(5, run?.options ?? 0); i++) pr(i * 0.5, Y, 0.4, 0.2, { opt: i });
    });
    for (let i = 0; i < 3; i++) a.push({ p: V(SX, ys[0] ?? 0, 0.3), s: V(), walker: i });
    // where a token stands at run position u (0..n-1): on the route, on its lane through implement
    const impl = ids.indexOf("implement");
    const routeAt = (u: number, lane: number, o: V3) => {
      const k = Math.max(0, Math.min(n - 1, Math.floor(u))), f = ease(u - k), k2 = Math.min(n - 1, k + 1);
      const x = (j: number) => (j === impl ? SX + (lane - (tasks - 1) / 2) * 0.36 : SX);
      return o.set(lerp(x(k), x(k2), f), lerp(ys[k] ?? 0, ys[k2] ?? 0, f), 0.32);
    };
    L.push({
      slots: spares(a, [V(SX, 0, 0)]),
      labels,
      live(sl, t, o) {
        // rp: the stage the run figure shows (eased); -1 before it, n after it
        const rp = measure.ext ? n : runState.rp, cur = Math.round(rp), pinned = runState.pinned;
        if (sl.walker !== undefined) {
          // a work item: walking the route before the figure is reached, standing at the stage while pinned
          const u = pinned ? Math.max(0, rp) : rp < 0 ? fract(t / 9 + sl.walker / 3) * (n - 1) : -1;
          if (u < 0 || (pinned && sl.walker > 0)) {
            o.s.setScalar(0);
            return;
          }
          routeAt(u, sl.walker % tasks, o.p);
          o.s.setScalar(0.16);
          o.g = 1.5;
          o.c.copy(WHITE);
          return;
        }
        if (sl.stn !== undefined) {
          const passed = sl.stn <= rp + 0.05;
          o.g = sl.surf ? (sl.stn === cur && pinned ? 0.85 : passed ? 0.12 : 0.03) : 0;
        } else if (sl.gate !== undefined) o.g = sl.gate === cur && pinned ? 0.9 + 0.4 * Math.sin(t * 3) : sl.gate <= rp ? 0.2 : 0.04;
        else if (sl.rail !== undefined) o.g = sl.rail < rp ? 0.22 : 0.03;
        else if (sl.prod !== undefined) {
          // built when its stage is reached; the stage shown now is lit, earlier ones step back
          const v = clamp01(rp - sl.prod + 1);
          o.s.multiplyScalar(smooth(0, 1, v));
          const now = sl.prod === cur && pinned, ph = fract(t / 3);
          let g = now ? 0.45 : 0.05;
          if (sl.off) g = 0.01;
          else if (sl.mark) g = now ? 1.0 : 0.3;
          else if (sl.look !== undefined) {
            g = sl.look === 1 ? (now ? 0.9 : 0.3) : 0.05;
            if (sl.look === 1) o.p.z += 0.25 * v;
          } else if (sl.step !== undefined) {
            // test (fails), code, test (passes), merge, lane by lane; the last lane is sent back once by its review
            const s = now ? Math.floor(ph * 5 - sl.lane * 0.3) : 4;
            g = sl.step < s ? 0.55 : 0.05;
            if (sl.step === 0 && s === 1 && now) o.c.copy(WHITE);
          } else if (sl.rev) g = now ? (sl.lane === tasks - 1 && ph > 0.55 && ph < 0.75 ? 1.4 : ph > 0.8 ? 0.8 : 0.1) : 0.2;
          else if (sl.sweep !== undefined) g = now ? 0.15 + 0.9 * smooth(1.2, 0, Math.abs(ph * 12 - 1 - sl.sweep)) : 0.12;
          else if (sl.opt !== undefined) g = sl.opt === 0 ? (now ? 1.0 : 0.35) : 0.06;
          else if (sl.wave === 1) g = now ? 0.2 : 0.05;
          o.g = g;
        }
      },
    });
  }
  // 9 the other projects: the run has ended and they get the page; only a few blocks drift at the window's
  // edges, in camera space (see fit), so nothing sits behind their text
  {
    const a: Slot[] = [], NB = 6;
    for (let i = 0; i < NB; i++) block(a, 2, 2, 2, 0.17, V(), 0.15, { drift: i });
    const c = V(), q = new THREE.Quaternion(), ax = V();
    L.push({
      // the spare tokens wait, unseen, at the blocks: the run dissolves toward the edges
      slots: spares(a, [V()]).map((s, j) => (s.spare ? { ...s, drift: j % NB } : s)),
      live(sl, t, o) {
        const i = sl.drift;
        if (i === undefined) return;
        const side = i % 2 ? 1 : -1, ph = fract(i / NB + 0.05 * (i % 3) + t * 0.01), m = Math.min(0.5, view.vw * 0.04);
        c.set(side * (view.vw / 2 - m - m * 0.6 * (i % 3)), (0.5 - ph) * view.vh * 1.15, -0.4 * (i % 2));
        q.setFromAxisAngle(ax.set(0.3, 1, 0.2).normalize(), t * 0.15 + i);
        o.p.copy(sl.p).applyQuaternion(q).add(c);
        o.q.copy(q);
        o.g = sl.surf && sl.idx === Math.floor(fract(t * 0.1 + i / NB) * 8) ? 0.35 : 0.02;
      },
    });
  }
  // 10 contact: a closed ring of blocks around the contact text (a band of its own on narrow screens), in
  // camera space; `view.ring` is fitted to the text every frame, so the ring never runs into it
  {
    const a: Slot[] = [], NL = 8, NK = 80;
    for (let lane = 0; lane < NL; lane++) for (let k = 0; k < NK; k++) a.push({ p: V(), s: V(), ring: true, lane, k });
    L.push({
      slots: a,
      live(sl, t, o) {
        // the band is a fixed width, narrower on a small ring (a phone's band) so it stays a ring
        const { cx, cy, rx, ry } = view.ring, gap = Math.min(0.085, 0.045 * Math.min(rx, ry)), off = (sl.lane - (NL - 1) / 2) * gap;
        const ra = rx + off, rb = ry + off, an = fract(sl.k / NK + t * 0.008) * TAU;
        // Ramanujan's perimeter: every lane is laid with even bricks and even gaps
        const per = Math.PI * (3 * (ra + rb) - Math.sqrt((3 * ra + rb) * (ra + 3 * rb)));
        o.p.set(cx + Math.cos(an) * ra, cy + Math.sin(an) * rb, 0.04 * Math.sin(3 * an + t * 0.5));
        T.set(-Math.sin(an) * ra, Math.cos(an) * rb, 0).normalize();
        o.q.setFromUnitVectors(X, T);
        o.s.set((per / NK) * 0.84, gap * 0.76, 0.12);
        o.g = isEvent(sl.k, sl.lane, 0.17) ? 0.8 : 0;
        o.c.copy(AMBER);
      },
    });
  }

  return L;
}

/** Number of beats (forms); the page must render one `[data-beat]` with a `[data-stage]` per form. */
export const BEATS = 11;

/**
 * Starts the subject on `canvas`, driven by the beats inside `root`. Returns a stop function.
 * `reduced`: renders one still per form into its stage as an image and stops (no loop, no scroll).
 * Calls `onFail` when WebGL is missing or the context is lost; the page then stays static.
 */
export function startFlow(opts: FlowOpts): () => void {
  const run = { cancelled: false, stop: () => {} };
  void start(opts, run);
  return () => {
    run.cancelled = true;
    run.stop();
  };
}
type FlowOpts = { canvas: HTMLCanvasElement; root: HTMLElement; data: FlowSceneData; reduced: boolean; onFail: () => void; onSlow: () => void };
/** Hands the main thread back between the parts of the startup, so none of them is a long task. */
const pause = () => new Promise<void>((r) => setTimeout(r, 0));

async function start(opts: FlowOpts, run: { cancelled: boolean; stop: () => void }) {
  const { canvas, root, data, reduced, onFail, onSlow } = opts;
  const codeCursor = { cur: -1 };
  const focus: number[] = new Array(BEATS).fill(-1);
  // when each beat's focus last changed (scene time), and what it was before
  const focusAt: number[] = new Array(BEATS).fill(0);
  const focusPrev: number[] = new Array(BEATS).fill(-1);
  const runState = { rp: -1, pinned: false };
  // the camera plane at z = 0 (camera at z 16, fov 30); resize() keeps it current
  const view: View = { vw: 1, vh: 2 * 16 * Math.tan(Math.PI / 12), ring: { cx: 0, cy: 0, rx: 3, ry: 2 } };
  view.vw = (view.vh * innerWidth) / Math.max(1, innerHeight);
  const L = buildLayouts(data, codeCursor, focus, runState, view);
  const B = L.length;
  /** Forms laid out in camera space: the hero stream, the projects' edge blocks, the contact ring. */
  const camForm = (k: number) => k === 0 || k >= B - 2;

  /** A focus change (the item being read) fades over FOCUS_FADE s instead of switching every part in one frame. */
  const FOCUS_FADE = 0.45, oF = out();
  function evalSlot(k: number, j: number, t: number, o: Out) {
    evalAt(k, j, t, o);
    const a = t - focusAt[k], fc = focus[k], fp = focusPrev[k];
    if (fp === fc || a < 0 || a >= FOCUS_FADE || measure.ext) return;
    focus[k] = fp;
    evalAt(k, j, t, oF);
    focus[k] = fc;
    const w = smooth(0, FOCUS_FADE, a);
    o.p.lerpVectors(oF.p, o.p, w);
    o.s.lerpVectors(oF.s, o.s, w);
    o.g = lerp(oF.g, o.g, w);
    o.c.lerpColors(oF.c, o.c, w);
    o.b.lerpColors(oF.b, o.b, w);
  }
  function evalAt(k: number, j: number, t: number, o: Out) {
    const lay = L[k], sl = lay.slots[j];
    o.g = 0;
    o.c.copy(AMBER);
    o.b.copy(sl.legacy ? LEGACY : MODERN);
    if (sl.stream) liveStream(sl, t, o);
    else {
      o.p.copy(sl.p);
      o.s.copy(sl.s);
      if (sl.q) o.q.copy(sl.q);
      else o.q.identity();
    }
    lay.live?.(sl, t, o);
    // the part of the text item being read lights up; the other items' parts step back
    const f = focus[k];
    if (f >= 0 && sl.item !== undefined) o.g = sl.item === f ? Math.max(o.g, sl.surf ? 0.2 : 0.05) : o.g * 0.3;
  }

  /* matching: which slot each token takes next, who moves first, and an optional shared control point */
  const perm = L.map(() => new Int16Array(N));
  const stag = L.map(() => new Float32Array(N));
  const via: (V3 | null)[][] = L.map(() => new Array(N).fill(null));
  for (let i = 0; i < N; i++) perm[0][i] = i;
  const tmpO = out();
  type Key = (p: V3, s: Slot) => number;
  function match(kA: number, keyA: Key, keyB: Key, o: { stag?: (sB: Slot, r: number) => number; via?: (sB: Slot) => V3 | null } = {}) {
    const kB = kA + 1, A: [number, number][] = [], Bs: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      evalSlot(kA, perm[kA][i], 0, tmpO);
      A.push([i, keyA(tmpO.p, L[kA].slots[perm[kA][i]])]);
    }
    for (let j = 0; j < N; j++) {
      evalSlot(kB, j, 0, tmpO);
      Bs.push([j, keyB(tmpO.p, L[kB].slots[j])]);
    }
    A.sort((a, b) => a[1] - b[1]);
    Bs.sort((a, b) => a[1] - b[1]);
    for (let r = 0; r < N; r++) {
      const i = A[r][0], j = Bs[r][0], sB = L[kB].slots[j];
      perm[kB][i] = j;
      stag[kA][i] = o.stag ? o.stag(sB, r / N) : (0.9 * r) / N;
      if (o.via) via[kA][i] = o.via(sB);
    }
  }
  const byX: Key = (p) => p.x;
  const edX = -4.25;
  // 0 -> 1: the stream contracts; the service assembles from it bottom layer first
  match(0, byX, byX, { stag: (s, r) => (s.svc === 0 ? 0.25 + 0.6 * (s.ly / 5) + 0.01 * s.lx : 0.2 * r) });
  // 1 -> 2: the service opens into the intake: the streams first, then the applications, the core and the platform
  match(1, byX, byX, { stag: (s, r) => (s.stream ? 0.08 * r : 0.15 + 0.7 * r) });
  // 2 -> 3: the pipeline rises into the layered graph, the clusters behind it last
  match(2, byX, (p, s) => p.x + (s.cluster !== undefined ? 0.001 : 0), { stag: (s, r) => (s.cluster !== undefined ? 0.5 + 0.4 * r : 0.6 * r) });
  // 3 -> 4: the platforms are laid down first, then the apps settle on them, staging before production
  match(3, byX, byX, { stag: (s, r) => (s.plate ? 0.05 + 0.15 * r : s.app !== undefined ? 0.3 + 0.08 * s.app + 0.1 * s.env : 0.2 + 0.6 * r) });
  // 4 -> 5: the platforms flatten into the time axis; the apps settle into the school pieces, left to right
  match(4, byX, byX, { stag: (s, r) => (s.axis ? 0.1 * r : 0.2 + 0.7 * r) });
  // 5 -> 6: tokens run through the editor first, then out into the diagram, drawn left to right
  match(5, byX, (p, s) => (s.plate === "ed" || s.code !== undefined ? p.x - 20 : p.x), {
    stag: (s) => (s.plate === "ed" ? 0.05 + 0.2 * clamp01((1.8 - s.p.y) / 3.6) : s.code !== undefined ? 0.2 + 0.25 * (s.code / 9) : 0.45 + 0.5 * clamp01((s.p.x + 1.8) / 6.6)),
    via: (s) => (s.plate === "ed" || s.code !== undefined ? null : V(edX + 1.6, 0, 0.4)),
  });
  // 6 -> 7: the diagram spreads into a desktop; the bar is laid first, then the windows, then the wallpaper behind
  match(6, byX, byX, { stag: (s, r) => (s.part === "bar" ? 0.05 + 0.3 * r : s.part === "wallpaper" ? 0.45 + 0.45 * r : 0.3 + 0.3 * r) });
  // 7 -> 8: the shell condenses into the route, top to bottom
  match(7, (p) => -p.y, (p) => -p.y);
  // 8 -> 9: the run ends: the route dissolves toward the window's edges, its left part to the left
  match(8, byX, byX, { stag: (s, r) => (s.spare ? 0.1 + 0.5 * r : 0.6 * r) });
  // 9 -> 10: the edge blocks and the waiting tokens close into the ring, lane by lane around it
  match(9, byX, (p) => p.x, { stag: (s) => (s.ring ? 0.1 + 0.7 * (s.k / 80) : 0) });

  await pause();
  if (run.cancelled) return;

  /* renderer, one light setup */
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: reduced });
  } catch {
    onFail();
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = envTex;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 16);
  const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 7, bottom: -7, near: 1, far: 40 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xffb070, 1.3);
  scene.add(rim, rim.target);
  const group = new THREE.Group();
  scene.add(group);

  const geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.16);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.82, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 0.75 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aGlow;\nvarying vec3 vGlow;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = aGlow;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vGlow;").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;");
  };
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < N; i++) mesh.setColorAt(i, MODERN);
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  const glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aGlow", glowAttr);
  group.add(mesh);

  // soft additive halos around glowing tokens
  const hGeo = new THREE.BufferGeometry();
  const hPos = new Float32Array(N * 3), hCol = new Float32Array(N * 3);
  hGeo.setAttribute("position", new THREE.BufferAttribute(hPos, 3).setUsage(THREE.DynamicDrawUsage));
  hGeo.setAttribute("aCol", new THREE.BufferAttribute(hCol, 3).setUsage(THREE.DynamicDrawUsage));
  const hMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: `attribute vec3 aCol; varying vec3 vCol; uniform float uScale;
      void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv;
        float g = max(aCol.r, max(aCol.g, aCol.b)); gl_PointSize = uScale * (0.4 + g) / -mv.z; }`,
    fragmentShader: `varying vec3 vCol; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d,d)*4.; if (r > 1.) discard;
        float a = exp(-r*5.) * (1.-r); gl_FragColor = vec4(vCol * a * .55, 0.); }`,
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const halos = new THREE.Points(hGeo, hMat);
  halos.frustumCulled = false;
  group.add(halos);
  const free = () => {
    geo.dispose();
    mat.dispose();
    hGeo.dispose();
    hMat.dispose();
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
  // stopped while starting, or the context was lost before its listener is attached (below)
  const gone = () => {
    if (renderer.getContext().isContextLost()) onFail();
    return run.cancelled || renderer.getContext().isContextLost();
  };
  if (gone()) return free();
  // the shaders compile off the main thread where the browser can (KHR_parallel_shader_compile)
  await renderer.compileAsync(scene, camera);
  if (gone()) return free();

  /*
   * Clearance: the forms keep out of the text. Every line of text (headlines glyph by glyph), control
   * and image in the beats is a box in page coordinates; a token whose screen footprint comes near one
   * shrinks away, so the forms part around the text's own line shapes instead of being cut by a box.
   */
  const GAP = 6, FADE = 30;
  let docBoxes = new Float32Array(0);
  const vis: number[] = [];
  const range = document.createRange();
  /** The part of the screen an element's content can show in: its ancestors that clip (a collapsed panel) cut it. */
  function clipOf(el: Element | null, memo: Map<Element, number[]>): number[] {
    if (!el || el === root) return [-1e5, -1e5, 1e5, 1e5];
    const m = memo.get(el);
    if (m) return m;
    const c = clipOf(el.parentElement, memo);
    let r = c;
    if (getComputedStyle(el).overflow !== "visible") {
      const b = el.getBoundingClientRect();
      r = [Math.max(c[0], b.left), Math.max(c[1], b.top), Math.min(c[2], b.right), Math.min(c[3], b.bottom)];
    }
    memo.set(el, r);
    return r;
  }
  let dirty = false, collectedAt = 0;
  function collect() {
    const r: number[] = [], sy = scrollY, memo = new Map<Element, number[]>();
    let clip = [0, 0, 0, 0];
    const push = (b: DOMRect) => {
      const x0 = Math.max(b.left, clip[0]), y0 = Math.max(b.top, clip[1]), x1 = Math.min(b.right, clip[2]), y1 = Math.min(b.bottom, clip[3]);
      if (x1 > x0 && y1 > y0) r.push(x0, y0 + sy, x1, y1 + sy);
    };
    for (const el of root.querySelectorAll<HTMLElement>(".fl-head, .fl-body, .fl-hero-foot")) {
      const glyphs = el.matches(".fl-head");
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode() as Text | null; n; n = tw.nextNode() as Text | null) {
        if (!n.data.trim() || n.parentElement?.checkVisibility?.({ visibilityProperty: true }) === false) continue;
        clip = clipOf(n.parentElement, memo);
        if (glyphs)
          for (let i = 0; i < n.length; i++) {
            if (n.data[i] === " ") continue;
            range.setStart(n, i);
            range.setEnd(n, i + 1);
            for (const b of range.getClientRects()) push(b);
          }
        else {
          range.selectNodeContents(n);
          for (const b of range.getClientRects()) push(b);
        }
      }
      for (const c of el.querySelectorAll("a, button, input, summary, img, svg, pre")) {
        // a drawing the scene stands in for (the devline run's) is hidden, not text
        if (c.checkVisibility?.({ visibilityProperty: true }) === false) continue;
        clip = clipOf(c.parentElement, memo);
        push(c.getBoundingClientRect());
      }
    }
    docBoxes = Float32Array.from(r);
    dirty = false;
    collectedAt = performance.now();
  }
  const railEl = root.querySelector<HTMLElement>(".fl-rail");
  /** The boxes near the screen now, in screen coordinates; the header and the rail included. */
  function visibleBoxes() {
    vis.length = 0;
    const sy = scrollY, m = FADE + 200;
    for (let i = 0; i < docBoxes.length; i += 4) {
      const y0 = docBoxes[i + 1] - sy, y1 = docBoxes[i + 3] - sy;
      if (y1 > -m && y0 < H + m) vis.push(docBoxes[i], y0, docBoxes[i + 2], y1);
    }
    vis.push(-1e4, -1e4, W + 1e4, hdrB - 14);
    const rr = railEl?.getBoundingClientRect();
    if (rr && rr.width) vis.push(rr.left, rr.top, rr.right, rr.bottom);
  }
  const wp = V();
  let pxPerUnit = 1;
  /**
   * 1 where a token at p (group space) of size sz is clear of every box, falling to 0 as it nears one.
   * `pad`: extra screen px the token reaches (its halo).
   */
  function clearance(p: V3, sz: number, pad = 0) {
    wp.copy(p).applyMatrix4(group.matrixWorld);
    // 0.87: half the diagonal of a unit cube, so a corner never reaches past the radius
    const r = sz * 0.87 * group.scale.x * pxPerUnit * (camera.position.z / Math.max(0.5, camera.position.z - wp.z));
    wp.project(camera);
    const x = (wp.x + 1) * 0.5 * W, y = (1 - wp.y) * 0.5 * H;
    let d = Infinity;
    for (let i = 0; i < vis.length; i += 4) {
      const dx = Math.max(vis[i] - x, 0, x - vis[i + 2]), dy = Math.max(vis[i + 1] - y, 0, y - vis[i + 3]);
      if (dx > d || dy > d) continue;
      d = Math.min(d, Math.hypot(dx, dy));
    }
    return smooth(GAP, GAP + FADE, d - r - pad);
  }

  /* layout: each form is fitted into its beat's stage box, and the renderer draws only inside that box */
  await pause();
  if (gone()) return free();
  const sections = [...root.querySelectorAll<HTMLElement>("[data-beat]")].sort((a, b) => +a.dataset.beat! - +b.dataset.beat!);
  const stages = sections.map((s) => s.querySelector<HTMLElement>("[data-stage]")!);
  // "stick": a column stage that holds its form below the header while the beat is read; "full": the
  // stage is the whole section (hero, contact); "band": a band in the page. Narrow screens: all bands.
  const kinds = stages.map((s) => s.dataset.stage ?? "band");
  const narrow = matchMedia("(max-width: 1199.98px)");
  // rest rotation per form: turned toward the text beside it (on the left in the odd beats, on the
  // right in the even ones); the contact ring faces the viewer, framing the text
  const RX = [0, 0.36, 0.3, 0.22, 0.3, 0.34, 0.14, 0.1, 0.1, 0, 0];
  const RY = [0, -0.42, 0.36, -0.32, 0.34, -0.24, 0.3, -0.26, 0.32, 0, 0];
  // each form's extent at scale 1 in its rest rotation, over a few seconds of its own motion (its solid parts)
  measure.ext = true;
  const ext = L.map((_, k) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(RX[k], RY[k], 0)), b = new THREE.Box3(), o = out();
    const solid = L[k].slots.some((s) => !s.stream && !s.spare);
    for (let t = 0; t < 6.5; t += 0.75)
      for (let j = 0; j < N; j++) {
        evalSlot(k, j, t, o);
        const r = Math.max(o.s.x, o.s.y, o.s.z) * 0.6;
        // a stream through a form may run on past its box, as long as the form itself is large
        if (o.s.y < 0.02 || (solid && L[k].slots[j].stream)) continue;
        P.copy(o.p).applyQuaternion(q);
        b.expandByPoint(P2.copy(P).addScalar(r)).expandByPoint(P2.copy(P).addScalar(-r));
      }
    return b;
  });
  measure.ext = false;
  await pause();
  if (gone()) return free();
  let W = 1, H = 1, mobile = false, viewH = 1, viewW = 1, hdrB = 0, T = 0, hBase = 1;
  type Box = { x: number; y: number; w: number; h: number };
  type StageBox = Box & { rest: number; lead: number };
  function setView(w: number, h: number) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    viewW = viewH * camera.aspect;
    view.vw = viewW;
    view.vh = viewH;
  }
  function resize() {
    W = innerWidth;
    H = innerHeight;
    mobile = narrow.matches;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(W, H, false);
    setView(W, H);
    hBase = renderer.getPixelRatio() * H * 0.9;
    pxPerUnit = H / viewH;
    // nothing is drawn under the fixed header (its fade included)
    hdrB = Math.max(0, document.querySelector(".fl-hdr")?.getBoundingClientRect().bottom ?? 0);
    T = hdrB + H * 0.03;
  }
  /**
   * Where beat k's form goes on screen now. `rest`: where the box sits while its beat is read;
   * `lead`: once the box has moved above this, the next beat takes over.
   */
  function stageBox(k: number): StageBox {
    const r = stages[k].getBoundingClientRect();
    // where the stage's top will be once the page is scrolled to its end
    const end = r.top + scrollY - (document.documentElement.scrollHeight - H);
    if (mobile) {
      // the next form takes over only once this band is out of sight
      return { x: r.left, y: r.top, w: r.width, h: r.height, rest: Math.max(H * 0.25, end), lead: hdrB - r.height };
    }
    if (kinds[k] === "edge") {
      // the whole section: it has arrived once its top is a third of the way up the screen, and hands
      // over once its bottom comes up into the screen (the form itself keeps to the window's edges)
      return { x: 0, y: r.top, w: W, h: r.height, rest: H * 0.35, lead: Math.min(H * 0.35, H - r.height) };
    }
    if (kinds[k] === "stick") {
      // the box runs from under the headline (or the header, once the headline has gone) to the
      // bottom of the screen; it has arrived once the beat's top is under the header
      const off = r.top - sections[k].querySelector(".fl-inner")!.getBoundingClientRect().top;
      const full = H * 0.95 - T, y = Math.min(Math.max(T, r.top), r.bottom - full), h = Math.max(1, Math.min(full, H * 0.95 - y));
      return { x: r.left, y, w: r.width, h, rest: T + off, lead: T };
    }
    if (kinds[k] === "full") {
      // the closing ring keeps to what is on screen of its section once the footer comes up under it
      if (k === B - 1) {
        const y = Math.max(r.top, hdrB);
        // rest moves with y, so the beat still arrives by the section's own top
        return { x: r.left, y, w: r.width, h: Math.max(1, Math.min(r.bottom, H) - y), rest: Math.max(0, end) + y - r.top, lead: 0 };
      }
      return { x: r.left, y: r.top, w: r.width, h: r.height, rest: Math.max(0, end), lead: 0 };
    }
    // a band arrives once it is in view, and leaves once a third of it has gone under the header
    const rest = Math.max(T, H - r.height - H * 0.06, end);
    return { x: r.left, y: r.top, w: r.width, h: r.height, rest, lead: Math.min(rest, T - r.height / 3) };
  }
  /** The beat position: k while beat k is read, k + p while its box leaves and the next one arrives. */
  function beatPos(bx: StageBox[]) {
    for (let k = 0; k < B - 1; k++) {
      // the hero's stream rests through the first bit of scroll (a nudge, a collapsing address bar)
      const d = Math.max(0, bx[k].lead - bx[k].y - (k === 0 && !mobile ? H * 0.18 : 0));
      if (d === 0) return k;
      const e = Math.max(0, bx[k + 1].y - bx[k + 1].rest);
      if (e > 0) return k + d / (d + e);
    }
    return B - 1;
  }
  /**
   * The box the form is drawn in at beat position s. Two-column: between two stage boxes, in step
   * with the scroll; a wide box narrows over the first part of the way and a narrow one widens over
   * the last, so the form crosses the text column small. One column: the next band, which is out of
   * sight until the previous one is.
   */
  function drawBox(s: number, bx: StageBox[]): Box {
    const k = Math.min(Math.floor(s), B - 2), p = s - k, a = bx[k], b = bx[k + 1];
    if (p <= 0) return a;
    if (mobile) return b;
    const hx = a.w > b.w + 1 ? smooth(0, 0.45, p) : b.w > a.w + 1 ? smooth(0.55, 1, p) : p;
    return { x: lerp(a.x, b.x, hx), w: lerp(a.w, b.w, hx), y: lerp(a.y, b.y, p), h: lerp(a.h, b.h, p) };
  }
  /** Group position and scale that fit form k into box b (screen px). */
  function fit(k: number, b: Box, o: { x: number; y: number; s: number }) {
    const e = ext[k], upp = viewH / H, z = camera.position.z;
    if (k === 0) {
      // the hero stream is laid out in camera space: centred on its box, scaled with the box height
      o.s = (b.h * upp) / viewH;
      o.x = ((b.x + b.w / 2) / W - 0.5) * viewW;
      o.y = (0.5 - (b.y + b.h / 2) / H) * viewH;
      return;
    }
    if (camForm(k)) {
      // the edge blocks and the ring place themselves in the camera plane (see view)
      o.s = 1;
      o.x = o.y = 0;
      return;
    }
    // the projects form leaves the left part of its column to the stage caption beside the route
    if (k === 8 && !mobile && data.run) b = { ...b, x: b.x + b.w * 0.44, w: b.w * 0.56 };
    // the form takes most of its box but leaves room around it, so the text beside it leads
    const s0 = Math.min((b.w * upp) / (e.max.x - e.min.x), (b.h * upp) / (e.max.y - e.min.y)) * 0.8;
    // perspective: the nearest part looks larger by z / (z - zNear)
    o.s = s0 * (1 - (Math.max(0, e.max.z) * s0) / z);
    o.x = ((b.x + b.w / 2) / W - 0.5) * viewW - (o.s * (e.min.x + e.max.x)) / 2;
    o.y = (0.5 - (b.y + b.h / 2) / H) * viewH - (o.s * (e.min.y + e.max.y)) / 2;
  }

  /**
   * The contact ring's ellipse, in the camera plane: around the contact text with room for the band and
   * its clearance (so no block ever shrinks away from the text and leaves a gap), or, on narrow screens,
   * inside the band above the text.
   */
  const ringText = [...(sections[B - 1]?.querySelectorAll<HTMLElement>(".fl-head, .fl-body") ?? [])];
  function fitRing(b: Box) {
    let cx: number, cy: number, rx: number, ry: number;
    if (mobile || !ringText.length) {
      cx = b.x + b.w / 2;
      cy = b.y + b.h / 2;
      rx = b.w * 0.4;
      ry = Math.min(b.h * 0.38, rx);
    } else {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const el of ringText) {
        const r = el.getBoundingClientRect();
        [x0, y0, x1, y1] = [Math.min(x0, r.left), Math.min(y0, r.top), Math.max(x1, r.right), Math.max(y1, r.bottom)];
      }
      cx = (x0 + x1) / 2;
      cy = (y0 + y1) / 2;
      // an ellipse through the corners of the text box is that box's half-size times √2
      rx = Math.min(W * 0.48, ((x1 - x0) / 2) * Math.SQRT2 + 60);
      ry = Math.min(H * 0.47, ((y1 - y0) / 2) * Math.SQRT2 + 70);
    }
    const k = viewW / W;
    Object.assign(view.ring, { cx: (cx / W - 0.5) * viewW, cy: (0.5 - cy / H) * viewH, rx: rx * k, ry: ry * k });
  }

  /* pointer: tokens near the cursor lean away a little */
  const ptr = { x: 0, y: 0, sx: 0, sy: 0, active: false };
  const onPointer = (e: PointerEvent) => {
    ptr.x = (e.clientX / W) * 2 - 1;
    ptr.y = (e.clientY / H) * 2 - 1;
    ptr.active = e.pointerType === "mouse";
  };

  /* per frame */
  const oA = out(), oB = out(), M4 = new THREE.Matrix4(), qT = new THREE.Quaternion();
  const ray = new THREE.Raycaster(), inv = new THREE.Matrix4(), ro = V(), rd = V(), tv = V(), C = V(), mid = V(), tan = V();
  const LIFT = V(0, 0.35, 0.45), pAv = V(), ndc = new THREE.Vector2();

  const fa = { x: 0, y: 0, s: 1 }, fb = { x: 0, y: 0, s: 1 };
  function placeGroup(s: number, box: Box) {
    const k = Math.min(Math.floor(s), B - 2), f = ease(s - k);
    fit(k, box, fa);
    fit(k + 1, box, fb);
    group.position.set(lerp(fa.x, fb.x, f), lerp(fa.y, fb.y, f), 0);
    group.scale.setScalar(lerp(fa.s, fb.s, f));
    // halos keep their size relative to the tokens on a small stage
    hMat.uniforms.uScale.value = hBase * Math.min(1, group.scale.x);
    group.rotation.set(lerp(RX[k], RX[k + 1], f) + ptr.sy * 0.05, lerp(RY[k], RY[k + 1], f) + ptr.sx * 0.08, 0);
    key.position.set(group.position.x - 5 + ptr.sx * 1.5, group.position.y + 7, 9);
    key.target.position.copy(group.position);
    rim.position.set(group.position.x + 7, group.position.y + 2, -6);
    rim.target.position.copy(group.position);
  }

  function updateTokens(s: number, t: number, avoid = false) {
    const k = Math.min(Math.floor(s), B - 2), f = s - k, pa = perm[k], pb = perm[k + 1], st = stag[k], vk = via[k];
    const S = 0.72, done = f >= 1 - 1e-4, moving = f > 1e-4 && !done;
    let hover = false;
    if (ptr.active) {
      group.updateMatrixWorld();
      ray.setFromCamera(ndc.set(ptr.sx, -ptr.sy), camera);
      inv.copy(group.matrixWorld).invert();
      ro.copy(ray.ray.origin).applyMatrix4(inv);
      rd.copy(ray.ray.direction).transformDirection(inv);
      hover = true;
    }
    const ga = glowAttr.array as Float32Array, ca = mesh.instanceColor!.array as Float32Array;
    // the largest halo radius in CSS px (point size at full glow, see the halo shader)
    const haloR = (hMat.uniforms.uScale.value * 1.4) / camera.position.z / 2 / renderer.getPixelRatio();
    if (avoid) group.updateMatrixWorld();
    for (let i = 0; i < N; i++) {
      // how far this token is in flight (0 at rest): its clearance widens with it, token by token
      let fly = 0;
      if (done) evalSlot(k + 1, pb[i], t, oA);
      else {
        evalSlot(k, pa[i], t, oA);
        const fi = moving ? ease(clamp01((f - st[i] * S) / (1 - S))) : 0;
        if (fi > 0) {
          evalSlot(k + 1, pb[i], t, oB);
          // quadratic path: through a shared point (a pour) or over a gentle common arc; never random scatter
          if (vk[i]) C.copy(vk[i]!);
          else C.lerpVectors(oA.p, oB.p, 0.5).add(LIFT);
          const w = 1 - fi;
          tan.copy(C).sub(oA.p).multiplyScalar(2 * w).addScaledVector(mid.copy(oB.p).sub(C), 2 * fi);
          const pA = pAv.copy(oA.p);
          oA.p.set(0, 0, 0).addScaledVector(pA, w * w).addScaledVector(C, 2 * w * fi).addScaledVector(oB.p, fi * fi);
          const arc = Math.sin(Math.PI * fi);
          fly = arc;
          oA.q.slerp(oB.q, fi);
          if (tan.lengthSq() > 1e-6) {
            qT.setFromUnitVectors(X, tan.normalize());
            oA.q.slerp(qT, arc * 0.9);
          }
          oA.s.lerp(oB.s, fi);
          const sm = Math.max(oA.s.x, oA.s.y, oA.s.z);
          if (sm > 0.01) oA.s.set(sm * (1 + 0.9 * arc), sm * (1 - 0.45 * arc), sm * (1 - 0.45 * arc));
          oA.g = Math.max(lerp(oA.g, oB.g, fi), 0.32 * arc);
          oA.c.lerp(oB.c, fi);
          oA.b.lerp(oB.b, fi);
        }
      }
      if (hover) {
        tv.subVectors(oA.p, ro);
        tv.addScaledVector(rd, -tv.dot(rd));
        const d = tv.length(), push = Math.exp(-d * d * 1.6);
        if (d > 1e-3) oA.p.addScaledVector(tv, (push * 0.2) / d);
        oA.g += push * 0.1;
      }
      if (avoid) {
        const sm = Math.max(oA.s.x, oA.s.y, oA.s.z);
        // even a tiny token shows as a speck at a large scale
        if (sm > 0) {
          // a token in flight keeps a wider berth: it is stretched and turning, so its reach is less certain
          const v = clearance(oA.p, sm, 16 * fly);
          oA.s.multiplyScalar(v);
          oA.g *= v;
        }
      }
      M4.compose(oA.p, oA.q, oA.s);
      mesh.setMatrixAt(i, M4);
      const g = oA.g * 2.4;
      ga[i * 3] = oA.c.r * g;
      ga[i * 3 + 1] = oA.c.g * g;
      ga[i * 3 + 2] = oA.c.b * g;
      ca[i * 3] = oA.b.r;
      ca[i * 3 + 1] = oA.b.g;
      ca[i * 3 + 2] = oA.b.b;
      let hs = oA.s.y > 0.02 ? Math.max(0, oA.g - 0.25) * 0.9 : 0;
      // a halo is wider than its token: it fades by its own reach, so it never spills onto text
      if (avoid && hs > 0) hs *= clearance(oA.p, 0, haloR);
      hPos[i * 3] = oA.p.x;
      hPos[i * 3 + 1] = oA.p.y;
      hPos[i * 3 + 2] = oA.p.z;
      hCol[i * 3] = oA.c.r * hs;
      hCol[i * 3 + 1] = oA.c.g * hs;
      hCol[i * 3 + 2] = oA.c.b * hs;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    glowAttr.needsUpdate = true;
    hGeo.attributes.position.needsUpdate = true;
    hGeo.attributes.aCol.needsUpdate = true;
  }

  /* page state that follows the subject: a beat's text appears as its form completes; the item being read is marked */
  const rail = [...root.querySelectorAll<HTMLElement>("[data-rail] > *")];
  // the rail counts sections: an edge beat (the projects after the run) keeps its section's number
  let railN = -1;
  const railOf = kinds.map((kd) => (kd === "edge" ? Math.max(0, railN) : ++railN));
  const codeLines = [...root.querySelectorAll<HTMLElement>("[data-code] .ln")];
  const items = sections.map((sec) => {
    const r: [HTMLElement, number][] = [];
    sec.querySelectorAll<HTMLElement>("[data-item-list] li").forEach((el, i) => r.push([el, i]));
    sec.querySelectorAll<HTMLElement>("[data-item]").forEach((el) => r.push([el, +el.dataset.item!]));
    return r;
  });
  let railOn = -1, hotLine = -1, readK = -1, readI = -1;
  /*
   * The devline run figure on the page: the projects form follows the stage it shows. While the figure is
   * pinned the stage is the one its rail marks; before it the run has not started (-1), after it it is done.
   */
  const runFig = root.querySelector<HTMLElement>(".dlr");
  const runPin = runFig?.querySelector<HTMLElement>(".dlr-pin");
  const runTicks = [...(runFig?.querySelectorAll<HTMLElement>(".dlr-rail > li") ?? [])];
  const runLabels = [...stages[8].querySelectorAll<HTMLElement>("[data-label]")].filter((l) => +l.dataset.label! >= 100);
  let runLabOn = -1;
  function readRun(dt: number) {
    const n = data.run?.ids.length ?? 0;
    let target = n;
    runState.pinned = false;
    if (runPin && runFig?.dataset.mode === "live") {
      // y: how far the pin is below its stuck place (> 0 before the scene, < 0 once released). The last
      // stage's place is the very end of the sticky range, so a scroll that lands a pixel or two past it
      // (rounding, a released wheel notch) still shows that stage: the figure counts as pinned for half a
      // stage's scroll after its end, as the figure's own stepping does.
      const top = parseFloat(getComputedStyle(runPin).top) || 0, y = runPin.getBoundingClientRect().top - top;
      const step = (runPin.parentElement!.offsetHeight - runPin.offsetHeight) / Math.max(1, n - 1);
      runState.pinned = y < 2 && -y < step / 2;
      target = runState.pinned ? Math.max(0, runTicks.findIndex((t) => t.hasAttribute("data-cur"))) : y > 0 ? -1 : n;
    }
    runState.rp += (target - runState.rp) * (1 - Math.exp(-dt * 5));
    const on = runState.pinned ? Math.round(runState.rp) : -1;
    if (on !== runLabOn) {
      // the station's name (100 + k) and the stage caption beside it (200 + k)
      runLabels.forEach((l) => l.toggleAttribute("data-on", +l.dataset.label! % 100 === on));
      runLabOn = on;
    }
  }
  function textState(s: number, target: number, now: number) {
    sections.forEach((sec, k) => sec.classList.toggle("in", s >= k - 0.18 || sec.getBoundingClientRect().top < H * 0.75));
    const on = railOf[Math.round(s)];
    if (on !== railOn) {
      rail.forEach((r, i) => r.toggleAttribute("data-on", i === on));
      railOn = on;
    }
    const hl = Math.abs(s - 6) < 0.5 ? codeCursor.cur : -1;
    if (hl !== hotLine) {
      codeLines.forEach((l, i) => l.classList.toggle("hot", i === hl));
      hotLine = hl;
    }
    // the item being read: the last one whose top has passed the reading line
    const k = Math.round(target);
    let idx = -1, top = -Infinity;
    for (const [el, i] of items[k] ?? []) {
      const r = el.getBoundingClientRect();
      if (r.top < H * 0.45 && r.bottom > hdrB && r.top > top) [idx, top] = [i, r.top];
    }
    if (k !== readK || idx !== readI) {
      items[readK]?.forEach(([el]) => el.removeAttribute("data-reading"));
      items[k]?.forEach(([el, i]) => el.toggleAttribute("data-reading", i === idx));
      if (k !== readK) focus.fill(-1);
      focusPrev[k] = focus[k];
      focusAt[k] = now;
      focus[k] = idx;
      [readK, readI] = [k, idx];
    }
  }

  /* labels: the page's labels for the parts of a form (`[data-label]` in its stage) stand on their part */
  const labels = stages.map((st, k) => {
    const at = L[k].labels;
    return at ? [...st.querySelectorAll<HTMLElement>("[data-label]")].flatMap((el) => (at.has(+el.dataset.label!) ? [[el, at.get(+el.dataset.label!)!] as const] : [])) : [];
  });
  const lp = V();
  function placeLabels(s: number, shown: boolean) {
    group.updateMatrixWorld();
    labels.forEach((ls, k) => {
      // only while the form is at rest in its beat
      const v = shown ? clamp01(1 - Math.abs(s - k) * 5) : 0;
      for (const [el, p] of ls) {
        // a label for one text item's part (`data-for`) shows while that item is read
        const it = el.dataset.for, on = v > 0.01 && (it === undefined || focus[k] === +it);
        el.style.visibility = on ? "visible" : "hidden";
        if (!on) continue;
        lp.copy(p).applyMatrix4(group.matrixWorld).project(camera);
        // never over the header, or for a form that is off screen
        const ly = (1 - lp.y) * 0.5 * H;
        if (ly < hdrB + 24 || ly > H) {
          el.style.visibility = "hidden";
          continue;
        }
        el.style.opacity = String(v);
        // a label stands right of its point (or ends at it, `data-end`) and moves in to stay whole
        const px = (lp.x + 1) * 0.5 * W, x = el.hasAttribute("data-end") ? Math.max(10, px - el.offsetWidth) : Math.min(px, W - el.offsetWidth - 10);
        // a stage caption (`data-cap`) sets its first line level with the point; a label sits on it
        el.style.transform = el.hasAttribute("data-cap") ? `translate3d(${Math.round(x)}px,${Math.round(ly) - 24}px, 0)` : `translate3d(${Math.round(x)}px,${Math.round(ly) - 10}px, 0) translateY(-100%)`;
      }
    });
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    free();
  }

  /* stills: one image of each form in its stage, no loop (reduced motion, or too slow to animate) */
  let stopped = false;
  async function stills() {
    const w = 960, h = 560;
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.setScissorTest(false);
    [W, H] = [w, h];
    setView(w, h);
    hBase = h * 0.9;
    sections.forEach((s) => s.classList.add("in"));
    focus.fill(-1);
    runState.rp = data.run?.ids.length ?? 0;
    try {
      // the ring centred in the still; the edge beat has no still (its blocks only drift at the window's edges)
      Object.assign(view.ring, { cx: 0, cy: 0, rx: view.vw * 0.36, ry: view.vh * 0.34 });
      for (let k = 0; k < B && !stopped; k++) {
        if (kinds[k] === "edge") continue;
        ptr.sx = ptr.sy = 0;
        placeGroup(k, { x: 0, y: 0, w, h });
        updateTokens(k, 2.6);
        renderer.clear();
        renderer.render(scene, camera);
        const img = new Image();
        img.alt = "";
        img.src = canvas.toDataURL("image/png");
        stages[k].appendChild(img);
        // one still per task, so a slow device never blocks input for long
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      dispose();
    }
  }
  const removeStills = () => stages.forEach((st) => st.querySelectorAll("img").forEach((i) => i.remove()));
  if (reduced) {
    void stills();
    run.stop = () => {
      stopped = true;
      removeStills();
    };
    return;
  }

  let sCur = 0, t = 0, last = performance.now(), raf = 0, visible = true, lost = false;
  // Frame budget guard: if the device cannot animate the subject smoothly (software WebGL, a weak
  // GPU), it drops to the stills. Measured over frames 5-30 so shader compilation does not count.
  const gaps: number[] = [];
  function frame(now: number) {
    raf = 0;
    if (gaps.length < 30) {
      gaps.push(now - last);
      if (gaps.length === 30) {
        const g = gaps.slice(5).sort((a, b) => a - b);
        if (g[g.length >> 1] > 40) {
          detach();
          onSlow();
          stills();
          return;
        }
      }
    }
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    t += dt;
    const bx = stages.map((_, k) => stageBox(k)), target = beatPos(bx);
    sCur += (target - sCur) * (1 - Math.exp(-dt * 6));
    if (Math.abs(target - sCur) < 1e-4) sCur = target;
    root.dataset.pos = sCur.toFixed(3); // test hook: the beat position
    readRun(dt);
    ptr.sx += (ptr.x - ptr.sx) * (1 - Math.exp(-dt * 3));
    ptr.sy += (ptr.y - ptr.sy) * (1 - Math.exp(-dt * 3));
    // the box follows the page exactly; the form inside it eases toward the scroll position
    const box = drawBox(mobile ? target : sCur, bx);
    renderer.clear();
    const shown = box.y < H && box.y + box.h > 0;
    if (sCur > B - 2.5) fitRing(bx[B - 1]);
    if (shown) {
      placeGroup(sCur, box);
      // wall clock, like collectedAt (a frame time can lag it)
      if (dirty && performance.now() - collectedAt > 150) collect();
      visibleBoxes();
      updateTokens(sCur, t, true);
      renderer.render(scene, camera);
    }
    placeLabels(sCur, shown);
    // lets a test read the finished frame (the drawing buffer is only valid until it is shown)
    root.dispatchEvent(new Event("flowframe"));
    textState(sCur, target, t);
    tick();
  }
  // runs only while the tab is visible and the beats are on screen
  function tick() {
    if (raf || lost || document.hidden || !visible) return;
    raf = requestAnimationFrame(frame);
  }
  function wake() {
    last = performance.now();
    tick();
  }
  const io = new IntersectionObserver((e) => {
    visible = e[e.length - 1].isIntersecting;
    canvas.style.visibility = visible ? "" : "hidden";
    wake();
  });
  io.observe(root);
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    onFail();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  addEventListener("resize", resize);
  addEventListener("pointermove", onPointer, { passive: true });
  document.addEventListener("visibilitychange", wake);
  // text moves when panels open, fonts arrive or the hero's rise ends
  const ro2 = new ResizeObserver(() => (dirty = true));
  ro2.observe(root);
  document.fonts?.ready.then(() => !detached && collect());
  const late = setTimeout(collect, 1800);
  resize();
  collect();
  // start at the current scroll position (reload, anchor jump) without flying in from the top
  sCur = beatPos(stages.map((_, k) => stageBox(k)));
  textState(sCur, sCur, 0);
  wake();

  let detached = false;
  function detach() {
    if (detached) return;
    detached = true;
    lost = true;
    cancelAnimationFrame(raf);
    io.disconnect();
    ro2.disconnect();
    clearTimeout(late);
    canvas.removeEventListener("webglcontextlost", onLost);
    removeEventListener("resize", resize);
    removeEventListener("pointermove", onPointer);
    document.removeEventListener("visibilitychange", wake);
  }
  run.stop = () => {
    stopped = true;
    detach();
    dispose();
    removeStills();
  };
}
