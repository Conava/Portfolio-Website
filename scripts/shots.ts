/**
 * Headless visual-test harness: screenshots, overflow/error checks and a scroll jank probe
 * against a production build, driven by playwright-core and the cached Playwright Chromium.
 *
 *   bun run shots [-- --url http://localhost:3000] [--routes /,/projects/minj]
 *     [--designs keynote,thread] [--modes dark,light] [--widths 1440,375] [--locales en,de]
 *     [--label name] [--out dir] [--frames 6] [--no-jank] [--pointer] [--no-fail]
 *
 * --pointer: the jank probe also moves the mouse in a circle while it scrolls (pointer-driven canvases).
 * Without --url it starts `next start -p 3100` and stops it on exit (including Ctrl-C).
 * Exit 1 on page errors, same-origin 4xx/5xx, horizontal overflow or a jank budget breach.
 *
 * Frames mode (one screenshot per 16 ms of virtual time; --designs/--modes/--widths/--locales,
 * --url, --label, --out apply; --reduced runs with prefers-reduced-motion: reduce):
 *   bun run shots -- --frames-mode scroll --route / --target '#education' [--steps 120] [--reverse]
 *   bun run shots -- --frames-mode action --route / --action 'click:<selector>' [--at 0]
 *     [--action 'click:<selector>' --at 9] [--frames 40] [--clip <selector>] [--slowmo 10]
 * --action is click|hover|focus:<selector> or key:<key>, repeatable; the n-th --at pairs with the
 * n-th --action and fires it after that frame (default 0, the resting frame). --clip captures that
 * element's box as measured before frame 0. --slowmo (action only, for cross-document
 * navigations that cannot be stepped) slows animations via CDP and samples in real time.
 * Per run, under <out>/<combo>-<mode>/: frames/NNN.png, diffs.json, plot.png, sheet-full.png,
 * sheet-spike-<frame>.png, origin.json (action), plus a stdout summary.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "playwright-core";
import { contactSheet } from "./lib/contact-sheet";
import { analyze, changedBox, diffRatio, readRaw, writePlot, type Analysis } from "./lib/frame-diff";
import { frameStats, type FrameStats } from "./lib/frame-stats";

const PORT = 3100;
const HEIGHT: Record<number, number> = { 375: 812 };
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export type Options = ReturnType<typeof parseOptions>;

export function parseOptions(argv: string[]) {
  const { values } = parseArgs({
    // `bun run shots -- --x` forwards the `--` separator.
    args: argv.filter((a) => a !== "--"),
    options: {
      url: { type: "string" },
      routes: { type: "string", default: "/" },
      designs: { type: "string", default: "keynote,thread" },
      modes: { type: "string", default: "dark,light" },
      widths: { type: "string", default: "1440,375" },
      locales: { type: "string", default: "en" },
      label: { type: "string", default: new Date().toISOString().replace(/[:.]/g, "-") },
      out: { type: "string" },
      frames: { type: "string" },
      "no-jank": { type: "boolean", default: false },
      pointer: { type: "boolean", default: false },
      "no-fail": { type: "boolean", default: false },
      // frames mode
      "frames-mode": { type: "string" },
      route: { type: "string", default: "/" },
      target: { type: "string" },
      steps: { type: "string", default: "120" },
      reverse: { type: "boolean", default: false },
      action: { type: "string", multiple: true, default: [] },
      at: { type: "string", multiple: true, default: [] },
      slowmo: { type: "string" },
      clip: { type: "string" },
      reduced: { type: "boolean", default: false },
    },
  });
  const framesMode = values["frames-mode"];
  if (framesMode !== undefined && framesMode !== "scroll" && framesMode !== "action") {
    throw new Error(`--frames-mode must be scroll or action, got "${framesMode}"`);
  }
  // --frames: mid-scroll stills in still mode (default 6), captured frames in action mode (default 40).
  const frames = posInt("--frames", values.frames ?? (framesMode === "action" ? "40" : "6"));
  const actions = values.action.map(parseAction);
  const at = values.at.map((v) => nonNegInt("--at", v));
  if (at.length > actions.length) throw new Error("more --at than --action values");
  if (framesMode === "scroll" && !values.target) throw new Error("--frames-mode scroll needs --target <selector>");
  if (framesMode === "action" && !actions.length) throw new Error("--frames-mode action needs at least one --action");
  const slowmo = values.slowmo === undefined ? undefined : Number(values.slowmo);
  if (slowmo !== undefined && !(slowmo >= 1)) throw new Error(`--slowmo must be a number >= 1, got "${values.slowmo}"`);
  if (slowmo !== undefined && framesMode !== "action") throw new Error("--slowmo needs --frames-mode action");
  return {
    framesMode,
    route: values.route,
    target: values.target,
    steps: posInt("--steps", values.steps),
    reverse: values.reverse,
    // An action without --at fires after frame 0 (the resting frame).
    actions: actions.map((a, i) => ({ ...a, at: at[i] ?? 0 })),
    slowmo,
    clip: values.clip,
    reduced: values.reduced,
    url: values.url?.replace(/\/$/, ""),
    routes: csv(values.routes),
    designs: csv(values.designs),
    modes: csv(values.modes) as ("dark" | "light")[],
    widths: csv(values.widths).map(Number),
    locales: csv(values.locales),
    label: values.label,
    out: values.out ?? join(".devline", "shots", values.label),
    frames,
    jank: !values["no-jank"],
    pointer: values.pointer,
    fail: !values["no-fail"],
  };
}

function posInt(flag: string, v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive integer, got "${v}"`);
  return n;
}

function nonNegInt(flag: string, v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} must be a non-negative integer, got "${v}"`);
  return n;
}

export type Action = { kind: "click" | "hover" | "focus" | "key"; arg: string };

/** `click:<selector>`, `hover:<selector>`, `focus:<selector>`, `key:<key>` (Playwright key names). */
export function parseAction(v: string): Action {
  const i = v.indexOf(":");
  const kind = v.slice(0, i);
  const arg = v.slice(i + 1);
  if (i < 0 || !arg || !["click", "hover", "focus", "key"].includes(kind)) {
    throw new Error(`--action must be click|hover|focus|key:<selector or key>, got "${v}"`);
  }
  return { kind: kind as Action["kind"], arg };
}

/** EN has no prefix, every other locale is served under `/<locale>`. */
export function localePath(route: string, locale: string): string {
  if (locale === "en") return route;
  return `/${locale}${route === "/" ? "" : route}`;
}

export function routeSlug(route: string): string {
  return route.replace(/^\/+|\/+$/g, "").replace(/\//g, "-") || "home";
}

/** `PLAYWRIGHT_CHROMIUM_PATH`, else the newest cached `chromium-<rev>/chrome-linux*\/chrome`. */
export function findChromium(): string {
  const env = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (env) return env;
  const cache = join(homedir(), ".cache", "ms-playwright");
  const revs = existsSync(cache)
    ? readdirSync(cache)
        .filter((d) => /^chromium-\d+$/.test(d))
        .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    : [];
  for (const rev of revs) {
    for (const sub of readdirSync(join(cache, rev)).filter((d) => d.startsWith("chrome-linux"))) {
      const exe = join(cache, rev, sub, "chrome");
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error(`No Chromium found under ${cache}/chromium-*/chrome-linux*/chrome. Set PLAYWRIGHT_CHROMIUM_PATH.`);
}

export function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: findChromium(),
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
}

let server: ChildProcess | undefined;

function killServer(sig: NodeJS.Signals) {
  if (!server?.pid) return;
  try {
    process.kill(-server.pid, sig); // whole process group: next may fork workers
  } catch {
    server.kill(sig);
  }
}

/** SIGTERM, wait for the child to exit, SIGKILL after 5 s. */
async function stopServer() {
  const proc = server;
  if (!proc || proc.exitCode !== null) return;
  const exited = new Promise<void>((r) => proc.once("exit", () => r()));
  killServer("SIGTERM");
  const timer = setTimeout(() => killServer("SIGKILL"), 5000);
  await exited;
  clearTimeout(timer);
  server = undefined;
}

/** Starts `next start` on PORT, resolves with its base URL once it answers. */
export async function startServer(): Promise<string> {
  if (!existsSync(join(".next", "BUILD_ID"))) {
    console.error("Run `bun run build` first.");
    process.exit(1);
  }
  const base = `http://localhost:${PORT}`;
  if (await fetch(base, { redirect: "manual" }).then(() => true, () => false)) {
    throw new Error(`Port ${PORT} is already in use; stop that server or pass --url.`);
  }
  process.on("exit", () => killServer("SIGTERM")); // sync last resort
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => void stopServer().then(() => process.exit(130)));
  }
  const proc = spawn(join("node_modules", ".bin", "next"), ["start", "-p", String(PORT)], {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  server = proc;
  // Next warns that `next start` ignores output: standalone; that is expected here.
  proc.stderr?.on("data", (d: Buffer) => {
    const text = d.toString().split("\n").filter((l) => !l.includes("output: standalone"));
    if (text.some((l) => l.trim())) process.stderr.write(text.join("\n"));
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`next start exited with ${proc.exitCode} (port ${PORT} in use?)`);
    try {
      await fetch(base, { redirect: "manual" });
      return base;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`next start did not answer on ${base} within 60 s`);
}

export type Combo = { route: string; locale: string; design: string; mode: "dark" | "light"; width: number; reduced: boolean };

export function comboName(c: Combo): string {
  return [routeSlug(c.route), c.locale, c.design, c.mode, c.width, ...(c.reduced ? ["reduced"] : [])].join("-");
}

export async function newContext(browser: Browser, base: string, c: Omit<Combo, "route" | "locale">): Promise<BrowserContext> {
  const mobile = c.width < 768;
  const opts: BrowserContextOptions = {
    viewport: { width: c.width, height: HEIGHT[c.width] ?? 900 },
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: c.mode,
    reducedMotion: c.reduced ? "reduce" : "no-preference",
  };
  const ctx = await browser.newContext(opts);
  await ctx.addCookies([{ name: "design", value: c.design, url: base }]);
  return ctx;
}

async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

type PageResult = Combo & {
  name: string;
  url: string;
  screenshots: string[];
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  overflowPx: number;
  pass: boolean;
};

async function shootPage(browser: Browser, base: string, c: Combo, o: Options): Promise<PageResult> {
  const name = comboName(c);
  const url = base + localePath(c.route, c.locale);
  const ctx = await newContext(browser, base, c);
  const page = await ctx.newPage();
  const r: PageResult = { ...c, name, url, screenshots: [], consoleErrors: [], pageErrors: [], failedRequests: [], overflowPx: 0, pass: false };
  page.on("console", (m) => m.type() === "error" && r.consoleErrors.push(m.text()));
  page.on("pageerror", (e) => r.pageErrors.push(e.message));
  page.on("response", (res) => {
    if (res.status() >= 400 && res.url().startsWith(base)) r.failedRequests.push(`${res.status()} ${res.url()}`);
  });
  try {
    await open(page, url);
    const shot = async (suffix: string) => {
      const file = `${name}${suffix}.png`;
      await page.screenshot({ path: join(o.out, file) });
      r.screenshots.push(file);
    };
    await shot("");
    r.overflowPx = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
    const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    if (maxY > 0) {
      for (let i = 1; i <= o.frames; i++) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round((maxY * i) / o.frames));
        await page.waitForTimeout(300); // let scroll-triggered reveals settle
        await shot(`-scroll-${i}`);
      }
    }
  } catch (e) {
    r.pageErrors.push(`harness: ${(e as Error).message}`);
  }
  await ctx.close();
  r.pass = !r.pageErrors.length && !r.failedRequests.length && !r.overflowPx;
  return r;
}

type JankResult = FrameStats & { route: string; locale: string; design: string; loaf: boolean; error?: string };

/** Wheel-scrolls the whole page at ~60 Hz (1440 dark), optionally circling the mouse, and measures rAF deltas plus long tasks. */
async function measureJank(browser: Browser, base: string, route: string, locale: string, design: string, pointer = false): Promise<JankResult> {
  const ctx = await newContext(browser, base, { design, mode: "dark", width: 1440, reduced: false });
  const page = await ctx.newPage();
  try {
    await open(page, base + localePath(route, locale));
    await page.waitForTimeout(500);
    const loaf = await page.evaluate(() => {
      const w = window as unknown as { __jank: { deltas: number[]; long: number[]; on: boolean } };
      const j: { deltas: number[]; long: number[]; on: boolean } = (w.__jank = { deltas: [], long: [], on: true });
      const types = ["longtask", "long-animation-frame"].filter((t) => PerformanceObserver.supportedEntryTypes.includes(t));
      // A long-animation-frame with blockingDuration 0 is a compositor/GPU stall (SwiftShader), not main-thread work.
      const blocking = (e: PerformanceEntry) => e.entryType !== "long-animation-frame" || (e as PerformanceEntry & { blockingDuration: number }).blockingDuration > 0;
      for (const type of types) new PerformanceObserver((l) => l.getEntries().forEach((e) => blocking(e) && j.long.push(e.duration))).observe({ type });
      let last = performance.now();
      const tick = (t: number) => {
        j.deltas.push(t - last);
        last = t;
        if (j.on) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return types.includes("long-animation-frame");
    });
    await page.mouse.move(720, 450);
    const steps = Math.ceil((await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)) / 100);
    for (let i = 0; i < steps; i++) {
      if (pointer) await page.mouse.move(720 + Math.cos(i / 4) * 400, 450 + Math.sin(i / 4) * 300);
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(200);
    const { deltas, long } = await page.evaluate(() => {
      const j = (window as unknown as { __jank: { deltas: number[]; long: number[]; on: boolean } }).__jank;
      j.on = false;
      return j;
    });
    // First delta spans setup, not a frame.
    return { route, locale, design, loaf, ...frameStats(deltas.slice(1), long) };
  } catch (e) {
    return { route, locale, design, loaf: false, ...frameStats([], []), pass: false, error: (e as Error).message };
  } finally {
    await ctx.close();
  }
}

function summarize(pages: PageResult[], jank: JankResult[], o: Options, version: string): boolean {
  const count = (f: (p: PageResult) => number) => pages.reduce((n, p) => n + f(p), 0);
  const line = (label: string, ok: boolean, detail: string) => console.log(`  ${label.padEnd(20)} ${ok ? "PASS" : "FAIL"}  ${detail}`);
  const pageErrors = count((p) => p.pageErrors.length);
  const failed = count((p) => p.failedRequests.length);
  const overflow = Math.max(0, ...pages.map((p) => p.overflowPx));
  const shots = count((p) => p.screenshots.length);
  console.log(`\nshots: ${pages.length} pages, ${shots} screenshots, ${jank.length} jank runs (Chromium ${version}) -> ${o.out}`);
  line("page errors", !pageErrors, String(pageErrors));
  line("failed requests", !failed, `${failed} same-origin 4xx/5xx`);
  line("horizontal overflow", !overflow, `worst ${overflow}px`);
  console.log(`  ${"console errors".padEnd(20)} INFO  ${count((p) => p.consoleErrors.length)}`);
  const jankOk = jank.every((j) => j.pass);
  if (o.jank) {
    const measured = jank.filter((j) => j.frames);
    line(
      "jank",
      jankOk,
      measured.length
        ? `worst p95 ${Math.max(...measured.map((j) => j.p95)).toFixed(1)}ms, frames>50ms ${Math.max(...measured.map((j) => j.over50))}, ` +
            `max long task ${Math.max(...jank.map((j) => j.maxLongTask)).toFixed(0)}ms`
        : "no frames",
    );
  }
  for (const p of pages.filter((p) => !p.pass)) {
    console.log(`  FAIL ${p.name}: ${[...p.pageErrors, ...p.failedRequests, ...(p.overflowPx ? [`overflow ${p.overflowPx}px`] : [])].join("; ").slice(0, 200)}`);
  }
  for (const j of jank.filter((j) => !j.pass)) {
    console.log(`  FAIL jank ${routeSlug(j.route)}-${j.locale}-${j.design}: ${j.error ?? `p95 ${j.p95.toFixed(1)}ms, >50ms ${j.over50}, long tasks ${j.longTasks} (max ${j.maxLongTask.toFixed(0)}ms)`}`);
  }
  if (o.jank) console.log("  note: SwiftShader frame timings are indicative, not device-accurate.");
  return !pageErrors && !failed && !overflow && jankOk;
}

// ---------------------------------------------------------------------------------------------
// Frames mode (A.4 E): one screenshot per 16 ms of virtual time, neighbor diffs, plot, sheets.

const FRAME_MS = 16;

/**
 * Page-side stepper, installed before page scripts. `page.clock` fakes timers, Date,
 * performance.now and rAF but not CSS animations/transitions, so every document animation
 * (new ones included) is paused and its currentTime set from the virtual elapsed time.
 * Also keeps the real rAF so the harness can wait for a real rendering update (scroll events).
 */
function framesInit() {
  const raf = window.requestAnimationFrame.bind(window);
  const seen = new WeakMap<Animation, { base: number; birth: number }>();
  let now = 0;
  const track = (init: (a: Animation) => { base: number; birth: number }) => {
    for (const a of document.getAnimations()) {
      if (a.timeline !== document.timeline) continue; // scroll-driven: follows the scroll position, not the clock
      let s = seen.get(a);
      if (!s) seen.set(a, (s = init(a)));
      a.pause();
      a.currentTime = s.base + now - s.birth;
    }
  };
  Object.assign(window, {
    __frames: {
      settle: () => new Promise<void>((r) => raf(() => raf(() => r()))),
      // Animations already running when stepping starts keep their progress.
      start: () => track((a) => ({ base: Number(a.currentTime ?? 0), birth: 0 })),
      // Animations first seen now started during the last frame.
      step: (dt: number) => {
        now += dt;
        track(() => ({ base: 0, birth: now - dt }));
      },
    },
  });
}

type FramesWindow = { __frames: { settle(): Promise<void>; start(): void; step(dt: number): void } };

type FrameRun = { name: string; frames: number; analysis: Analysis; ms: number[]; errors: string[]; origin?: Record<string, unknown> };

async function runFrames(browser: Browser, base: string, c: Combo, o: Options): Promise<FrameRun> {
  const name = `${comboName(c)}-${o.framesMode}`;
  const dir = join(o.out, name);
  mkdirSync(join(dir, "frames"), { recursive: true });
  const file = (i: number) => join(dir, "frames", `${String(i).padStart(3, "0")}.png`);
  const ctx = await newContext(browser, base, c);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (res) => {
    if (res.status() >= 400 && res.url().startsWith(base)) errors.push(`${res.status()} ${res.url()}`);
  });
  const stepped = o.slowmo === undefined;
  if (stepped) {
    await page.addInitScript(framesInit); // before the clock, so it keeps the real rAF
    await page.clock.install();
  }
  const ms: number[] = [];
  const labels: string[] = [];
  let clip: { x: number; y: number; width: number; height: number } | undefined;
  const shot = async (virtualMs: number, extra = "") => {
    await page.screenshot({ path: file(ms.length), clip });
    labels.push(`#${ms.length} ${virtualMs}ms${extra}`);
    ms.push(virtualMs);
  };
  const advance = async () => {
    await page.evaluate(() => (window as unknown as FramesWindow).__frames.settle());
    await page.clock.runFor(FRAME_MS);
    await page.evaluate((dt) => (window as unknown as FramesWindow).__frames.step(dt), FRAME_MS);
  };
  const act = async (a: Action) => {
    if (a.kind === "key") return page.keyboard.press(a.arg);
    const loc = page.locator(a.arg).first();
    if (a.kind === "click") return loc.click();
    if (a.kind === "hover") return loc.hover();
    return loc.focus();
  };
  let origin: Record<string, unknown> | undefined;
  try {
    await open(page, base + localePath(o.route, c.locale));
    let range: [number, number] = [0, 0];
    if (o.framesMode === "scroll") {
      // From the target entering at the bottom (1 viewport before) to leaving at the top.
      range = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`--target ${sel} not found`);
        const r = el.getBoundingClientRect();
        const max = document.documentElement.scrollHeight - innerHeight;
        const clamp = (y: number) => Math.round(Math.min(max, Math.max(0, y)));
        return [clamp(scrollY + r.top - innerHeight), clamp(scrollY + r.bottom)] as [number, number];
      }, o.target!);
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), range[0]);
    }
    const trigger = o.actions.find((a) => a.kind !== "key");
    // Otherwise the action's own scroll-into-view lands in frame 1.
    if (o.framesMode === "action" && trigger) await page.locator(trigger.arg).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(500); // the clock still runs in real time here: let load settle
    if (o.clip) {
      const box = await page.locator(o.clip).first().boundingBox();
      if (!box) throw new Error(`--clip ${o.clip} has no box`);
      const vp = page.viewportSize()!;
      const x = Math.max(0, box.x), y = Math.max(0, box.y);
      clip = { x, y, width: Math.min(vp.width, box.x + box.width) - x, height: Math.min(vp.height, box.y + box.height) - y };
      if (clip.width <= 0 || clip.height <= 0) throw new Error(`--clip ${o.clip} is outside the viewport`);
    }
    if (stepped) {
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50);
      await page.evaluate(() => (window as unknown as FramesWindow).__frames.start());
    }
    if (o.framesMode === "scroll") {
      await shot(0, ` y${range[0]}`);
      const ys = Array.from({ length: o.steps }, (_, i) => Math.round(range[0] + ((range[1] - range[0]) * (i + 1)) / o.steps));
      if (o.reverse) ys.push(...ys.slice(0, -1).reverse(), range[0]);
      for (const y of ys) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
        await advance();
        await shot(ms.length * FRAME_MS, ` y${y}`);
      }
    } else {
      const tb = trigger && (await page.locator(trigger.arg).first().boundingBox());
      origin = { trigger: trigger?.arg ?? null, triggerCenter: tb ? { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 } : null };
      await shot(0);
      if (stepped) {
        for (let f = 0; f < o.frames; f++) {
          for (const a of o.actions.filter((a) => a.at === f)) await act(a);
          await advance();
          await shot(ms.length * FRAME_MS);
        }
      } else {
        // A navigation cannot be stepped: slow every animation via CDP and sample in real time.
        const cdp = await ctx.newCDPSession(page);
        const applyRate = () =>
          cdp.send("Animation.enable").then(() => cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / o.slowmo! })).catch(() => {});
        await applyRate();
        page.on("framenavigated", (fr) => fr === page.mainFrame() && void applyRate());
        const t0 = Date.now();
        const pending: Promise<unknown>[] = [];
        for (let f = 0; f < o.frames; f++) {
          for (const a of o.actions.filter((a) => a.at === f)) pending.push(act(a).catch((e) => errors.push(`action: ${(e as Error).message}`)));
          const due = t0 + (f + 1) * FRAME_MS * o.slowmo!;
          if (due > Date.now()) await page.waitForTimeout(due - Date.now());
          for (let tries = 0; ; tries++) {
            try {
              await shot(Math.round((Date.now() - t0) / o.slowmo!));
              break;
            } catch (e) {
              if (tries >= 20) throw e;
              await new Promise((r) => setTimeout(r, 50)); // mid-navigation, retry
            }
          }
        }
        await Promise.all(pending);
      }
    }
  } catch (e) {
    errors.push(`harness: ${(e as Error).message}`);
  }
  await ctx.close();

  // Streamed: only two decoded frames in memory at a time.
  const ratios: number[] = [];
  let prev = ms.length ? await readRaw(file(0)) : undefined;
  for (let i = 1; i < ms.length && prev; i++) {
    const cur = await readRaw(file(i));
    ratios.push(diffRatio(prev.data, cur.data));
    if (i === 1 && origin) {
      const b = changedBox(prev.data, cur.data, cur.width);
      origin.frame1ChangedBox = b && { ...b, x: b.x + (clip?.x ?? 0), y: b.y + (clip?.y ?? 0) };
    }
    prev = cur;
  }
  const analysis = analyze(ratios);
  const note = "ratios[i] compares frame i with frame i+1; spikes, dead and firstResponse are ratio indices";
  writeFileSync(join(dir, "diffs.json"), JSON.stringify({ note, ms, ratios, ...analysis }, null, 2));
  if (origin) writeFileSync(join(dir, "origin.json"), JSON.stringify(origin, null, 2));
  if (ratios.length) {
    await writePlot(join(dir, "plot.png"), ratios, analysis);
    const tiles = (idx: number[]) => idx.map((i) => ({ file: file(i), label: labels[i] }));
    const all = ms.map((_, i) => i);
    const every = Math.max(1, Math.ceil(ms.length / 40));
    await contactSheet(join(dir, "sheet-full.png"), tiles(all.filter((i) => i % every === 0)), { columns: 8, tileWidth: 240 });
    for (const s of analysis.spikes) {
      const idx = all.filter((i) => Math.abs(i - (s + 1)) <= 4);
      await contactSheet(join(dir, `sheet-spike-${s + 1}.png`), tiles(idx), { columns: idx.length });
    }
  }
  return { name, frames: ms.length, analysis, ms, errors, origin };
}

function summarizeFrames(runs: FrameRun[], o: Options, version: string): boolean {
  console.log(`\nframes (${o.framesMode}${o.slowmo ? `, slowmo x${o.slowmo}` : ""}): ${runs.length} runs (Chromium ${version}) -> ${o.out}`);
  for (const r of runs) {
    const { spikes, dead, firstResponse } = r.analysis;
    const at = (i: number) => `${i + 1} (${r.ms[i + 1]}ms)`;
    console.log(`  ${r.name}: ${r.frames} frames`);
    console.log(`    first response  ${firstResponse === null ? "none (nothing moved)" : `frame ${at(firstResponse)}`}`);
    console.log(`    spikes          ${spikes.length ? spikes.map(at).join(", ") : "none"}`);
    console.log(`    dead stretches  ${dead.length ? dead.map(([a, b]) => `frames ${a + 1}-${b + 1}`).join(", ") : "none"}`);
    if (r.origin) console.log(`    origin          ${JSON.stringify(r.origin)}`);
    for (const e of r.errors) console.log(`    ERROR ${e.slice(0, 200)}`);
  }
  if (o.slowmo) {
    console.log("  note: --slowmo samples real time with CDP Animation.setPlaybackRate. A cross-document navigation");
    console.log("        cannot be stepped: timing is approximate; the rate is re-applied after each navigation.");
  }
  // Console errors are reported but, as in still mode, do not fail the run.
  return runs.every((r) => r.errors.every((e) => e.startsWith("console:")));
}

async function main() {
  const o = parseOptions(process.argv.slice(2));
  const base = o.url ?? (await startServer());
  mkdirSync(o.out, { recursive: true });
  const browser = await launchBrowser();
  const pages: PageResult[] = [];
  const jank: JankResult[] = [];
  const version = browser.version();
  if (o.framesMode) {
    const runs: FrameRun[] = [];
    try {
      for (const locale of o.locales)
        for (const design of o.designs)
          for (const width of o.widths)
            for (const mode of o.modes) runs.push(await runFrames(browser, base, { route: o.route, locale, design, mode, width, reduced: o.reduced }, o));
    } finally {
      await browser.close();
      await stopServer();
    }
    const pass = summarizeFrames(runs, o, version);
    process.exit(pass || !o.fail ? 0 : 1);
  }
  try {
    for (const route of o.routes)
      for (const locale of o.locales)
        for (const design of o.designs) {
          for (const width of o.widths) {
            for (const mode of o.modes) pages.push(await shootPage(browser, base, { route, locale, design, mode, width, reduced: false }, o));
            pages.push(await shootPage(browser, base, { route, locale, design, mode: "dark", width, reduced: true }, o));
          }
          if (o.jank) jank.push(await measureJank(browser, base, route, locale, design, o.pointer));
        }
  } finally {
    await browser.close();
    await stopServer();
  }
  const pass = summarize(pages, jank, o, version);
  writeFileSync(join(o.out, "report.json"), JSON.stringify({ label: o.label, base, chromium: version, pass, pages, jank }, null, 2));
  process.exit(pass || !o.fail ? 0 : 1);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    stopServer().finally(() => process.exit(1));
  });
}
