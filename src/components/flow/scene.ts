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

import type { FlowSceneData } from "./scene-data";

type V3 = THREE.Vector3;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Slot = { p: V3; s: V3; q?: THREE.Quaternion } & Record<string, any>;
interface Out { p: V3; q: THREE.Quaternion; s: V3; g: number; c: THREE.Color; b: THREE.Color }
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
const P = V(), P2 = V(), T = V(), Nn = V();
const out = (): Out => ({ p: V(), q: new THREE.Quaternion(), s: V(), g: 0, c: new THREE.Color(), b: new THREE.Color() });

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
function stream(arr: Slot[], lanes: number, per: number, curve: Curve, o: { speed: number; laneW: number; sz: number; hide?: (x: number) => number; twist?: number; ev?: number; packets?: (x: number, t: number) => number; reveal?: number }) {
  for (let lane = 0; lane < lanes; lane++)
    for (let k = 0; k < per; k++)
      arr.push({ s: V(), p: V(), stream: true, lane, lanes, k, per, curve, speed: o.speed, laneW: o.laneW, sz: o.sz, hide: o.hide, twist: o.twist || 0, ev: o.ev ?? 0.14, packets: o.packets, reveal: o.reveal });
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
  o.s.set(sl.sz * 2.2, sl.sz, sl.sz).multiplyScalar(vis);
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
/** Right end of the projects pipeline: where its output pours into the closing ring. */
let exitX = 3.35;
/** `focus[k]`: the text item of beat k being read, or -1. */
function buildLayouts(data: FlowSceneData, codeCursor: { cur: number }, focus: number[], focusAt: number[], focusPrev: number[]): Layout[] {
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

  // 2 earlier work, one row per job as the text lists them: the lead job's legacy monolith is split into
  // services fed by Kafka; every other job is a slab as long as the job lasted
  {
    const SVC = [-0.2, 1.7, 3.6];
    const a: Slot[] = [];
    block(a, 4, 5, 3, 0.3, V(-3.1, 0, 0), 0.27, { legacy: true, mono: true, item: 0 });
    SVC.forEach((x, i) => block(a, 4, 4, 4, 0.3, V(x, 0, 0), 0.26, { svc: i + 1 }));
    stream(a, 4, 62, (u, t, o) => o.set(lerp(-2.2, 5.6, u), 0, 0), { speed: 0.035, laneW: 0.22, sz: 0.1, ev: 0.08, hide: hideIn(SVC.map((x) => [x - 0.6, x + 0.6])), packets: packetsAt(-2.2, 5.6, 0.11, 2) });
    data.jobs.slice(1, 4).forEach((j, i) => {
      const nx = Math.max(2, Math.min(16, Math.round(j.months / 1.5)));
      block(a, nx, 2, 2, 0.3, V(-3.55 + (nx - 1) * 0.15, -1.6 - i * 0.8, 0), 0.26, { item: i + 1 });
    });
    L.push({
      slots: spares(a, SVC.map((x) => V(x, 0, 0))),
      live(sl, t, o) {
        if (sl.mono && sl.lx === 3) o.p.x += 0.18 + 0.14 * Math.sin(t * 1.2 + sl.ly); // the last slice keeps peeling away
        if (sl.svc && sl.surf) {
          const px = lerp(-2.2, 5.6, fract(t * 0.11)), px2 = lerp(-2.2, 5.6, fract(t * 0.11 + 0.5)), bx = SVC[sl.svc - 1];
          o.g = Math.abs(px - bx) < 0.65 || Math.abs(px2 - bx) < 0.65 ? 0.55 : 0;
        }
      },
    });
  }

  // 3 current work: the services the text counts, on one event stream; a packet lights each service as it passes
  {
    const n = data.services, SVC = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 2), half = n + 1.5;
    const a: Slot[] = [];
    SVC.forEach((x, i) => block(a, 4, 4, 4, 0.29, V(x, 0, 0), 0.25, { svc: i + 1 }));
    stream(a, 4, 60, (u, t, o) => o.set((u - 0.5) * 2 * half, 0, 0), {
      speed: 0.032, laneW: 0.2, sz: 0.1, ev: 0.08, packets: packetsAt(-half, half, 0.08, 2),
      hide: (x) => hideIn(SVC.map((s) => [s - 0.58, s + 0.58]))(x) * smooth(half - 0.1, half - 1.3, Math.abs(x)),
    });
    L.push({
      slots: spares(a, [V()]),
      live(sl, t, o) {
        if (sl.svc && sl.surf) {
          const bx = SVC[sl.svc - 1];
          let g = 0;
          for (let i = 0; i < 2; i++) g = Math.max(g, smooth(0.75, 0.2, Math.abs(lerp(-half, half, fract(t * 0.08 + i / 2)) - bx)));
          o.g = g * 0.7;
        }
      },
    });
  }

  // 4 migration, a pinned beat in two steps. Item 0: of the text's `total` apps, `moved` cross from the
  // old platform (raised, upper left) down to Kubernetes (lower right); stacked diagonally so the form
  // fits a column at a large size. Item 1: the stateful one's state is written to a
  // changelog, a Kafka partition drawn as a commit log of records over the gap, which is replayed
  // record by record into the app rebuilt on the new side.
  {
    const [moved, total] = data.migrate, cols = Math.ceil(total / 2), nx = Math.round(((cols - 1) * 0.82) / 0.47) + 2;
    const M = { xL: 1.5 - nx * 0.235 - 0.35, yL: 1.25, xR: 1.5, py: -0.75, cx: 0.82, rz: 0.44 };
    const appPos = (i: number) => V(M.xR + ((i % cols) - (cols - 1) / 2) * M.cx, M.py + 0.38, i < cols ? -M.rz : M.rz);
    const STATEFUL = cols; // the first app of the front row, and the ones after it
    const a: Slot[] = [];
    for (let z = 0; z < 4; z++) for (let x = 0; x < nx; x++) a.push({ p: V(M.xR + (x - (nx - 1) / 2) * 0.47, M.py, (z - 1.5) * 0.47), s: V(0.43, 0.07, 0.43), plate: "new" });
    for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) a.push({ p: V(M.xL + (x - 1.5) * 0.47, M.yL, (z - 1.5) * 0.47), s: V(0.43, 0.07, 0.43), plate: "old", legacy: true });
    const rebuilt = (i: number) => i >= STATEFUL && i < STATEFUL + total - moved;
    for (let i = 0; i < total; i++) if (!rebuilt(i)) block(a, 3, 3, 3, 0.21, appPos(i), 0.18, { app: i, item: 0 });
    block(a, 3, 3, 3, 0.21, V(M.xL, M.yL + 0.38, 0), 0.18, { legacy: true, oldApp: true, item: 1 });
    for (let i = 0; i < total; i++) if (rebuilt(i)) block(a, 3, 3, 3, 0.21, appPos(i), 0.18, { rebuild: true, item: 1 });
    // the changelog: one partition of records at rising offsets, from the old app down to the rebuilt one
    const R = 16, l0 = V(M.xL + 0.75, M.yL + 0.75, 0), l1 = appPos(STATEFUL).add(V(0.1, 0.95, 0));
    for (let r = 0; r < R; r++)
      for (let lane = 0; lane < 2; lane++)
        a.push({ p: l0.clone().lerp(l1, (r + 0.5) / R).add(V(0, 0, (lane - 0.5) * 0.3)), s: V(0.27, 0.09, 0.26), rec: r, recs: R, item: 1 });
    // a work item crossing for each moved app, one after another, while the first step is read
    const arcFrom = V(M.xL, M.yL + 0.6, 0);
    for (let i = 0; i < 4; i++) a.push({ p: arcFrom.clone(), s: V(), courier: i });
    const appXs = Array.from({ length: total }, (_, i) => i).filter((i) => !rebuilt(i)).map(appPos);
    const cp = V();
    L.push({
      slots: spares(a, [appPos(2), appPos(cols + 2), appPos(3), appPos(cols + 3)]),
      live(sl, t, o) {
        const f = focus[4], since = t - focusAt[4];
        // 1 while the changelog step is read, eased in and out
        const logOn = measure.ext ? 1 : f === 1 ? smooth(0, 1.4, since) : f === 0 && since < 0.8 && focusPrev[4] === 1 ? 1 - smooth(0, 0.8, since) : 0;
        if (sl.plate === "new") o.g = 0.1 + 0.25 * smooth(0.25, 0, Math.abs(fract(t * 0.2) - (sl.p.x - M.xR + nx * 0.235) / (nx * 0.47)));
        if (sl.app !== undefined && sl.ly === 2) o.g = 0.25 + 0.35 * Math.max(0, Math.sin(t * 1.6 - sl.app * 0.7));
        const cyc = fract(t / 5);
        if (sl.rec !== undefined) {
          // written one record after another, then read by a cursor that walks the offsets
          const w = clamp01(logOn * (sl.recs + 4) - sl.rec);
          o.s.multiplyScalar(w);
          o.p.y += (1 - w) * 0.4;
          const cur = smooth(0, 0.45, cyc) * (sl.recs + 1) - 0.5;
          o.g = 0.12 + 0.95 * smooth(0.9, 0, Math.abs(cur - sl.rec)) * logOn;
        }
        if (sl.rebuild) {
          // grows once the cursor has passed the last record; whole outside the changelog step
          const v = logOn > 0.99 ? clamp01((cyc - 0.45) * 2.2 * 29 - sl.idx) : 1 - logOn;
          o.s.multiplyScalar(v);
          o.g = v > 0 && v < 1 ? 1 : sl.ly === 2 ? 0.35 : 0.08;
        }
        if (sl.oldApp) o.g = 0.08 + 0.25 * logOn + 0.1 * Math.max(0, Math.sin(t * 3));
        if (sl.courier !== undefined) {
          // the first step: packets keep crossing from the old platform to each moved app in turn
          const ph = fract(t / 1.6 + sl.courier * 0.25), target = appXs[Math.floor(t / 1.6 + sl.courier * 0.25) % appXs.length];
          const on = (f === 0 ? 1 : 0) * (1 - logOn);
          cp.set((arcFrom.x + target.x) / 2 + 0.6, arcFrom.y + 0.9, 0);
          const w = 1 - ph;
          o.p.set(0, 0, 0).addScaledVector(arcFrom, w * w).addScaledVector(cp, 2 * w * ph).addScaledVector(target, ph * ph).setY(o.p.y + 0.2);
          o.s.setScalar(0.15 * on * Math.sin(Math.PI * ph));
          o.g = 1.4;
          o.c.copy(WHITE);
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

  // 7 Dux: a desktop shell; one bar item per featured PR and a stack of windows, one per Dux project, as listed.
  // The popout opens under the PR being read, or under one PR after another.
  {
    const cols = 13, rows = 7, sp = 0.42;
    const barY = ((rows - 1) / 2) * sp + 0.42, barX = (i: number) => (i - (cols - 1) / 2) * sp;
    const np = Math.max(1, Math.min(cols, data.prs)), nw = Math.min(4, data.duxProjects);
    const items = Array.from({ length: np }, (_, i) => Math.round(((i + 0.5) * cols) / np - 0.5));
    const a: Slot[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) a.push({ p: V(barX(c), ((rows - 1) / 2 - r) * sp, -0.2), s: V(0.38, 0.38, 0.05), screen: true, c });
    for (let c = 0; c < cols; c++) {
      const pr = items.indexOf(c);
      a.push({ p: V(barX(c), barY, 0.95), s: V(0.36, 0.15, 0.12), bar: c, ...(pr >= 0 && data.prs ? { item: pr } : {}) });
    }
    // the windows overlap like a stack on the desktop, each one a step nearer and lower than the last
    for (let w = 0; w < nw; w++)
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 5; c++)
          a.push({ p: V((w - (nw - 1) / 2) * 1.1 + (c - 2) * 0.34, 0.8 - w * 0.48 - r * 0.34, 0.18 + w * 0.34), s: V(0.32, r === 0 ? 0.2 : 0.32, 0.07), win: w, title: r === 0, item: data.prs + w });
    for (let i = 0; i < 9; i++) a.push({ p: V(barX(items[0]) + ((i % 3) - 1) * 0.3, barY - 0.4 - Math.floor(i / 3) * 0.3, 1.0), s: V(0.27, 0.27, 0.07), pop: i });
    L.push({
      slots: spares(a, [V(0, 0, 0)]),
      live(sl, t, o) {
        const f = focus[7], held = f >= 0 && f < np, k = held ? f : Math.floor(t / 3) % np, ph = held ? 0.5 : fract(t / 3);
        const grow = smooth(0, 0.18, ph) * smooth(1, 0.82, ph);
        if (sl.pop !== undefined) {
          o.p.set(barX(items[k]) + ((sl.pop % 3) - 1) * 0.3, barY - 0.25 - (0.15 + Math.floor(sl.pop / 3) * 0.3) * grow, 1.0);
          o.s.multiplyScalar(grow);
          o.g = 0.18 + 0.2 * grow;
        } else if (sl.bar !== undefined) o.g = sl.bar === items[k] ? 0.3 + 0.7 * grow : 0.1;
        else if (sl.title) o.g = 0.2 + 0.15 * sl.win;
        else if (sl.screen) o.g = 0.03;
      },
    });
  }

  // 8 projects: the featured pipeline, stage by stage, a parallel stage fanned out into its lanes (item 0);
  // below it one block per other project, as listed (items 1..)
  {
    const S = data.stages.length ? data.stages : [1], gap = 1.35, xs = S.map((_, i) => (i - (S.length - 1) / 2) * gap);
    const ys = (n: number) => Array.from({ length: n }, (_, l) => ((n - 1) / 2 - l) * 1.0);
    const laneY = (i: number, lane: number) => (S[i] > 1 ? ys(S[i])[lane % S[i]] : 0);
    const a: Slot[] = [];
    S.forEach((n, i) => ys(n).forEach((y, l) => block(a, 3, 3, 3, 0.22, V(xs[i], y, 0), 0.19, { st: i, lane: l, item: 0 })));
    const st = 0.17, cs = 0.08;
    for (let i = 0; i + 1 < S.length; i++) {
      const m = (xs[i] + xs[i + 1]) / 2, A = ys(S[i]), B2 = ys(S[i + 1]), lo = Math.min(...A, ...B2), hi = Math.max(...A, ...B2);
      A.forEach((y) => line(a, V(xs[i] + 0.34, y, 0), V(m, y, 0), st, cs));
      if (hi > lo) line(a, V(m, lo, 0), V(m, hi, 0), st, cs);
      B2.forEach((y) => line(a, V(m, y, 0), V(xs[i + 1] - 0.34, y, 0), st, cs));
    }
    const lanes = Math.max(...S), rowY = -((lanes - 1) / 2) - 1.25, np = Math.min(6, data.projects);
    const span = xs[xs.length - 1] - xs[0];
    for (let i = 0; i < np; i++) block(a, 3, 2, 2, 0.22, V(np > 1 ? xs[0] + (i * span) / (np - 1) : 0, rowY, 0), 0.19, { item: i + 1, proj: i });
    for (let i = 0; i < lanes; i++) a.push({ p: V(xs[0], 0, 0), s: V(0.16, 0.16, 0.16), pk: i });
    // one work item per lane: through every stage, on its lane where the stage runs in parallel
    const paths = Array.from({ length: lanes }, (_, lane) => {
      const p: number[][] = [[xs[0], laneY(0, lane)]];
      for (let i = 0; i + 1 < S.length; i++) {
        const m = (xs[i] + xs[i + 1]) / 2;
        p.push([m, laneY(i, lane)], [m, laneY(i + 1, lane)], [xs[i + 1], laneY(i + 1, lane)]);
      }
      return p;
    });
    const work = (t: number, lane: number, o: V3) => {
      const ph = fract(t / 6 + lane * 0.04), pp = paths[lane];
      const seg = ph * (pp.length - 1), i = Math.min(pp.length - 2, Math.floor(seg)), f = ease(seg - i);
      return o.set(lerp(pp[i][0], pp[i + 1][0], f), lerp(pp[i][1], pp[i + 1][1], f), 0);
    };
    const c = V(), wv = V();
    exitX = xs[xs.length - 1];
    L.push({
      slots: spares(a, [V(exitX, 0, 0), V(xs[0], 0, 0)]),
      live(sl, t, o) {
        if (sl.pk !== undefined) {
          work(t, sl.pk, o.p).setZ(0.38);
          o.g = 1.5;
          o.c.copy(WHITE);
          return;
        }
        if (sl.st !== undefined && sl.surf) {
          c.set(xs[sl.st], laneY(sl.st, sl.lane), 0);
          let g = 0;
          for (let i = 0; i < lanes; i++) g = Math.max(g, smooth(0.55, 0.15, work(t, i, wv).distanceTo(c)));
          o.g = g * 0.7;
        } else if (sl.conn) o.g = 0.06;
      },
    });
  }

  // 9 contact: the merged output closes into a ring around the contact text; the opening stream, closed
  {
    const a: Slot[] = [], R = 3.4;
    for (let lane = 0; lane < 8; lane++) for (let k = 0; k < 80; k++) a.push({ p: V(), s: V(), ring: true, lane, k });
    L.push({
      slots: a,
      live(sl, t, o) {
        const u = fract(sl.k / 80 + t * 0.018), an = u * TAU;
        const rp = (an: number, v: V3) => v.set(Math.cos(an) * R, 0.26 * Math.sin(3 * an + t * 0.5), Math.sin(an) * R);
        rp(an, P);
        rp(an + 0.01, P2);
        T.subVectors(P2, P).normalize();
        const tw = an * 2 + t * 0.3;
        Nn.set(Math.cos(an), 0, Math.sin(an)).multiplyScalar(Math.cos(tw)).addScaledVector(Y, Math.sin(tw));
        o.p.copy(P).addScaledVector(Nn, (sl.lane - 3.5) * 0.13);
        o.q.setFromUnitVectors(X, T);
        o.s.set(0.3, 0.1, 0.1);
        o.g = isEvent(sl.k, sl.lane, 0.17) ? 0.8 : 0;
        o.c.copy(AMBER);
      },
    });
  }

  return L;
}

/** Number of beats (forms); the page must render one `[data-beat]` with a `[data-stage]` per form. */
export const BEATS = 10;

/**
 * Starts the subject on `canvas`, driven by the beats inside `root`. Returns a stop function.
 * `reduced`: renders one still per form into its stage as an image and stops (no loop, no scroll).
 * Calls `onFail` when WebGL is missing or the context is lost; the page then stays static.
 */
export function startFlow(opts: { canvas: HTMLCanvasElement; root: HTMLElement; data: FlowSceneData; reduced: boolean; onFail: () => void; onSlow: () => void }): () => void {
  const { canvas, root, data, reduced, onFail, onSlow } = opts;
  const codeCursor = { cur: -1 };
  const focus: number[] = new Array(BEATS).fill(-1);
  // when each beat's focus last changed (scene time), and what it was before
  const focusAt: number[] = new Array(BEATS).fill(0);
  const focusPrev: number[] = new Array(BEATS).fill(-1);
  const L = buildLayouts(data, codeCursor, focus, focusAt, focusPrev);
  const B = L.length;

  function evalSlot(k: number, j: number, t: number, o: Out) {
    const lay = L[k], sl = lay.slots[j];
    o.g = 0;
    o.c.copy(AMBER);
    o.b.copy(sl.legacy ? LEGACY : MODERN);
    if (sl.stream) {
      liveStream(sl, t, o);
      return;
    }
    o.p.copy(sl.p);
    o.s.copy(sl.s);
    if (sl.q) o.q.copy(sl.q);
    else o.q.identity();
    lay.live?.(sl, t, o);
    // the part of the text item being read lights up; the other items' parts step back
    const f = focus[k];
    if (f >= 0 && sl.item !== undefined) o.g = sl.item === f ? Math.max(o.g, sl.surf === false ? 0.05 : 0.2) : o.g * 0.3;
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
  // 1 -> 2: the service grows into the monolith; its right part slides out as services
  match(1, byX, byX, { stag: (s, r) => (s.mono ? 0.1 * r : 0.15 + 0.7 * r) });
  // 2 -> 3: the monolith's last slices become the remaining services, left to right
  match(2, byX, byX);
  // 3 -> 4: platforms are laid down from the stream, then the apps cross one at a time on an arc
  // the apps cross right to left, so each lands beside the one before
  const appOrder = [...new Set(L[4].slots.filter((s) => s.app !== undefined).map((s) => s.app as number))].sort((a, b) => b - a);
  const appStep = 0.58 / Math.max(1, appOrder.length);
  match(3, byX, (p, s) => (s.app !== undefined ? 100 + appOrder.indexOf(s.app) * 10 + p.x * 0.01 : p.x), {
    stag: (s) => (s.plate ? 0.05 * clamp01((s.p.x + 4) / 8) : s.app !== undefined ? 0.3 + appStep * appOrder.indexOf(s.app) : s.rebuild ? 0.9 : 0.2),
    via: (s) => (s.app !== undefined ? V(s.p.x - 1.4, 1.6, 0) : null),
  });
  // 4 -> 5: the platforms flatten into the time axis; the apps settle into the school pieces, left to right
  match(4, byX, byX, { stag: (s, r) => (s.axis ? 0.1 * r : 0.2 + 0.7 * r) });
  // 5 -> 6: tokens run through the editor first, then out into the diagram, drawn left to right
  match(5, byX, (p, s) => (s.plate === "ed" || s.code !== undefined ? p.x - 20 : p.x), {
    stag: (s) => (s.plate === "ed" ? 0.05 + 0.2 * clamp01((1.8 - s.p.y) / 3.6) : s.code !== undefined ? 0.2 + 0.25 * (s.code / 9) : 0.45 + 0.5 * clamp01((s.p.x + 1.8) / 6.6)),
    via: (s) => (s.plate === "ed" || s.code !== undefined ? null : V(edX + 1.6, 0, 0.4)),
  });
  // 6 -> 7: the diagram spreads into a desktop; the bar is laid first, then windows, then the screen behind
  match(6, byX, byX, { stag: (s, r) => (s.bar !== undefined ? 0.05 + 0.3 * r : s.win !== undefined ? 0.3 + 0.3 * r : 0.45 + 0.45 * r) });
  // 7 -> 8: the windows and bar condense into the pipeline's stages
  match(7, byX, byX);
  // 8 -> 9: the merged output pours out of the last stage and closes into a ring
  match(8, (p) => -p.x, (_p, s) => s.k + s.lane * 0.001, { stag: (_s, r) => 0.85 * r, via: () => V(exitX + 1.3, 0.3, 0.4) });

  /* renderer, one light setup */
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: reduced });
  } catch {
    onFail();
    return () => {};
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
        if (!n.data.trim()) continue;
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
  const sections = [...root.querySelectorAll<HTMLElement>("[data-beat]")].sort((a, b) => +a.dataset.beat! - +b.dataset.beat!);
  const stages = sections.map((s) => s.querySelector<HTMLElement>("[data-stage]")!);
  // "stick": a column stage that holds its form below the header while the beat is read; "full": the
  // stage is the whole section (hero, contact); "band": a band in the page. Narrow screens: all bands.
  const kinds = stages.map((s) => s.dataset.stage ?? "band");
  const narrow = matchMedia("(max-width: 1199.98px)");
  // rest rotation per form: turned toward the text beside it (on the left in the odd beats, on the
  // right in the even ones); the contact ring faces the viewer, framing the text
  const RX = [0, 0.36, 0.34, 0.42, 0.5, 0.34, 0.14, 0.16, 0.2, 1.18];
  const RY = [0, -0.42, 0.42, -0.26, 0.38, -0.24, 0.3, -0.32, 0.34, 0];
  const RZ = (k: number) => (k === B - 1 ? 0.06 : 0);
  // each form's extent at scale 1 in its rest rotation, over a few seconds of its own motion (its solid parts)
  measure.ext = true;
  const ext = L.map((_, k) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(RX[k], RY[k], RZ(k))), b = new THREE.Box3(), o = out();
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
  let W = 1, H = 1, mobile = false, viewH = 1, viewW = 1, hdrB = 0, T = 0, hBase = 1;
  type Box = { x: number; y: number; w: number; h: number };
  type StageBox = Box & { rest: number; lead: number };
  function setView(w: number, h: number) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    viewW = viewH * camera.aspect;
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
   * Two columns: a form never rests half-changed beside text being read. Past the middle of the gap
   * between two beats the next form takes over and completes on its own (sCur eases to it in about
   * half a second). One column keeps the scroll-linked change: there the next band is out of sight.
   */
  function settledPos(s: number) {
    return mobile ? s : Math.round(s);
  }
  /**
   * The box the form is drawn in at beat position s. Two-column: between two stage boxes; a wide box
   * narrows before it moves and a narrow one widens only on arrival, so the form never sweeps over
   * the text column. One column: the next band, which is out of sight until the previous one is.
   */
  function drawBox(s: number, bx: StageBox[]): Box {
    const k = Math.min(Math.floor(s), B - 2), p = s - k, a = bx[k], b = bx[k + 1];
    if (p <= 0) return a;
    if (mobile) return b;
    const hx = a.w > b.w + 1 ? smooth(0, 0.15, p) : b.w > a.w + 1 ? smooth(0.8, 1, p) : p;
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
    const s0 = Math.min((b.w * upp) / (e.max.x - e.min.x), (b.h * upp) / (e.max.y - e.min.y)) * 0.94;
    // perspective: the nearest part looks larger by z / (z - zNear)
    o.s = s0 * (1 - (Math.max(0, e.max.z) * s0) / z);
    o.x = ((b.x + b.w / 2) / W - 0.5) * viewW - (o.s * (e.min.x + e.max.x)) / 2;
    o.y = (0.5 - (b.y + b.h / 2) / H) * viewH - (o.s * (e.min.y + e.max.y)) / 2;
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
    group.rotation.set(lerp(RX[k], RX[k + 1], f) + ptr.sy * 0.05, lerp(RY[k], RY[k + 1], f) + ptr.sx * 0.08, lerp(RZ(k), RZ(k + 1), f));
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
          const v = clearance(oA.p, sm, moving ? 16 : 0);
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
  const codeLines = [...root.querySelectorAll<HTMLElement>("[data-code] .ln")];
  const items = sections.map((sec) => {
    const r: [HTMLElement, number][] = [];
    sec.querySelectorAll<HTMLElement>("[data-item-list] li").forEach((el, i) => r.push([el, i]));
    sec.querySelectorAll<HTMLElement>("[data-item]").forEach((el) => r.push([el, +el.dataset.item!]));
    return r;
  });
  let railOn = -1, hotLine = -1, readK = -1, readI = -1;
  function textState(s: number, target: number, now: number) {
    sections.forEach((sec, k) => sec.classList.toggle("in", s >= k - 0.18 || sec.getBoundingClientRect().top < H * 0.75));
    const on = Math.round(s);
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
        el.style.visibility = v > 0.01 ? "visible" : "hidden";
        if (v <= 0.01) continue;
        lp.copy(p).applyMatrix4(group.matrixWorld).project(camera);
        el.style.opacity = String(v);
        // a label near the right edge of the window moves left to stay whole
        const x = Math.min((lp.x + 1) * 0.5 * W, W - el.offsetWidth - 10);
        el.style.transform = `translate3d(${Math.round(x)}px,${Math.round((1 - lp.y) * 0.5 * H) - 10}px, 0) translateY(-100%)`;
      }
    });
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    geo.dispose();
    mat.dispose();
    hGeo.dispose();
    hMat.dispose();
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
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
    try {
      for (let k = 0; k < B && !stopped; k++) {
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
    stills();
    return () => {
      stopped = true;
      removeStills();
    };
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
    const bx = stages.map((_, k) => stageBox(k)), target = settledPos(beatPos(bx));
    sCur += (target - sCur) * (1 - Math.exp(-dt * 6));
    if (Math.abs(target - sCur) < 1e-4) sCur = target;
    root.dataset.pos = sCur.toFixed(3); // test hook: the beat position
    ptr.sx += (ptr.x - ptr.sx) * (1 - Math.exp(-dt * 3));
    ptr.sy += (ptr.y - ptr.sy) * (1 - Math.exp(-dt * 3));
    // the box follows the page exactly; the form inside it eases toward the scroll position
    const box = drawBox(mobile ? target : sCur, bx);
    renderer.clear();
    const shown = box.y < H && box.y + box.h > 0;
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
  sCur = settledPos(beatPos(stages.map((_, k) => stageBox(k))));
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
  return () => {
    stopped = true;
    detach();
    dispose();
    removeStills();
  };
}
