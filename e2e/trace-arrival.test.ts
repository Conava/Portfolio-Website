import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser, Page } from "playwright-core";
import { launchBrowser } from "../scripts/shots";
import { assertBuilt, startSite, type Site } from "./helpers";

let site: Site;
let browser: Browser;
beforeAll(async () => {
  assertBuilt();
  site = await startSite({ DESIGN: "thread" });
  browser = await launchBrowser();
}, 90_000);
afterAll(async () => {
  await browser?.close();
  await site?.stop();
});

/** The head's viewport top at progress `p` through the pinned `scene`. */
const tipAt = (page: Page, scene: string, p: number) =>
  page.evaluate(
    async ([scene, p]) => {
      const sc = document.querySelector<HTMLElement>(`[data-scene="${scene}"]`)!;
      window.scrollTo(0, sc.getBoundingClientRect().top + scrollY + p * (sc.offsetHeight - innerHeight));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return document.querySelector(".trace-head")!.getBoundingClientRect().top;
    },
    [scene, p] as const,
  );

// Opening an education panel drops that scene's pin (the page gets about a viewport shorter);
// the trace must re-measure, so the line still reaches the contact terminus at the page end.
test("trace: contact terminus arrives after an education panel opened the pinned scene", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    // To the scene's hold, where the panel triggers wake up.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-scene="education"]')!;
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY + el.offsetHeight - innerHeight);
    });
    const trigger = page.locator(".t-edu-more .dp-trigger").first();
    await expect(trigger.isVisible()).resolves.toBe(true);
    await page.waitForFunction(() => !document.querySelector<HTMLElement>(".t-edu-more")!.inert, null, { timeout: 5000 });
    await trigger.click();
    await page.waitForFunction(() => document.querySelector('[data-scene="education"]')!.hasAttribute("data-scene-disabled"));
    await page.waitForTimeout(1500); // panel open + measure debounce
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => !!document.querySelector("[data-trace-end][data-arrived]"), null, { timeout: 5000 });
  } finally {
    await ctx.close();
  }
}, 60_000);

// Each entry is a task box the line runs; once run it is done and checked, with how long it ran.
test("trace: task boxes check off clear of the gutter and the rail, with localized durations", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForTimeout(1800); // intro draw
    expect(await page.$$eval(".trace-task", (t) => t.length)).toBeGreaterThanOrEqual(6); // jobs, Dux lanes, projects
    // A gateway where each lane forks and one where it joins, one token per lane.
    const gateways = await page.$$eval(".trace-base .trace-gw", (g) => g.length);
    expect(gateways).toBeGreaterThanOrEqual(4);
    expect(await page.$$eval(".trace-tokens > .trace-token", (t) => t.length)).toBe(gateways / 2);
    await page.evaluate(() => window.scrollTo(0, document.getElementById("education")!.getBoundingClientRect().top + scrollY));
    await page.waitForTimeout(400);
    expect(await page.$$eval(".trace-task[data-done]", (t) => t.length)).toBeGreaterThan(0);
    const clear = await page.evaluate(() => {
      const gutter = Math.max(...Array.from(document.querySelectorAll(".pad[data-station]"), (p) => p.getBoundingClientRect().right));
      const rail = document.querySelector(".t-rail-line")!.getBoundingClientRect().left;
      const ticks = Array.from(document.querySelectorAll(".trace-tick"), (t) => t.getBoundingClientRect());
      const boxes = Array.from(document.querySelectorAll(".trace-task"), (t) => t.getBoundingClientRect());
      return ticks.every((r) => r.left > gutter + 20 && r.right < rail - 8) && boxes.every((r) => r.right < rail - 8);
    });
    expect(clear).toBe(true);
    const ticks = () => page.$$eval(".trace-tick", (t) => t.map((x) => x.textContent ?? "").join("|"));
    const en = await ticks();
    expect(en).toMatch(/\d+ (months?|years?)/);
    expect(en).not.toContain("·");
    await page.goto(site.base + "/de", { waitUntil: "load" });
    await page.waitForTimeout(800);
    const de = await ticks();
    expect(de).toMatch(/\d+ (Monate?|Jahre?)/);
    expect(de).not.toContain("·");
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
  }
}, 60_000);

// A pinned scene holds the page still: the lit tip runs down the held screen instead (40 % to 85 %).
test("trace: the tip descends through the pinned education scene", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForTimeout(1800);
    const [t1, t2, t3] = [await tipAt(page, "education", 0.1), await tipAt(page, "education", 0.5), await tipAt(page, "education", 0.9)];
    expect(t2).toBeGreaterThan(t1 + 50);
    expect(t3).toBeGreaterThan(t2 + 50);
    expect(t1).toBeGreaterThan(900 * 0.35);
    expect(t3).toBeLessThan(900 * 0.9);
  } finally {
    await ctx.close();
  }
}, 60_000);

// A scrub, not steps: the head moves a little per small scroll step, and a box's drawn share
// passes through in-between states and never shrinks while scrolling down.
test("trace: progress is continuous with the scroll", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForTimeout(1800);
    const r = await page.evaluate(async () => {
      // The first box's lit share: of each of its legs (one lit SVG per leg, in rig k for leg k), the
      // share of the leg's box its reveal has opened, averaged (1 once done).
      const box = document.querySelector<SVGSVGElement>(".trace-task")!;
      // Its four legs (two per half) are the first lit SVGs of the first pair's four rigs.
      const legs = Array.from(document.querySelectorAll<HTMLElement>(".trace-rig")).slice(0, 4);
      const lits = legs.map((r) => r.querySelector<SVGSVGElement>(".trace-task-lit")!);
      const head = document.querySelector<HTMLElement>(".trace-head")!;
      const opened = (rig: HTMLElement, lit: SVGSVGElement) => {
        const m = new DOMMatrix(getComputedStyle(rig).transform);
        const [l, t, w, h] = [parseFloat(lit.style.left), parseFloat(lit.style.top), lit.width.baseVal.value, lit.height.baseVal.value];
        const ix = Math.max(0, Math.min(l + w, m.m41 + rig.offsetWidth) - Math.max(l, m.m41));
        const iy = Math.max(0, Math.min(t + h, m.m42 + rig.offsetHeight) - Math.max(t, m.m42));
        return (ix * iy) / (w * h);
      };
      const drawn = () => (box.hasAttribute("data-done") ? 1 : legs.reduce((n, r, i) => n + opened(r, lits[i]), 0) / legs.length);
      const sample = async (s: number) => {
        window.scrollTo({ top: s, behavior: "instant" });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { y: new DOMMatrix(getComputedStyle(head).transform).m42, drawn: lits[0].hasAttribute("data-run") || box.hasAttribute("data-done") ? drawn() : 0 };
      };
      let prev = await sample(0);
      let maxJump = 0;
      let shrank = false;
      let partial = 0;
      for (let s = 16; s <= 2400; s += 16) {
        const cur = await sample(s);
        maxJump = Math.max(maxJump, Math.abs(cur.y - prev.y));
        if (cur.drawn < prev.drawn - 1e-3) shrank = true;
        if (cur.drawn > 0.05 && cur.drawn < 0.95) partial++;
        prev = cur;
      }
      return { maxJump, shrank, partial };
    });
    expect(r.maxJump).toBeLessThan(40);
    expect(r.shrank).toBe(false);
    expect(r.partial).toBeGreaterThan(3);
  } finally {
    await ctx.close();
  }
}, 60_000);

/**
 * Every visible head/token against the pixels of the lit line, with the dots hidden: on one of the
 * lit paths through its centre, the line is lit behind it and its lit end is within 3 px of it.
 * Returns one line per dot that fails (empty when all ride the tip) and how many dots it checked.
 */
async function dotsOffTip(page: Page): Promise<{ off: string[]; dots: number }> {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const dots = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".trace-head, .trace-token"))
      .filter((e) => Number(getComputedStyle(e).opacity) > 0.5 && getComputedStyle(e).display !== "none")
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { name: `${e.parentElement!.className} > ${e.className}`, x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })
      // Far enough inside the viewport that the line behind can be seen.
      .filter((d) => d.y > 16 && d.y < innerHeight - 16 && d.x > 16 && d.x < innerWidth - 16)
      // Two dots together (a box's halves leaving their shared stub) light each other's path.
      .filter((d, _, all) => !all.some((o) => o !== d && Math.hypot(o.x - d.x, o.y - d.y) < 6)),
  );
  // Pads too: a filled pad at the tip is not lit line.
  const hide = await page.addStyleTag({ content: ".trace-head, .trace-token, .pad { visibility: hidden !important; }" });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const png = (await page.screenshot()).toString("base64");
  const off = await page.evaluate(
    async ([png, dots]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const cv = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
      const cx = cv.getContext("2d")!;
      cx.drawImage(img, 0, 0);
      const px = cx.getImageData(0, 0, img.width, img.height).data;
      // Any CSS colour (the tokens may be oklch) as sRGB bytes.
      const rgb = (s: string) => {
        const c = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d")!;
        c.fillStyle = s;
        c.fillRect(0, 0, 1, 1);
        return Array.from(c.getImageData(0, 0, 1, 1).data.slice(0, 3));
      };
      const acc = rgb(getComputedStyle(document.querySelector(".trace-head")!).backgroundColor);
      // The accent is a green; the unlit line and the page are grey. Lit: the pixel under the point
      // has at least 40 % of the accent's green excess (a 1.5 px stroke covers it 75 % or more).
      const green = (r: number, g: number, b: number) => g - (r + b) / 2;
      const lit = (x: number, y: number) => {
        const i = (Math.floor(y) * img.width + Math.floor(x)) * 4;
        return green(px[i], px[i + 1], px[i + 2]) > 0.4 * green(acc[0], acc[1], acc[2]);
      };
      // Behind the dot, the stroke may sit between pixels on a rounded corner: look at the neighbours too.
      const litNear = (x: number, y: number) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => lit(x + dx, y + dy)));
      const paths = Array.from(document.querySelectorAll<SVGPathElement>(".trace-lit path, .trace-task-lit path")).filter(
        (p) => p.getClientRects().length && getComputedStyle(p).visibility !== "hidden",
      );
      const out: string[] = [];
      for (const d of dots) {
        let best = Infinity;
        for (const p of paths) {
          const m = p.getScreenCTM()!;
          const at = (l: number) => {
            const q = p.getPointAtLength(l);
            return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f };
          };
          const total = p.getTotalLength();
          // The nearest point of this path to the dot.
          let l0 = -1;
          let dmin = 3;
          for (let l = 0; l <= total; l += 1) {
            const q = at(l);
            const dd = Math.hypot(q.x - d.x, q.y - d.y);
            if (dd < dmin) [dmin, l0] = [dd, l];
          }
          if (l0 < 0) continue;
          const inView = (q: { x: number; y: number }) => q.x > 1 && q.y > 1 && q.x < img.width - 2 && q.y < img.height - 2;
          const behind = at(Math.max(0, l0 - 12));
          if (l0 < 12 || !inView(behind) || !litNear(behind.x, behind.y)) continue;
          // The lit end: the first unlit sample past the dot, scanning from 12 px behind it.
          let end = l0 - 12;
          while (end + 0.5 <= total && end < l0 + 40) {
            const q = at(end + 0.5);
            if (!inView(q) || !lit(q.x, q.y)) break;
            end += 0.5;
          }
          const e = at(end);
          best = Math.min(best, Math.hypot(e.x - d.x, e.y - d.y));
        }
        if (!(best <= 3)) out.push(`${d.name} at ${d.x.toFixed(0)},${d.y.toFixed(0)}: ${best === Infinity ? "no lit line behind it" : `lit end ${best.toFixed(1)} px away`}`);
      }
      return out;
    },
    [png, dots] as const,
  );
  await hide.evaluate((e) => (e as Element).remove());
  return { off, dots: dots.length };
}

// The moving dots are the line's lit tips: on the spine, round both halves of a box, down a lane
// from its gateway and inside a pinned scene, each sits where the lit line ends.
test("trace: every dot rides the tip of the lit line", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForFunction(() =>
      document.querySelector(".trace-head")?.getAnimations().some((a) => !(a.timeline instanceof DocumentTimeline)),
    );
    const go = (y: number) => page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
    // Scroll positions where the box of `id` is a share `f` through its run.
    const boxAt = (id: string, f: number) =>
      page.evaluate(
        ([id, f]) => {
          const b = document.querySelector(`.trace-task[data-task="${id}"]`)!.getBoundingClientRect();
          return b.top + scrollY - 0.4 * innerHeight + f * (b.height + 0.15 * innerHeight);
        },
        [id, f] as const,
      );
    const failures: string[] = [];
    let checked = 0;
    const check = async (label: string) => {
      const r = await dotsOffTip(page);
      checked += r.dots;
      failures.push(...r.off.map((o) => `${label}: ${o}`));
      return r.dots;
    };
    await go(400);
    expect(await check("spine")).toBeGreaterThan(0);
    const ids = await page.$$eval(".trace-task", (t) => t.map((e) => e.getAttribute("data-task")!));
    for (const id of [ids[0], "dux-plugins"]) {
      for (const f of [0.15, 0.4, 0.65, 0.9, 0.97]) {
        await go(await boxAt(id, f));
        await check(`${id} ${f}`);
      }
    }
    // A lane: from its fork, while its own token is out.
    const lane = await page.evaluate(async () => {
      const tok = document.querySelector<HTMLElement>(".trace-tokens > .trace-token")!;
      for (let y = 0; y < document.documentElement.scrollHeight; y += 40) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((r) => requestAnimationFrame(r));
        if (Number(getComputedStyle(tok).opacity) > 0.5) return y;
      }
      return -1;
    });
    expect(lane).toBeGreaterThan(0);
    for (const dy of [20, 120]) {
      await go(lane + dy);
      await check(`lane +${dy}`);
    }
    for (const p of [0.2, 0.5, 0.8]) {
      await page.evaluate((p) => {
        const sc = document.querySelector<HTMLElement>('[data-scene="education"]')!;
        window.scrollTo({ top: sc.getBoundingClientRect().top + scrollY + p * (sc.offsetHeight - innerHeight), behavior: "instant" });
      }, p);
      await check(`education pin ${p}`);
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(15);
  } finally {
    await ctx.close();
  }
}, 120_000);

// Reduced motion: no head, no tokens, nothing scroll-driven; a passed task shows done at once.
test("trace: reduced motion is static", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, document.getElementById("education")!.getBoundingClientRect().top + scrollY));
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({
      animations: document.querySelector(".trace")!.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition)).length,
      shown: Array.from(document.querySelectorAll(".trace-head, .trace-token")).filter((e) => getComputedStyle(e).display !== "none").length,
      done: Array.from(document.querySelectorAll(".trace-tick[data-done]")).filter((e) => getComputedStyle(e).opacity === "1").length,
    }));
    expect(r.animations).toBe(0);
    expect(r.shown).toBe(0);
    expect(r.done).toBeGreaterThan(0);
  } finally {
    await ctx.close();
  }
}, 60_000);

// The lit tip is scroll-driven (compositor), not written from a scroll handler: along the spine
// the head holds one spot in the viewport whatever the scroll position (outside pinned scenes).
test("trace: head is a scroll-driven animation holding its viewport spot", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    // The head is linked to the scroll timeline once the intro draw ends.
    await page.waitForFunction(() =>
      document.querySelector(".trace-head")?.getAnimations().some((a) => !(a.timeline instanceof DocumentTimeline)),
    );
    const ys: number[] = [];
    for (const y of [1000, 1600, 2200]) {
      await page.evaluate(
        (y) =>
          new Promise<void>((done) => {
            window.scrollTo({ top: y, behavior: "instant" });
            requestAnimationFrame(() => requestAnimationFrame(() => done()));
          }),
        y,
      );
      ys.push(
        await page.evaluate(() => {
          const head = document.querySelector<HTMLElement>(".trace-head")!;
          if (!head.getAnimations().some((a) => !(a.timeline instanceof DocumentTimeline))) return NaN;
          return head.getBoundingClientRect().top;
        }),
      );
    }
    expect(ys.every((y) => Number.isFinite(y))).toBe(true);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  } finally {
    await ctx.close();
  }
}, 60_000);

// While the BPMNscript scene compiles, the line's token runs its diagram: the shape of the current
// source line is lit with it and the gutter head steps aside, so one token moves at a time.
test("trace: one token runs the compiling diagram, the head steps aside", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForFunction(() =>
      document.querySelector(".trace-head")?.getAnimations().some((a) => !(a.timeline instanceof DocumentTimeline)),
    );
    const at = (p: number) =>
      tipAt(page, "bpmnscript", p).then(() =>
        page.evaluate(async () => {
          await new Promise((r) => setTimeout(r, 300)); // head fade
          return {
            tok: Number(getComputedStyle(document.querySelector(".trace-diagram-tok")!).opacity),
            head: Number(getComputedStyle(document.querySelector(".trace-head")!).opacity),
            lit: document.querySelectorAll(".t-bpm-dg [data-cur]").length,
          };
        }),
      );
    const mid = await at(0.3);
    expect(mid.tok).toBe(1);
    expect(mid.head).toBe(0);
    expect(mid.lit).toBeGreaterThan(0);
    const after = await at(0.7);
    expect(after.tok).toBe(0);
    expect(after.head).toBe(1);
    expect(after.lit).toBe(0);
  } finally {
    await ctx.close();
  }
}, 60_000);
