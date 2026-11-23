/**
 * The devline run scene: a route map that draws itself as one example request walks through it,
 * a card that shows what each stage produces, a model slider and a big caption at the token.
 * Browser only. `mountDevlineRun` builds the drawing into the server-rendered figure and wires
 * input; scroll input moves exactly one stage per gesture while the scene is pinned.
 *
 * Every pose is a pure function of one number u in 0..LAST: u = k is stage k at rest, u in
 * (k, k + 1) is the sequence that leads into stage k + 1. Input only sets the target stage;
 * the sequence then plays in time, one beat after the other.
 */
import type { DevlineRunViz } from "@/lib/types";
import { createGesture, queueStep, releases, stageFromScroll, wheelStep } from "./stepper";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Live and still both need scripting; without it the server markup is a plain list. */
export const LIVE_QUERY = "(prefers-reduced-motion: no-preference) and (min-height: 540px)";
/** Narrower than this, the figure uses the phone composition (map on its side above the card). */
export const PHONE_BELOW = 760;

// ---- the route map, in map units; y runs down the run
const MX = 70, BX = 110, LX = 132;
const Y = { idea: 20, route: 80, brain: 175, design: 235, plan: 295, prep: 350, fork: 395, impl: 445, join: 495, docs: 550, sec: 605, bp: 660, off: 715, deep: 770, final: 825, end: 877 };
type Station = keyof typeof Y;
const sid = (y: number) => `V${y - 25} C${MX} ${y - 10} ${BX} ${y - 16} ${BX} ${y} C${BX} ${y + 16} ${MX} ${y + 10} ${MX} ${y + 25}`;
const sideOnly = (y: number) => `M${MX} ${y - 25} ${sid(y).slice(String(y - 25).length + 1)}`;
// the route devline sets for this request: detours for design, security scan and best-practices review
const RIDE = `M${MX} ${Y.idea} V${Y.brain} ${sid(Y.design)} V${Y.join} V${Y.docs} ${sid(Y.sec)} ${sid(Y.bp)} V${Y.end}`;
const lane = (x: number) => `M${MX} ${Y.fork} C${MX} ${Y.fork + 17} ${x} ${Y.fork + 11} ${x} ${Y.fork + 27} V${Y.join - 27} C${x} ${Y.join - 11} ${MX} ${Y.join - 17} ${MX} ${Y.join}`;
const LANES = [lane(MX - 28), lane(MX + 28)];
// routes not taken leave Route to the right, nested so they never cross, and stay on the map in grey
const SX = 230;
const STUB_D = [
  [`M${MX} ${Y.route} C${MX} ${Y.route + 24} ${MX + 18} ${Y.route + 38} ${MX + 54} ${Y.route + 38} H${SX}`, Y.route + 38],
  [`M${MX} ${Y.route} C${MX} ${Y.route + 42} ${MX + 24} ${Y.route + 62} ${MX + 66} ${Y.route + 62} H${SX}`, Y.route + 62],
] as const;
// devline's decisions: q is the place in the fan below Route (-1: Route itself, null: not in the fan); off: not switched on
const TAGS: { k: Station; q: number | null; off?: boolean }[] = [
  { k: "route", q: -1 },
  { k: "design", q: 0 },
  { k: "sec", q: 1 },
  { k: "bp", q: 2 },
  { k: "deep", q: 3 },
  { k: "off", q: 4, off: true },
  { k: "prep", q: null, off: true },
];
const FY = (i: number) => Y.route + 96 + 40 * i;
/** The route decisions as a list on the card, for the card-only layout (the map carries them otherwise). */
const RC = TAGS.filter((x) => x.k !== "route");
const GATES: Station[] = ["brain", "plan", "final"];
const DET: Station[] = ["design", "sec", "bp", "off", "prep"];
const OFFS: Station[] = ["off", "prep"];
const atX = (k: Station) => (k === "impl" ? MX + 28 : DET.includes(k) ? BX : MX);
const revY = (k: string) => (k === "impl" ? Y.fork + 10 : Y[k as Station]);

const CHECK = '<svg class="sy" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>';
const DASH = '<svg class="sy" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10"/></svg>';

type Text = DevlineRunViz;
const tagName = (t: Text, k: Station) =>
  ({ route: t.map.route, design: t.map.design, sec: t.map.sec, bp: t.map.bp, deep: t.map.deep, off: t.map.perf, prep: t.map.prep })[k as string] ?? "";

/** Phone: the routes not taken hang below Route, with their names. */
function phoneLabels(t: Text) {
  const [rx, ry] = LAY.ph.map({ x: MX, y: Y.route });
  let s = '<g class="pl">';
  ([[t.map.quick, 22], [t.map.bug, 46]] as const).forEach(([name, d]) => {
    s += `<g class="sb"><path class="stub" pathLength="1" d="M${rx} ${ry} C${rx} ${ry + d * 0.6} ${rx + 3} ${ry + d} ${rx + 14} ${ry + d}"/><path class="stub-e" d="M${rx + 14} ${ry + d - 6}V${ry + d + 6}"/><text class="lb alt" x="${rx + 22}" y="${ry + d + 5}">${esc(name)}</text></g>`;
  });
  return s + "</g>";
}

function mapSVG(t: Text, uid: string, ph: boolean) {
  const lbl: [Station, string, string?][] = [
    ["idea", t.map.idea],
    ["brain", t.map.brain, t.map.approval],
    ["plan", t.map.plan, t.map.approval],
    ["impl", t.map.impl],
    ["join", t.map.reviewer],
    ["docs", t.map.docs],
    ["final", t.map.final, t.map.decide],
    ["end", t.map.merge],
  ];
  let s = `<g class="m"><g class="alt">`;
  STUB_D.forEach(([d, y], i) => {
    s += `<g class="sb"><path class="stub" pathLength="1" d="${d}"/><path class="stub-e" d="M${SX} ${y - 8}V${y + 8}"/><text class="lb alt" x="${SX + 12}" y="${y + 6}">${esc(i ? t.map.bug : t.map.quick)}</text></g>`;
  });
  s += `</g><g class="fan"><path pathLength="1" d="M${MX} ${Y.route + 14}V${FY(3) - 12}"/>`;
  s += [0, 1, 2, 3, 4]
    .map((i) => `<path pathLength="1"${i === 4 ? ' class="no"' : ""} d="M${MX} ${i === 4 ? FY(3) - 12 : FY(i) - 12}${i === 4 ? `V${FY(4) - 12}` : ""}Q${MX} ${FY(i)} ${MX + 12} ${FY(i)}H${LX - 12}"/>`)
    .join("");
  s += `</g><g class="pick"><path pathLength="1" d="M${MX} ${Y.route}V${Y.route + 95}"/></g>`;
  for (const k of OFFS) s += `<path class="trk sd off" data-r="${k}" d="${sideOnly(Y[k])}"/>`;
  s += `<path class="set" pathLength="1" d="${RIDE}"/>`;
  for (const d of LANES) s += `<path class="set ln" pathLength="1" d="${d}"/>`;
  s += `<path class="done" pathLength="1" d="${RIDE}"/>`;
  for (const d of LANES) s += `<path class="done ln" pathLength="1" d="${d}"/>`;
  // a blocking review sends one task back to its implementer: the loop on that lane
  s += `<path class="lp" pathLength="1" d="M${MX + 28} ${Y.join - 29} C${MX + 50} ${Y.join - 29} ${MX + 50} ${Y.fork + 29} ${MX + 28} ${Y.fork + 29}"/>`;
  // the final-gate sketch: a bug goes to the debugger, then back through implement and review
  const bd = `M${MX - 10} ${Y.final} C30 ${Y.final} 22 ${Y.final - 8} 22 ${Y.final - 30} V${Y.fork + 26} C22 ${Y.fork + 6} 32 ${Y.fork} 50 ${Y.fork}`;
  s += `<g class="back"><mask id="${uid}" maskUnits="userSpaceOnUse" x="-60" y="0" width="400" height="1000"><path class="bkm" pathLength="1" d="${bd}"/></mask><path mask="url(#${uid})" d="${bd}"/><path class="hd" d="M48 ${Y.fork - 7} L61 ${Y.fork} L48 ${Y.fork + 7} Z"/><text class="lb bk" transform="translate(12 ${(Y.fork + Y.final) / 2}) rotate(-90)" text-anchor="middle">${esc(t.map.back)}</text></g>`;
  for (const k of Object.keys(Y) as Station[]) {
    if (k === "fork" || k === "impl") continue;
    if (k === "join") {
      s += `<circle class="rvn" data-r="join" cx="${MX}" cy="${Y.join}" r="7"/>`;
      continue;
    }
    if (k === "end") {
      s += `<circle class="end main" data-r="end" cx="${MX}" cy="${Y.end}" r="9"/>`;
      continue;
    }
    if (GATES.includes(k)) s += `<circle class="gr" data-r="${k}" data-g="${k}" cx="${MX}" cy="${Y[k]}" r="14"/>`;
    const x = atX(k), y = Y[k], off = OFFS.includes(k);
    s += `<circle class="nd${off ? " no" : ""}" data-r="${k}" data-k="${k}" cx="${x}" cy="${y}" r="8"/>`;
    // on/off symbol in the station: a check once passed, a dash for a stage devline left out
    if (DET.includes(k)) {
      const rot = ph ? ` transform="rotate(90 ${x} ${y})"` : "";
      s += off
        ? `<path class="sym off" data-r="${k}"${rot} d="M${x - 4.5} ${y}h9"/>`
        : `<path class="sym on" data-r="${k}"${rot} d="M${x - 4} ${y + 0.5}l2.6 2.6 5-5.6"/>`;
    }
  }
  for (const [k, name, g] of lbl) {
    s += `<text class="lb${k === "join" ? " rv" : ""}" data-r="${k}" data-k="${k}" x="${LX}" y="${Y[k] + (g ? 0 : 6)}">${esc(name)}</text>`;
    if (g) s += `<text class="lb g" data-r="${k}" x="${LX}" y="${Y[k] + 20}">${esc(g)}</text>`;
  }
  return s + `</g>`;
}

const tagsHTML = (t: Text) =>
  `<div class="tags">` +
  TAGS.map(
    ({ k, off }) =>
      `<p class="tg${off ? " no" : ""}" data-k="${k}">${k === "route" ? "" : off ? DASH : CHECK}<b>${esc(tagName(t, k))}</b>${k === "route" ? `<em class="ch">${esc(t.map.full)}</em>` : ""}</p>`,
  ).join("") +
  `</div>`;

const GATE_SVG = '<svg viewBox="0 0 26 26"><circle pathLength="1" cx="13" cy="13" r="12" transform="rotate(-90 13 13)"/><path pathLength="1" d="M8 13.5l3.4 3.4L18.5 9.5"/></svg>';
const OK_SVG = '<svg viewBox="0 0 20 20" class="ok"><path d="M3.5 10.5l4 4 9-9"/></svg>';
const NO_SVG = '<svg viewBox="0 0 20 20" class="no"><path d="M5 5l10 10M15 5L5 15"/></svg>';
/** The lane whose review finds a blocking issue; it is also the right-hand lane on the map. */
const LOOP_ROW = 2;

/** The request with the words devline reads wrapped in <mark>. */
function marked(t: Text) {
  let html = esc(t.request);
  for (const m of t.marks) html = html.replace(esc(m), `<mark>${esc(m)}</mark>`);
  return html;
}

function cardHTML(t: Text) {
  const c = t.card, req = esc(t.request);
  const gate = `<div class="gt">${GATE_SVG}${esc(t.map.approval)}</div>`;
  const bars = (a: number, b: number) => `<span class="bar" style="width:${a}%"></span><span class="bar" style="width:${b}%"></span>`;
  const look = (cls: string, inner: string) => `<i class="lk ${cls}"><i class="hv"></i>${inner}<i class="pick"></i></i>`;
  return `<div class="card">
<div class="c c0"><p class="path">/devline</p><code class="req">${req}<i class="caret"></i></code><i class="sp"></i><span class="lbl">${esc(c.requestLabel)}</span></div>
<div class="c c1"><p class="path">/devline</p><code class="req">${marked(t)}</code><ul class="rc">${RC.map(({ k, off }) => `<li${off ? ' class="no"' : ""}>${off ? DASH : CHECK}<b>${esc(tagName(t, k))}</b></li>`).join("")}</ul></div>
<div class="c c2"><p class="path">.devline/brainstorm.md</p><code class="req ttl">${req}</code>${c.spec.map((h, i) => `<p class="sh">${esc(h)}</p>${bars([88, 94, 90][i] ?? 80, [62, 48, 66][i] ?? 60)}`).join("")}<i class="sp"></i>${gate}</div>
<div class="c c3"><p class="path">${esc(c.looks)}</p><div class="looks">${look("a", '<i style="width:90%"></i><i style="width:60%"></i><i style="width:75%"></i>')}${look("b", '<span><i style="width:100%"></i><i style="width:70%"></i><i style="width:85%"></i><i style="width:50%"></i></span>')}${look("c", '<i style="width:80%"></i><i style="width:95%"></i><i style="width:55%"></i>')}</div><p class="pk">${esc(c.pick)}</p><i class="sp"></i><div class="ms"><p class="path">docs/design-system/MASTER.md</p>${bars(86, 58)}</div></div>
<div class="c c4"><p class="path">.devline/plan.md</p><p class="wv">${esc(c.planNote)}</p><p class="wh">${esc(c.waves[0] ?? "")}</p>${c.tasks.map((x, i) => `<div class="prow"><b>${esc(x)}</b><code>${esc(c.files[i] ?? "")}</code></div>`).join("")}<p class="wh">${esc(c.waves[1] ?? "")}</p><div class="prow"><b>${esc(c.later)}</b><code>${esc(c.laterFile)}</code></div><i class="sp"></i>${gate}</div>
<div class="c c5"><p class="path">${esc(c.waves[0] ?? "")}</p><div class="who2"><span class="ag">${esc(c.implementer)}</span><span class="ag rva">${esc(c.reviewer)}</span></div>${c.tasks.map((x, i) => `<div class="lane"><i class="tint"></i><b>${esc(x)}</b><div class="steps"><span class="st s0">${NO_SVG}${esc(c.steps[0] ?? "")}</span><span class="st s1"><i class="fill"></i>${esc(c.steps[1] ?? "")}</span><span class="st s2">${OK_SVG}${esc(c.steps[2] ?? "")}</span><span class="st s3">${esc(c.steps[3] ?? "")}</span></div><span class="vd">${i === LOOP_ROW ? `${NO_SVG}<i class="re">\u21ba</i>` : ""}${OK_SVG}</span></div>`).join("")}<i class="sp"></i><p class="sum">${OK_SVG}${esc(c.summary)}</p></div>
<div class="c c6"><p class="path"><span class="ag">${esc(c.docsAgent)}</span></p><ul class="chk-l">${c.docFiles.map((x) => `<li>${OK_SVG}<code>${esc(x)}</code></li>`).join("")}</ul></div>
<div class="c c7"><p class="h5">${esc(c.branch)}</p><div class="cms">${c.tasks.map((x) => `<span>${esc(x)}</span>`).join("")}</div><ul class="chk-l">${c.checks.map((x, i) => `<li${i === 2 ? ' class="no"' : ""}>${i === 2 ? DASH : OK_SVG}<b>${esc(x)}</b></li>`).join("")}</ul></div>
<div class="c c8"><p class="path">${esc(t.map.final)}</p><code class="req">${req}</code><ul class="done">${c.done.map((x) => `<li>${OK_SVG}${esc(x)}</li>`).join("")}</ul><i class="sp"></i><div class="opts"><div class="o2">${c.options.map((o) => `<span>${esc(o)}</span>`).join("")}</div><p class="sb">${esc(c.bug)}</p><div class="dbg"><span class="ag dbga">${esc(c.debugger)}</span><span>${esc(c.rootCause)}</span></div></div></div>
<i class="beam"></i><i class="edge"></i><div class="stamp">${esc(c.stamp)}</div></div>`;
}

function gaugeHTML(t: Text, uid: string) {
  const m = t.model;
  return `<div class="gauge">${m.agents.map((a) => `<span class="who">${esc(a)}</span>`).join("")}
<svg class="ln2" viewBox="0 0 340 20" preserveAspectRatio="none"><defs><linearGradient id="${uid}w"><stop offset="0" stop-color="currentColor" stop-opacity=".15"/><stop offset="1" stop-color="currentColor" stop-opacity=".85"/></linearGradient></defs><polygon fill="url(#${uid}w)" points="0,9.5 340,0 340,20 0,10.5"/></svg><i class="mk"></i>
<p class="ends"><span><b>${esc(m.cheap)}</b>${esc(m.cheapNote)}</span><span><b>${esc(m.strong)}</b>${esc(m.strongNote)}</span></p></div>`;
}

// ---- timeline
const S: Station[] = ["idea", "route", "brain", "design", "plan", "join", "docs", "bp", "deep", "final"];
const CUR: Station[][] = [["idea"], ["route"], ["brain"], ["design"], ["plan"], ["impl", "join"], ["docs"], ["sec", "bp"], ["deep"], ["final"]];
export const LAST = S.length - 1;
/**
 * Each sequence in ms: length, token travel (it arrives at tok[1]), card handover (x) and height (h),
 * model slider (sl). OFF: ms the first sequence starts into its own timeline (it begins right away).
 */
const T = [
  { d: 3300, tok: [420, 850], x: [1000, 1200], h: [1250, 3250], sl: 0 },
  { d: 2450, tok: [350, 850], x: [1330, 1530], h: [1450, 2150], sl: 0 },
  { d: 2250, tok: [60, 520], x: [520, 880], h: [520, 880], sl: 1900 },
  { d: 2350, tok: [50, 500], x: [500, 880], h: [500, 880], sl: 2000 },
  { d: 4500, tok: [0, 300], x: [600, 950], h: [600, 950], sl: 1150 },
  { d: 1900, tok: [0, 400], x: [400, 780], h: [400, 780], sl: 600 },
  { d: 2100, tok: [0, 400], x: [200, 580], h: [200, 580], sl: 300 },
  { d: 2100, tok: [0, 500], x: [0, 0], h: [1500, 1750], sl: 800 },
  { d: 3600, tok: [0, 450], x: [1450, 1850], h: [1450, 1850], sl: 2700 },
];
const OFF = [350, 0, 0, 0, 0, 0, 0, 0, 0];
// implement: the grid starts at G; each task starts a little later (RO) and runs at its own pace (RS)
const G = 1500, RO = [0, 200, 100], RS = [1, 1.5, 1.15];
const rowT = (i: number) => {
  const o = G + RO[i], s = RS[i];
  return { o, s, R0: o + 760 * s };
};
const cl = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const eo = (t: number) => 1 - (1 - t) ** 3;
const ei = (t: number) => t * t * t;
const eio = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const K = (k: number, ms: number) => k + (ms - OFF[k]) / (T[k].d - OFF[k]);
const seg = (u: number, a: number, b: number, e = eo) => e(cl((u - a) / (b - a)));
const W = (u: number, k: number, a: number, b: number, e?: (t: number) => number) => seg(u, K(k, a), K(k, b), e);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const bump = (t: number) => Math.sin(Math.PI * t);
type Keys = [number, number][];
const track = (u: number, keys: Keys, e = eio) => {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++)
    if (u <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      return b[0] > a[0] ? lerp(a[1], b[1], e((u - a[0]) / (b[0] - a[0]))) : b[1];
    }
  return keys[keys.length - 1][1];
};
const at = (u: number): [number, number] => {
  const k = Math.min(LAST - 1, Math.floor(u));
  return [k, (u - k) * (T[k].d - OFF[k]) + OFF[k]];
};
/** The stage whose station the token has reached. */
export const stageAt = (u: number) => {
  const [k, ms] = at(u);
  return ms >= T[k].tok[1] ? k + 1 : k;
};

// the token (TOK) and the map drawn ahead of it (REV), as y along the route
const TOK: Keys = [], REV: Keys = [];
const r1 = rowT(1), rEnd1 = r1.R0 + 220;
for (let k = 0; k < LAST; k++) {
  const [a, b] = T[k].tok, y0 = Y[S[k]], y1 = Y[S[k + 1]];
  if (k === 4) {
    TOK.push([K(4, 0), Y.plan], [K(4, 300), Y.fork], [K(4, 600), Y.fork + 27], [K(4, r1.o), Y.fork + 27], [K(4, rEnd1), Y.join - 27], [K(4, G + 2650), Y.join - 27], [K(4, G + 2950), Y.join]);
    REV.push([K(4, 0), Y.plan], [K(4, 250), Y.fork], [K(4, 600), Y.join]);
  } else if (k === 6) {
    TOK.push([K(6, 0), Y.docs], [K(6, 400), Y.sec], [K(6, 650), Y.sec], [K(6, 1050), Y.bp]);
    REV.push([K(6, 0), Y.docs], [K(6, 300), Y.sec], [K(6, 600), Y.sec], [K(6, 950), Y.bp]);
  } else {
    TOK.push([K(k, a), y0], [K(k, b), y1]);
    REV.push([K(k, Math.max(0, a - 40)), y0], [K(k, b - 80), y1]);
  }
}
REV.push([K(8, 2350), Y.final], [K(8, 2650), Y.end]);
const LANE: Keys[] = [0, 2].map((i) => {
  const r = rowT(i), end = r.R0 + 220;
  // a lane waits at its foot while its review runs
  return [[K(4, 300), 0], [K(4, 600), 0.25], [K(4, r.o), 0.25], [K(4, end), 0.75], [K(4, G + 2650), 0.75], [K(4, G + 2950), 1]];
});

// ---- layouts: desktop draws the map at full size beside the card; the phone lays it on its side above the card;
// "cd" is the card and slider alone, for a design that draws the route itself (Flow's scene)
const PS = 0.8, CY = 118, MS = 1.6, ANCHOR = 400;
type Lay = "dk" | "ph" | "cd";
interface Layout { W: number; H: number; map: (p: { x: number; y: number }, pan?: number, s?: number) => [number, number]; card: number; ct: number; ch: number; gauge?: number }
const phMap: Layout["map"] = (p, pan = 0) => [pan + p.y * PS, CY - (p.x - MX) * PS];
const LAY: Record<Lay, Layout> = {
  dk: { W: 980, H: 850, map: (p, pan = 0, s = MS) => [s * p.x, s * p.y + pan], card: 510, ct: 30, ch: 400 },
  ph: { W: 380, H: 680, map: phMap, card: 0, ct: 184, ch: 330, gauge: 532 },
  cd: { W: 380, H: 500, map: phMap, card: 0, ct: 0, ch: 330, gauge: 348 },
};
const dkM = (oy: number, s = MS) => `matrix(${s} 0 0 ${s} 0 ${oy.toFixed(1)})`;
const phM = (pan: number) => `matrix(0 ${-PS} ${PS} 0 ${pan.toFixed(1)} ${CY + MX * PS})`;

type El = HTMLElement;
type SEl = SVGElement;
/** One implementer lane on the card: its four steps, the code bar, the reviewer's verdict. */
interface Lane { st: El[]; fill: El; pass: SEl; tint: El; ok: SEl; no: SEl | null; re: El | null }
interface Tag { el: El; k: Station; q: number | null; em: El | null }
interface Rig {
  lay: Lay; L: Layout; live: boolean; card: El; cs: El[]; req0: El; marks: El[]; req1: El; ttl: El; specH: El[]; specBars: El[]; gt2: El; g2: SEl[]; g4: SEl[];
  rc: El[]; looks: El[]; pick: El; pk: El; ms: El; prows: El[]; wv: El; wh: El[]; lanes: Lane[]; sum: El; docs: El[]; chk: El[]; beam: El; stamp: El; doneRows: El[]; o2: El[]; osb: El; dbg: El; lp: SEl;
  set: SEl; done: SEl; setL: SEl[]; doneL: SEl[]; rev: SEl[]; nd: SEl[]; gr: Record<string, SEl>; lb: SEl[]; stubs: SEl[]; sb: SEl[]; rpick: SEl[];
  back: SEl; bkm: SEl; bkh: SEl; bkt: SEl; mg: SEl; pl: SEl | null; tags: Tag[]; fan: SEl[]; tagsEl: El; tok: El[]; who: El[]; mk: El; ln2: SEl; gauge: El; m: SVGSVGElement; edge: El;
  CH?: Keys; f0?: number; fA?: number; fB?: number; ty: number; pan: number;
}

/** Path geometry, measured once per page in a hidden svg (the route never runs back up). */
interface Geo { rideP: SVGPathElement; laneP: SVGPathElement[]; RL: number; LL: number[]; lenAt: (y: number) => number; stationLen: Record<string, number>; remove: () => void }
function measureGeo(host: Element): Geo {
  const meas = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  meas.setAttribute("aria-hidden", "true");
  meas.setAttribute("style", "position:absolute;width:0;height:0;visibility:hidden");
  meas.innerHTML = `<path d="${RIDE}"/>` + LANES.map((d) => `<path d="${d}"/>`).join("");
  host.appendChild(meas);
  const remove = () => meas.remove();
  const [rideP, ...laneP] = [...meas.querySelectorAll("path")];
  const RL = rideP.getTotalLength(), LL = laneP.map((p) => p.getTotalLength());
  const ys: [number, number][] = [];
  for (let l = 0; l <= RL; l += 2) ys.push([rideP.getPointAtLength(l).y, l]);
  const lenAt = (y: number) => {
    let a = 0, b = ys.length - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (ys[m][0] < y) a = m;
      else b = m;
    }
    const [ya, la] = ys[a], [yb, lb] = ys[b];
    return yb === ya ? la : lerp(la, lb, cl((y - ya) / (yb - ya)));
  };
  const stationLen: Record<string, number> = {};
  for (const k in Y) stationLen[k] = lenAt(Y[k as Station]);
  return { rideP, laneP, RL, LL, lenAt, stationLen, remove };
}

let UID = 0;
function buildBox(box: El, lay: Lay, t: Text, gslot: El | null): Rig {
  const L = LAY[lay], uid = `dlr${++UID}`;
  box.classList.remove("dk", "ph", "cd");
  box.classList.add("box", lay);
  box.style.width = L.W + "px";
  box.style.height = L.H + "px";
  // No mask (CSS mask-image or svg <mask>) over the map: the map pans far past its box, and Chrome's GPU
  // raster under SwiftShader painted a masked map's overflow a second time, wrapped round into the box
  // (the "ghost" copy lower down). The svg's own clip keeps the map to its box; the tags fade by opacity.
  box.innerHTML = `<svg class="map" width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}">${mapSVG(t, uid, lay !== "dk")}${lay !== "dk" ? phoneLabels(t) : ""}</svg>` + tagsHTML(t) + cardHTML(t);
  const q = <E extends Element = El>(s: string, from: ParentNode = box) => from.querySelector(s) as E;
  const qa = <E extends Element = El>(s: string, from: ParentNode = box) => [...from.querySelectorAll(s)] as E[];
  q(".m").setAttribute("transform", lay === "dk" ? dkM(0) : phM(0));
  box.insertAdjacentHTML("beforeend", `<i class="tok"></i><i class="tok s"></i><i class="tok s"></i>`);
  const gbox = lay === "dk" && gslot ? gslot : box;
  if (gslot) gslot.innerHTML = "";
  gbox.insertAdjacentHTML("beforeend", gaugeHTML(t, uid));
  const cd = q(".card");
  cd.style.left = L.card + "px";
  cd.style.top = L.ct + "px";
  cd.style.height = L.ch + "px";
  if (L.gauge) q(".gauge").style.top = L.gauge + "px";
  return {
    lay, L, live: false, card: cd, cs: qa(".card>.c"),
    req0: q(".c0 .req"), marks: qa(".c1 .req mark"), req1: q(".c1 .req"), ttl: q(".c2 .ttl"), specH: qa(".c2 .sh"), specBars: qa(".c2 .bar"), gt2: q(".c2 .gt"),
    g2: qa(".c2 .gt circle, .c2 .gt path"), g4: qa(".c4 .gt circle, .c4 .gt path"),
    rc: qa(".rc li"), looks: qa(".lk"), pick: q(".lk.b .pick"), pk: q(".pk"), ms: q(".ms"), prows: qa(".prow"), wv: q(".wv"), wh: qa(".c4 .wh"),
    lanes: qa(".lane").map((ln) => ({ st: qa(".st", ln), fill: q(".fill", ln), pass: q(".s2 svg", ln), tint: q(".tint", ln), ok: q(".vd .ok", ln), no: q(".vd .no", ln), re: q(".vd .re", ln) })),
    sum: q(".sum"), docs: qa(".c6 li"), chk: qa(".c7 li"), beam: q(".beam"), stamp: q(".stamp"), doneRows: qa(".c8 .done li"), o2: qa(".opts .o2 span"), osb: q(".opts .sb"), dbg: q(".dbg"), lp: q(".lp"),
    set: q(".set:not(.ln)"), done: q(".done:not(.ln)"), setL: qa(".set.ln"), doneL: qa(".done.ln"),
    rev: qa("[data-r]"), nd: qa(".nd"), gr: Object.fromEntries(qa<SEl>(".gr").map((g) => [g.dataset.g!, g])), lb: qa(".lb[data-k]"), stubs: qa(".map .stub"), sb: qa(".map .sb"), rpick: qa(".pick path"),
    back: q(".back"), bkm: q(".bkm"), bkh: q(".back .hd"), bkt: q(".back text"), mg: q(".m"), pl: q(".pl"),
    tags: qa(".tg").map((el) => {
      const tg = TAGS.find((x) => x.k === el.dataset.k)!;
      return { el, k: tg.k, q: tg.q, em: el.querySelector<El>(".ch") };
    }),
    fan: qa(".fan path"), tagsEl: q(".tags"), tok: qa(".tok"),
    who: qa(".who", gbox), mk: q(".mk", gbox), ln2: q(".ln2", gbox), gauge: q(".gauge", gbox), m: q(".map"), edge: q(".edge"), ty: 0, pan: 0,
  } as unknown as Rig;
}

const opn = (el: Element, o: number) => {
  (el as El).style.opacity = o < 0.004 ? "0" : o > 0.996 ? "1" : o.toFixed(3);
};
const draw = (el: Element, t: number) => {
  const s = (el as El).style;
  s.strokeDashoffset = (1 - t).toFixed(4);
  s.visibility = t < 0.002 ? "hidden" : "";
};
const mask = (el: Element, m: string) => {
  const s = (el as El).style;
  s.webkitMaskImage = s.maskImage = m;
};
const rise = (el: Element, t: number, d = 8) => {
  opn(el, t);
  (el as El).style.transform = t < 1 ? `translateY(${((1 - t) * d).toFixed(1)}px)` : "";
};
// one content hands over to the next: an edge runs down the card, new content above it, old below
const wipe = (a: El, b: El, t: number) => {
  opn(a, t < 1 ? 1 : 0);
  opn(b, t > 0 ? 1 : 0);
  if (t <= 0 || t >= 1) {
    mask(a, "");
    mask(b, "");
    return;
  }
  const y = lerp(-30, a.offsetHeight + 30, t);
  mask(a, `linear-gradient(#0000 ${(y + 2).toFixed(1)}px,#000 ${(y + 12).toFixed(1)}px)`);
  mask(b, `linear-gradient(#000 ${(y - 12).toFixed(1)}px,#0000 ${(y - 2).toFixed(1)}px)`);
  return y;
};
// the first two handovers keep the request in place, so they are a plain crossfade
const chain = (els: El[], ws: number[]) => {
  let j = 0;
  while (j < ws.length && ws[j] >= 1) j++;
  els.forEach((el, k) => {
    if (k !== j && k !== j + 1) {
      opn(el, 0);
      mask(el, "");
    }
  });
  if (j >= ws.length) {
    opn(els[j], 1);
    mask(els[j], "");
    return;
  }
  if (j < 2) {
    opn(els[j], 1 - ws[j]);
    opn(els[j + 1], ws[j]);
    mask(els[j], "");
    mask(els[j + 1], "");
    return;
  }
  return wipe(els[j], els[j + 1], ws[j]);
};

function pose(R: Rig, u: number, g: Geo) {
  const ph = R.lay !== "dk";
  const r = stageAt(u), curKeys = CUR[r];

  // ---- the card: request → request read → spec → design → plan → worktrees → feature branch → final gate
  const X = (k: number) => W(u, k, T[k].x[0], T[k].x[1], eio);
  const ey = chain(R.cs, [X(0), X(1), X(2), X(3), X(4), X(5), X(6), X(8)]);
  const ch = R.CH ? track(u, R.CH) : R.L.ch;
  R.card.style.height = ch.toFixed(1) + "px";
  // phone: the model slider sits under the card, whatever its height
  if (R.L.gauge) R.gauge.style.top = Math.max(R.L.gauge, R.L.ct + ch + 16).toFixed(1) + "px";
  const eIn = ey !== undefined && ey > 4 && ey < ch - 6;
  opn(R.edge, eIn ? 1 : 0);
  if (eIn) R.edge.style.transform = `translateY(${ey.toFixed(1)}px)`;

  // ---- 0 → Route: devline reads the request; the words it reads light up
  const readDone = W(u, 1, 850, 1050, ei);
  [[1250, 1500], [1650, 1900]].forEach(([a, b], k) => R.marks[k]?.style.setProperty("--h", (W(u, 0, a, b) * (1 - readDone)).toFixed(3)));
  // the request shrinks into the spec's title, then the card hands over to the spec
  const t0 = W(u, 0, 850, 1050, eio);
  if (R.f0 && R.fA && R.f0 !== R.fA && t0 > 0) R.req0.style.fontSize = lerp(R.f0, R.fA, t0).toFixed(2) + "px";
  else R.req0.style.fontSize = "";
  const tt = W(u, 1, 1050, 1350, eio);
  if (R.fA && R.fB && tt > 0) {
    R.req1.style.fontSize = lerp(R.fA, R.fB, tt).toFixed(2) + "px";
    R.req1.style.marginTop = lerp(14, 10, tt).toFixed(1) + "px";
  } else R.req1.style.fontSize = R.req1.style.marginTop = "";

  // routes not taken draw out grey at Route, dim once devline has decided, and stay on the map
  R.sb.forEach((el, i) => {
    const o = 100 * (i % 2), a = W(u, 0, 1750 + o, 2050 + o), dim = W(u, 0, 2050 + o, 2300 + o);
    draw(R.stubs[i], a);
    opn(el, cl(a * 2) * (1 - 0.5 * dim));
  });

  // ---- the map draws in up to where the run is, the token follows
  const rv = track(u, REV);
  draw(R.set, g.lenAt(rv) / g.RL);
  R.setL.forEach((p) => draw(p, cl((rv - Y.fork) / (Y.join - Y.fork))));
  const ty = track(u, TOK), len = g.lenAt(ty);
  draw(R.done, len / g.RL);
  const lp = LANE.map((k) => track(u, k));
  R.doneL.forEach((p, i) => draw(p, lp[i]));
  const pt = g.rideP.getPointAtLength(len);
  let pan: number, mS = MS, zo = 0, fadeH = 0;
  if (!ph) {
    // desktop: the camera follows the token; at the final gate it pulls back to show the whole graph
    const fitS = (R.L.H - 30) / (Y.end + 10);
    const follow = Math.max(R.L.H - 36 - Y.end * MS, ANCHOR - pt.y * MS);
    zo = R.live ? W(u, 8, 650, 1150, eio) : 1;
    mS = lerp(MS, fitS, zo);
    pan = lerp(follow, 12, zo);
    R.mg.setAttribute("transform", dkM(pan, mS));
    (R.m.parentNode as El).style.setProperty("--ms", mS.toFixed(3));
    // live: the tags fade out at the top edge as the map scrolls up; the fade closes as the camera pulls back
    fadeH = R.live ? 72 * (1 - zo) : 0;
  } else {
    pan = Math.min(24, Math.max(R.L.W - 40 - Y.end * PS, 130 - pt.y * PS));
    R.mg.setAttribute("transform", phM(pan));
    if (R.pl) {
      R.pl.setAttribute("transform", `translate(${pan.toFixed(1)} 0)`);
      // panned out of the strip: hide it, so clipped text is not left in the page
      R.pl.style.display = Y.route * PS + pan + 20 < 0 ? "none" : "";
    }
  }
  // the stations, their labels and the tags fade out at the top edge of the desktop map (by opacity: see buildBox)
  const edge = (y: number) => (fadeH > 0 ? cl(y / fadeH) : 1);
  R.rev.forEach((el) => opn(el, cl((rv - revY(el.dataset.r!) + 16) / 14) * edge(mS * revY(el.dataset.r!) + pan)));
  const [bx, by] = R.L.map(pt, pan, mS);
  R.ty = by;
  R.tok[0].style.transform = `translate(${bx.toFixed(1)}px,${by.toFixed(1)}px)`;
  opn(R.tok[0], 1);
  const lo = W(u, 4, 300, 420) * (1 - W(u, 4, G + 2850, G + 2980, ei));
  R.tok.slice(1).forEach((el, i) => {
    const [x, y] = R.L.map(g.laneP[i].getPointAtLength(g.LL[i] * lp[i]), pan, mS);
    el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    opn(el, lo);
  });

  // stations: lit once the token reaches them, the current one bold
  R.nd.forEach((n) => {
    const k = n.dataset.k as Station, no = OFFS.includes(k);
    n.classList.toggle("on", !no);
    n.classList.toggle("pass", !no && len >= g.stationLen[k] - 1);
  });
  R.lb.forEach((n) => n.classList.toggle("cur", curKeys.includes(n.dataset.k as Station)));
  // the manual approval gates and the final gate: the ring pulses once while the run waits for you
  ([["brain", 1, 2050], ["plan", 3, 1750], ["final", 8, 450]] as const).forEach(([gk, k, a]) => {
    const p = bump(W(u, k, a, a + 350, (x) => x));
    R.gr[gk].style.transform = p ? `scale(${(1 + 0.45 * p).toFixed(3)})` : "";
    R.gr[gk].style.strokeWidth = p ? (2.5 + 2 * p).toFixed(2) : "";
  });

  // devline's decisions: the stages it switches on (✓) or leaves out (–) fan out below Route; the fan folds
  // back into Route when the run moves on, and each comes back beside its station when the map draws it
  const fanGone = W(u, 1, 0, 350, ei);
  const fanT = (q: number): [number, number] => (q < 4 ? [2100 + 130 * q, 2350 + 130 * q] : [2600, 2850]);
  const trunk = W(u, 0, 2000, 2250) * (1 - fanGone);
  draw(R.fan[0], trunk);
  R.rpick.forEach((p) => draw(p, trunk));
  R.fan.slice(1).forEach((p, q) => draw(p, W(u, 0, ...fanT(q)) * (1 - fanGone)));
  // the card-only layout lists the same decisions on the card, in the same order and time
  R.rc.forEach((el, i) => rise(el, W(u, 0, ...fanT(Math.min(4, RC[i].q ?? 4))), 6));
  R.tags.forEach((tg) => {
    const sy = Y[tg.k], land = cl((rv - sy + 16) / 14);
    tg.el.classList.toggle("cur", curKeys.includes(tg.k));
    if (tg.q === -1 || tg.q === null) {
      const [x, y] = R.L.map({ x: LX, y: sy }, pan, mS);
      opn(tg.el, ph ? 0 : land * edge(y));
      if (tg.em) opn(tg.em, W(u, 0, 1650, 1900));
      tg.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      return;
    }
    const atFan = land <= 0, f = W(u, 0, ...fanT(tg.q));
    const [x, y] = R.L.map({ x: LX, y: atFan ? FY(tg.q) : sy }, pan, mS);
    // the phone shows only the symbol at the fan; at the station the node carries it
    opn(tg.el, (atFan ? f * (1 - fanGone) : ph ? 0 : land) * edge(y));
    tg.el.style.transform = `translate(${x.toFixed(1)}px,${(y + (atFan ? (1 - f) * 10 - fanGone * 16 : 0)).toFixed(1)}px)`;
  });

  // ---- Route → Brainstorm: the spec is written section by section, then the gate
  R.specH.forEach((h, i) => {
    const s = 1550 + 170 * i;
    rise(h, W(u, 1, s, s + 220), 6);
    R.specBars[2 * i].style.transform = `scaleX(${W(u, 1, s + 80, s + 330).toFixed(3)})`;
    R.specBars[2 * i + 1].style.transform = `scaleX(${W(u, 1, s + 160, s + 410).toFixed(3)})`;
  });
  rise(R.gt2, W(u, 1, 1950, 2150), 6);
  draw(R.g2[0], W(u, 1, 2100, 2300, eio));
  draw(R.g2[1], W(u, 1, 2250, 2400));

  // ---- → Design: three looks slide in, one is picked, MASTER.md is written under it
  const pick = W(u, 2, 1450, 1650);
  R.looks.forEach((el, k) => {
    const o = W(u, 2, 920 + 120 * k, 1220 + 120 * k);
    opn(el, o * (k === 1 ? 1 : 1 - 0.6 * pick));
    el.style.transform = o < 1 ? `translateX(${((1 - o) * 22).toFixed(1)}px)` : "";
  });
  opn(R.pick, pick);
  opn(R.pk, W(u, 2, 1500, 1700));
  rise(R.ms, W(u, 2, 1650, 1900), 10);

  // ---- → Plan: the waves and their tasks appear one by one, each with the file it owns, then the gate
  rise(R.wv, W(u, 3, 950, 1150), 6);
  R.wh.forEach((el, i) => rise(el, W(u, 3, 1000 + 600 * i, 1200 + 600 * i), 6));
  R.prows.forEach((el, i) => rise(el, W(u, 3, 1050 + 150 * i + (i > 2 ? 150 : 0), 1350 + 150 * i + (i > 2 ? 150 : 0)), 8));
  draw(R.g4[0], W(u, 3, 1800, 2000, eio));
  draw(R.g4[1], W(u, 3, 1950, 2100));

  // ---- → Implement: one implementer per lane, test first: the test fails, the code is written, the test passes,
  // the work is merged, then a separate reviewer gives its verdict; one review is blocking and sends its lane back
  R.lanes.forEach((ln, i) => {
    const { o, s: sp, R0 } = rowT(i), I = (a: number, b: number, e?: (t: number) => number) => W(u, 4, o + a * sp, o + b * sp, e);
    const t0 = I(0, 150), code = I(150, 450, eio), pass = I(450, 570), mg = I(560, 720);
    let fill = code, passed = pass;
    opn(ln.ok, i === LOOP_ROW ? W(u, 4, R0 + 1000, R0 + 1220) : W(u, 4, R0, R0 + 220));
    if (i === LOOP_ROW && ln.no && ln.re) {
      const no = W(u, 4, R0, R0 + 220) * (1 - W(u, 4, R0 + 1000, R0 + 1150, ei));
      const drop = W(u, 4, R0 + 400, R0 + 520), refill = W(u, 4, R0 + 520, R0 + 860, eio), again = W(u, 4, R0 + 860, R0 + 960);
      opn(ln.no, no);
      // the loop mark stays: this lane went round once
      opn(ln.re, W(u, 4, R0 + 220, R0 + 400));
      opn(ln.tint, no);
      fill = code * (1 - drop * (1 - refill));
      passed = pass * (1 - drop * (1 - again));
      draw(R.lp, W(u, 4, R0 + 200, R0 + 520, eio));
    }
    opn(ln.st[0], 0.3 + 0.7 * t0);
    opn(ln.st[1], 0.3 + 0.7 * cl(code * 3));
    opn(ln.st[2], 0.3 + 0.7 * passed);
    opn(ln.pass, passed);
    opn(ln.st[3], 0.3 + 0.7 * mg);
    ln.fill.style.transform = `scaleX(${fill.toFixed(3)})`;
  });
  rise(R.sum, W(u, 4, G + 2450, G + 2700), 6);

  // ---- → Docs: the docs-keeper ticks off the files it updated
  R.docs.forEach((li, k) => rise(li, W(u, 5, 900 + 250 * k, 1150 + 250 * k), 8));

  // ---- → Reviews: the extra reviews pass, the one the route left out stays off; → Deep review completes the branch
  const ck = [W(u, 6, 550, 800), W(u, 6, 1150, 1400), W(u, 6, 1450, 1700), W(u, 7, 1550, 1800)];
  R.chk.forEach((li, k) => rise(li, ck[k] ?? 0, 8));
  const bt = cl((u - K(7, 1200)) / (K(7, 1800) - K(7, 1200)));
  opn(R.beam, bt > 0 && bt < 1 ? Math.min(1, bt * 8, (1 - bt) * 8) : 0);
  R.beam.style.transform = `translateY(${lerp(40, ch - 4, eio(bt)).toFixed(1)}px)`;
  const st = W(u, 7, 1800, 2050);
  opn(R.stamp, st * (1 - W(u, 8, 1450, 1600, ei)));
  R.stamp.style.transform = `translate(${(R.card.offsetWidth - 150).toFixed(0)}px,-14px) rotate(-6deg) scale(${lerp(1.5, 1, st).toFixed(3)})`;

  // ---- → Final gate: devline presents the result and the options; then a sketch of one iteration:
  // a bug is found, the debugger finds the root cause, and the run goes back through implement and review
  R.doneRows.forEach((el, i) => rise(el, W(u, 8, 1700 + 150 * i, 1950 + 150 * i), 6));
  R.o2.forEach((el, i) => rise(el, W(u, 8, 1950 + 80 * i, 2200 + 80 * i), 8));
  rise(R.osb, W(u, 8, 2250, 2450), 8);
  const pickBug = W(u, 8, 2500, 2750);
  R.osb.style.borderColor = pickBug ? `color-mix(in srgb,var(--dl-red) ${(pickBug * 100).toFixed(0)}%,var(--dl-line))` : "";
  R.osb.style.color = pickBug > 0.5 ? "var(--dl-red)" : "";
  rise(R.dbg, W(u, 8, 2700, 2950), 8);
  const bk = W(u, 8, 2900, 3400, eio);
  opn(R.back, bk > 0 ? 1 : 0);
  draw(R.bkm, bk);
  opn(R.bkh, W(u, 8, 3300, 3450));
  opn(R.bkt, W(u, 8, 3150, 3450));

  // ---- model: the marker sits where the current agent's model is on the cost-quality wedge; one name at a time
  const sl = (k: number) => T[k].sl;
  const mo = W(u, 2, sl(2), sl(2) + 250);
  const mx = track(u, [[K(4, sl(4)), 340], [K(4, sl(4) + 400), 40], [K(7, sl(7)), 40], [K(7, sl(7) + 400), 340]]);
  const GW = R.gauge.offsetWidth || 380, gx = 20 + (mx * (GW - 40)) / 340;
  opn(R.mk, mo);
  R.mk.style.transform = `translateX(${gx.toFixed(1)}px)`;
  (R.ln2 as unknown as El).style.opacity = (0.45 + 0.55 * mo).toFixed(3);
  R.who.forEach((el, j) => {
    const k = j + 2;
    const tin = j === 0 ? W(u, 2, sl(2), sl(2) + 250) : W(u, k, sl(k) + 150, sl(k) + 350);
    const tout = j === R.who.length - 1 ? 0 : W(u, k + 1, sl(k + 1), sl(k + 1) + 150, ei);
    opn(el, tin * (1 - tout));
    const w = el.offsetWidth || 120;
    el.style.transform = `translateX(${Math.max(0, Math.min(GW - w, gx - w / 2)).toFixed(1)}px)`;
  });
}

/** Scales the drawing to fit its container; desktop keeps it against the caption, the phone at the top. */
function fit(container: El, b: El, L: Layout, ph: boolean, LH = L.H) {
  const w = container.clientWidth, h = container.clientHeight || LH * (w / L.W);
  const s = Math.min(w / L.W, h / LH);
  const x = ph ? (w - L.W * s) / 2 : 0, y = ph ? 0 : (h - L.H * s) / 2;
  b.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(4)})`;
  b.style.setProperty("--sc", s.toFixed(4));
  return { s, x, y };
}

/**
 * Fits the drawing and sizes the cards. A tall card (the implement lanes wrap on a narrow phone) can
 * reach past the layout's height with the slider under it; then the drawing is fitted to what it
 * really needs, so the card and slider stay on screen at every stage.
 */
function fitTo(container: El, R: Rig, ph: boolean) {
  const box = R.card.parentElement as El;
  let H = R.L.H, f = fit(container, box, R.L, ph, H);
  // the text sizes follow the scale (--sc), so a refit changes the cards' heights a little; a few rounds settle it
  for (let i = 0; i < 3; i++) {
    sizeCards(R);
    const need = R.L.ct + Math.max(...R.CH!.map((k) => k[1])) + (R.L.gauge ? 16 + R.gauge.offsetHeight : 12) + 8;
    if (need <= H) break;
    H = need;
    f = fit(container, box, R.L, ph, H);
  }
  return f;
}

/** The card's height at each rest, from its content; it moves while the content hands over. */
function sizeCards(R: Rig) {
  R.req1.style.fontSize = R.req1.style.marginTop = R.req0.style.fontSize = "";
  const hs = R.cs.map((c) => {
    c.style.bottom = "auto";
    const h = c.offsetHeight;
    c.style.bottom = "";
    return h;
  });
  const lastRow = R.chk[R.chk.length - 1];
  const H = [...hs.slice(0, 7), hs[7] - lastRow.offsetHeight, hs[7], hs[8]].map((h) => Math.max(140, Math.ceil(h)));
  R.CH = T.flatMap((t, k): Keys => [[K(k, t.h[0]), H[k]], [K(k, t.h[1]), H[k + 1]]]);
  // Route → Brainstorm: the card closes up under the request once the reading ends, then grows line by line as the spec is written
  R.cs[2].style.bottom = "auto";
  const bot = (el: El) => Math.ceil(el.offsetTop + el.offsetHeight + 24);
  const grow = (k: number, h0: number, steps: [number, number, El][]) => {
    const ks: Keys = [];
    let h = h0;
    for (const [a, b, el] of steps) {
      const n = Math.max(h, bot(el));
      ks.push([K(k, a), h], [K(k, b), n]);
      h = n;
    }
    return ks;
  };
  const hT = bot(R.ttl);
  const k1: Keys = [[K(1, 850), H[1]], [K(1, 1100), hT], ...grow(1, hT, [0, 1, 2].map((i): [number, number, El] => [1550 + 170 * i, 1800 + 170 * i, R.specBars[2 * i + 1]])), [K(1, 1950), 0], [K(1, 2150), H[2]]];
  k1[k1.length - 2][1] = k1[k1.length - 3][1];
  R.cs[2].style.bottom = "";
  R.CH.splice(2, 2, ...k1);
  R.f0 = parseFloat(getComputedStyle(R.req0).fontSize);
  R.fA = parseFloat(getComputedStyle(R.req1).fontSize);
  R.fB = parseFloat(getComputedStyle(R.ttl).fontSize);
}

/** The stages shown in still mode, as key frames. */
export const STILLS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Builds the scene into `root` (the server-rendered figure) and wires scroll, keys and touch.
 * Returns the cleanup.
 */
export function mountDevlineRun(root: El, text: Text): () => void {
  const q = <E extends Element = El>(s: string) => root.querySelector(s) as E;
  const scene = q(".dlr-scene"), pin = q(".dlr-pin"), obj = q(".dlr-obj"), box = q(".dlr-box"), gslot = q(".dlr-gslot"), capEl = q(".dlr-cap");
  const items = [...root.querySelectorAll<El>(".dlr-stages > li")];
  const ticks = [...root.querySelectorAll<El>(".dlr-rail > li")];
  const shots = [...root.querySelectorAll<El>(".dlr-shot")];
  const live = matchMedia(LIVE_QUERY), reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const g = measureGeo(root);
  const gesture = createGesture();
  let R: Rig | null = null, lay: Lay | "" = "", mode: "live" | "still" | "" = "";
  let top0 = 0, span = 1, step = 1, target = 0, cur = 0, raf = 0, last = 0;
  let fitted = { s: 1, x: 0, y: 0 }, objTop = 0, capOff: number[] = [], capH: number[] = [], capMax = 0;
  let auto = 0, autoRaf = 0, ty0 = 0, tUsed = false, shown = -1;
  const stills: { r: Rig; u: number; el: El }[] = [];

  /** The big caption: the stage the token has reached, beside the token; the rail marks where the run is. */
  function caption(u: number) {
    const r = stageAt(u);
    for (let k = 0; k < items.length; k++) {
      // the old caption fades as the token arrives, the new one rises once it is there
      const tin = k ? W(u, k - 1, T[k - 1].tok[1], T[k - 1].tok[1] + 200) : 1;
      const tout = k < LAST ? W(u, k, T[k].tok[1] - 140, T[k].tok[1], ei) : 0;
      const o = tin * (1 - tout);
      opn(items[k], o);
      items[k].style.transform = o > 0 && o < 1 ? `translateY(${((1 - tin) * 12 - tout * 10).toFixed(1)}px)` : "";
      items[k].toggleAttribute("data-on", o > 0);
    }
    if (r !== shown) {
      shown = r;
      ticks.forEach((t, k) => t.toggleAttribute("data-on", k <= r));
      ticks.forEach((t, k) => t.toggleAttribute("data-cur", k === r));
      // the token pulses once as it reaches a stage, then rests: an endless pulse over the map
      // kept a repaint going there, and under SwiftShader's GPU raster that left a ghost copy of the map
      const tk = R?.tok[0];
      if (tk) {
        tk.classList.remove("pl");
        void tk.offsetWidth;
        tk.classList.add("pl");
      }
    }
    if (R && R.lay === "dk") {
      // the name's first line sits level with the token, kept clear of the model slider below
      const y = objTop + fitted.y + R.ty * fitted.s - (capOff[r] ?? 0);
      const max = capMax - (capH[r] ?? 0);
      capEl.style.transform = `translateY(${Math.max(0, Math.min(max, y)).toFixed(1)}px)`;
    } else capEl.style.transform = "";
  }

  function render(u: number) {
    if (!R) return;
    pose(R, u, g);
    caption(u);
  }

  function measure() {
    if (!R) return;
    const ph = R.lay !== "dk";
    fitted = fitTo(obj, R, ph);
    capEl.style.transform = "";
    const col = capEl.parentElement!.getBoundingClientRect(), cap = capEl.getBoundingClientRect();
    objTop = obj.getBoundingClientRect().top - col.top;
    capOff = items.map((li) => {
      const nm = li.querySelector<El>(".nm")!;
      return nm.getBoundingClientRect().top - cap.top + parseFloat(getComputedStyle(nm).fontSize) * 0.55;
    });
    capH = items.map((li) => li.getBoundingClientRect().bottom - cap.top);
    capMax = gslot.getBoundingClientRect().top - col.top - 24;
    pinTop = parseFloat(getComputedStyle(pin).top) || 0;
    place();
    span = Math.max(1, scene.offsetHeight - pin.offsetHeight);
    step = span / LAST;
    // a layout change shows the stage the scroll position belongs to, at rest
    const k = stageFromScroll(scrollY, top0, step, LAST);
    target = cur = k < 0 ? (scrollY < top0 ? 0 : LAST) : k;
    render(cur);
  }

  // forward: the sequence plays at its own pace; with a stage queued, the earlier one plays fast.
  // back: a short reverse, about 300 ms a stage
  function tick(now: number) {
    const dt = Math.min(64, now - (last || now));
    last = now;
    if (cur < target) {
      const dur = (k: number) => T[k].d - OFF[k];
      let k = Math.floor(cur), rem = (k + 1 - cur) * dur(k);
      for (let j = k + 1; j < target; j++) rem += dur(j);
      let budget = dt * (target - cur > 1 + 1e-6 ? Math.max(4, (rem - dur(target - 1)) / 600) : 1);
      while (budget > 0 && cur < target) {
        k = Math.min(target - 1, Math.floor(cur + 1e-9));
        const need = (k + 1 - cur) * dur(k);
        if (budget >= need) {
          cur = k + 1;
          budget -= need;
          if (target - cur <= 1) budget = Math.min(budget, 0);
        } else {
          cur += budget / dur(k);
          budget = 0;
        }
      }
    } else if (cur > target) cur = Math.max(target, cur - dt * Math.max(1 / 300, (cur - target) / 600));
    render(cur);
    raf = cur === target ? 0 : requestAnimationFrame(tick);
    if (!raf) last = 0;
  }
  const go = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  /** Eases the page to the stage's place so the scrollbar stays honest. */
  function scrollToStage(k: number) {
    const from = scrollY, to = top0 + k * step, t0 = performance.now(), d = reduce.matches ? 0 : 420;
    cancelAnimationFrame(autoRaf);
    auto++;
    const frame = (now: number) => {
      const p = d ? Math.min(1, (now - t0) / d) : 1;
      window.scrollTo({ top: lerp(from, to, eio(p)), behavior: "instant" });
      if (p < 1) autoRaf = requestAnimationFrame(frame);
      // the last scroll event of this move arrives after the frame; let it pass first
      else autoRaf = requestAnimationFrame(() => (auto = Math.max(0, auto - 1)));
    };
    autoRaf = requestAnimationFrame(frame);
  }
  // The scene's place in the page from layout offsets: an ancestor's transform (Type scales the room
  // while its flight lands) moves the drawn box, not the scroll position at which the scene pins.
  // Sticky offsets of ancestors are part of offsetTop, so it is read fresh.
  let pinTop = 0;
  const place = () => {
    let y = 0;
    for (let e: El | null = scene; e; e = e.offsetParent as El | null) y += e.offsetTop + (e === scene ? 0 : e.clientTop);
    return (top0 = y - pinTop);
  };
  const pinned = () => mode === "live" && place() <= scrollY + 2 && scrollY <= top0 + span + 2;
  function stepBy(dir: number) {
    const t = queueStep(target, dir, cur, LAST);
    if (t === target) return;
    target = t;
    scrollToStage(t);
    go();
  }

  const onWheel = (e: WheelEvent) => {
    if (mode !== "live" || e.ctrlKey) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    const dir = wheelStep(gesture, e.timeStamp, dy);
    if (!dy || !pinned() || releases(target, dy, LAST)) return;
    e.preventDefault();
    if (dir) stepBy(dir);
  };
  const KEYS: Record<string, number> = { PageDown: 1, ArrowDown: 1, PageUp: -1, ArrowUp: -1 };
  const onKey = (e: KeyboardEvent) => {
    if (mode !== "live" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = e.key === " " ? (e.shiftKey ? -1 : 1) : KEYS[e.key];
    if (!dir) return;
    const el = e.target as Element | null;
    if (el?.closest?.("input,textarea,select,button,[contenteditable],[role=listbox],[role=menu],[role=slider]")) return;
    if (!pinned() || releases(target, dir, LAST)) return;
    e.preventDefault();
    if (!e.repeat) stepBy(dir);
  };
  const onTouchStart = (e: TouchEvent) => {
    ty0 = e.touches[0]?.clientY ?? 0;
    tUsed = false;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (mode !== "live" || e.touches.length !== 1) return;
    const dy = ty0 - e.touches[0].clientY;
    if (!pinned() || releases(target, dy, LAST)) return;
    if (e.cancelable) e.preventDefault();
    if (!tUsed && Math.abs(dy) > 24) {
      tUsed = true;
      stepBy(dy > 0 ? 1 : -1);
    }
  };
  // any other scroll (scrollbar drag, anchor jump, find in page, a restored position) lands on that stage's final pose
  const onScroll = () => {
    if (mode !== "live" || auto || !R) return;
    let k = stageFromScroll(scrollY, place(), step, LAST);
    if (k < 0) k = scrollY < top0 ? 0 : LAST;
    if (k === target && (cur === target || raf)) return;
    cancelAnimationFrame(raf);
    raf = 0;
    target = cur = k;
    render(cur);
  };

  function buildStills() {
    if (stills.length) return;
    shots.forEach((el) => {
      const b = document.createElement("div");
      el.appendChild(b);
      const r = buildBox(b, "ph", text, null);
      stills.push({ r, u: Number(el.dataset.u), el });
    });
  }
  function fitStills() {
    for (const s of stills) {
      const k = s.el.clientWidth / LAY.ph.W;
      (s.el.firstChild as El).style.transform = `scale(${k.toFixed(4)})`;
      sizeCards(s.r);
      pose(s.r, s.u, g);
    }
  }

  let roRaf = 0;
  function setMode() {
    const m = live.matches ? "live" : "still";
    // a design that draws the route itself asks for the card alone (`--dlr-lay: cd`, live only)
    const l: Lay = m === "live" && getComputedStyle(root).getPropertyValue("--dlr-lay").trim() === "cd" ? "cd" : root.clientWidth < PHONE_BELOW ? "ph" : "dk";
    if (l !== lay || !R) {
      lay = l;
      R = buildBox(box, l, text, gslot);
      root.dataset.lay = l;
    }
    mode = m;
    root.dataset.mode = m;
    R.live = m === "live";
    if (m === "still") {
      buildStills();
      fitStills();
      fitted = fitTo(obj, R, false);
      pose(R, LAST, g);
      items.forEach((li) => {
        li.style.opacity = li.style.transform = "";
      });
      capEl.style.transform = "";
    } else measure();
  }
  const onResize = () => {
    cancelAnimationFrame(roRaf);
    roRaf = requestAnimationFrame(setMode);
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(root);
  // the drawing's box changes size without the figure when a design switches the layout (`--dlr-lay`)
  ro.observe(obj);

  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("keydown", onKey);
  addEventListener("touchstart", onTouchStart, { passive: true });
  addEventListener("touchmove", onTouchMove, { passive: false });
  addEventListener("scroll", onScroll, { passive: true });
  live.addEventListener("change", setMode);
  document.fonts?.ready.then(() => R && setMode());
  setMode();

  return () => {
    ro.disconnect();
    removeEventListener("wheel", onWheel);
    removeEventListener("keydown", onKey);
    removeEventListener("touchstart", onTouchStart);
    removeEventListener("touchmove", onTouchMove);
    removeEventListener("scroll", onScroll);
    live.removeEventListener("change", setMode);
    cancelAnimationFrame(raf);
    cancelAnimationFrame(autoRaf);
    cancelAnimationFrame(roRaf);
    g.remove();
    shots.forEach((el) => (el.textContent = ""));
    R = null;
  };
}
