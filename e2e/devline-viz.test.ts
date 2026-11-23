import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import { launchBrowser } from "../scripts/shots";
import { assertBuilt, escapeHtml, get, ROOT, startSite, type Site } from "./helpers";
import type { DevlineRunViz } from "../src/lib/types";

const DESIGNS = ["keynote", "thread", "flow", "type"] as const;
const runViz = (l: string): DevlineRunViz =>
  JSON.parse(readFileSync(join(ROOT, `content/${l}/data/projects.json`), "utf8")).projects.find((p: { id: string }) => p.id === "devline").panel.viz;

let site: Site;
let browser: Browser;
beforeAll(async () => {
  assertBuilt();
  site = await startSite();
  browser = await launchBrowser();
}, 120_000);
afterAll(async () => {
  await browser?.close();
  await site?.stop();
});

/** The run figure inside #devline, as served (no JS). */
const figure = (html: string) => {
  const at = html.indexOf('id="devline"');
  const start = html.indexOf('<figure class="viz dlr"', at);
  return start < 0 || at < 0 ? "" : html.slice(start, html.indexOf("</figcaption></figure>", start));
};

test("devline run: every design serves the stages, their lines, the gates and the overview (skills, agents, knowledge bases, hooks) without JS", async () => {
  for (const l of ["en", "de"]) {
    const v = runViz(l);
    for (const d of DESIGNS) {
      const fig = figure(await (await get(site, l === "de" ? "/de" : "/", { Cookie: `design=${d}` })).text());
      const label = `${d} ${l}`;
      expect(fig, label).not.toBe("");
      for (const s of v.stages) {
        expect(fig, `${label} ${s.id}`).toContain(escapeHtml(s.name));
        expect(fig, `${label} ${s.id} line`).toContain(escapeHtml(s.line));
        if (s.gate) expect(fig, `${label} ${s.id} gate`).toContain(escapeHtml(s.gate));
      }
      const p = v.parts;
      for (const t of [p.heading, p.skills.text, p.skills.alone, p.agents.text, p.agents.default, p.knowledge.text, p.hooks.text]) expect(fig, label).toContain(escapeHtml(t));
      for (const n of [...p.skills.pipelineItems.map((x) => x.name), ...p.skills.otherItems]) expect(fig, `${label} skill ${n}`).toContain(`<code>${escapeHtml(n)}</code>`);
      for (const a of p.agents.items) expect(fig, `${label} agent ${a.name}`).toContain(escapeHtml(a.role));
      for (const k of p.knowledge.items) expect(fig, `${label} kb ${k.name}`).toContain(escapeHtml(k.text));
      for (const r of p.hooks.rules) expect(fig, label).toContain(escapeHtml(r.command));
      expect(fig, label).not.toMatch(/I approve|you approve|Ich gebe frei/i);
    }
  }
}, 60_000);

const at = (page: Page) =>
  page.evaluate(() => {
    const ticks = [...document.querySelectorAll("#devline .dlr-rail li")];
    return { stage: ticks.findIndex((t) => t.hasAttribute("data-cur")), y: scrollY };
  });
const geo = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("#devline .dlr-scene")!;
    const pin = document.querySelector<HTMLElement>("#devline .dlr-pin")!;
    const top0 = s.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(pin).top) || 0);
    return { top0, step: (s.offsetHeight - pin.offsetHeight) / 9 };
  });
const jumpTo = async (page: Page, k: number, extra = 0) => {
  for (let i = 0; i < 3; i++) {
    const g = await geo(page);
    await page.evaluate((y) => scrollTo(0, y), g.top0 + k * g.step + extra);
    await page.waitForTimeout(400);
  }
};

test("devline run: the card and the model slider stay on screen at every stage, and the card reads comfortably at desktop widths", async () => {
  for (const d of DESIGNS)
    for (const [width, height] of [[390, 844], [360, 740], [1280, 720], [1920, 1080]]) {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const label = `${d} ${width}x${height}`;
      try {
        await ctx.addCookies([{ name: "design", value: d, url: site.base }]);
        const page = await ctx.newPage();
        await page.goto(site.base + "/", { waitUntil: "load" });
        await page.waitForTimeout(800);
        for (const k of [0, 2, 4, 5, 7, 9]) {
          await jumpTo(page, k);
          await page.waitForTimeout(300);
          const r = await page.evaluate(() => {
            const fig = document.querySelector<HTMLElement>("#devline .dlr")!;
            const box = fig.querySelector<HTMLElement>(".dlr-obj .box")!;
            const sc = parseFloat(box.style.getPropertyValue("--sc")) || 1;
            const card = box.querySelector(".card")!.getBoundingClientRect();
            const gauge = fig.querySelector(".gauge")!.getBoundingClientRect();
            const shown = [...box.querySelectorAll<HTMLElement>(".card > .c")].find((c) => c.style.opacity === "1")!;
            const px = (sel: string) =>
              [...shown.querySelectorAll<HTMLElement>(sel)].filter((e) => e.textContent!.trim()).map((e) => Math.round(parseFloat(getComputedStyle(e).fontSize) * sc * 10) / 10); // screen px, to 0.1 (the scale is rounded)
            return {
              top: Math.min(card.top, gauge.top),
              bottom: Math.max(card.bottom, gauge.bottom),
              text: Math.min(99, ...px(".lane > b, .prow b, .sh, .req, .chk-l b, .done li, .opts p")),
              labels: Math.min(99, ...px(".st, .prow code, .ag, .path")),
            };
          });
          expect(r.top, `${label} stage ${k}: card and slider top`).toBeGreaterThanOrEqual(0);
          expect(r.bottom, `${label} stage ${k}: card and slider bottom`).toBeLessThanOrEqual(height);
          if (width >= 1280) {
            expect(r.text, `${label} stage ${k}: card text`).toBeGreaterThanOrEqual(14);
            expect(r.labels, `${label} stage ${k}: card labels`).toBeGreaterThanOrEqual(12);
          }
        }
      } finally {
        await ctx.close();
      }
    }
}, 400_000);

test("devline run: one scroll gesture moves one stage while pinned, and scroll is released at both ends", async () => {
  for (const d of DESIGNS)
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const label = `${d} ${width}`;
      try {
        await ctx.addCookies([{ name: "design", value: d, url: site.base }]);
        const page = await ctx.newPage();
        await page.goto(site.base + "/", { waitUntil: "load" });
        await page.waitForTimeout(800);
        await jumpTo(page, 0);
        await page.mouse.move(width / 2, height / 2);
        expect((await at(page)).stage, `${label} pinned at the first stage`).toBe(0);
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(1300);
        expect((await at(page)).stage, `${label} one notch`).toBe(1);
        // trackpad momentum: many small deltas in one gesture
        for (let i = 0; i < 15; i++) {
          await page.mouse.wheel(0, 6);
          await page.waitForTimeout(16);
        }
        await page.waitForTimeout(1300);
        expect((await at(page)).stage, `${label} burst`).toBe(2);
        await page.keyboard.press("PageDown");
        await page.waitForTimeout(1300);
        expect((await at(page)).stage, `${label} PageDown`).toBe(3);
        await page.mouse.wheel(0, -100);
        await page.waitForTimeout(900);
        expect((await at(page)).stage, `${label} back`).toBe(2);
        // the page sits at the stage's place
        const g = await geo(page);
        expect(Math.abs((await at(page)).y - (g.top0 + 2 * g.step)), `${label} scroll place`).toBeLessThan(3);
        // a jump (scrollbar, anchor) lands on that stage
        await jumpTo(page, 6, 10);
        expect((await at(page)).stage, `${label} jump`).toBe(6);
        // released below the last stage and above the first
        await jumpTo(page, 9);
        let y = (await at(page)).y;
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(600);
        expect((await at(page)).y - y, `${label} out at the bottom`).toBeGreaterThan(50);
        await jumpTo(page, 0);
        y = (await at(page)).y;
        await page.mouse.wheel(0, -100);
        await page.waitForTimeout(600);
        expect(y - (await at(page)).y, `${label} out at the top`).toBeGreaterThan(50);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${label} overflow`).toBeLessThanOrEqual(0);
      } finally {
        await ctx.close();
      }
    }
}, 240_000);

test("devline run: the map shows names and on/off symbols, no reasons; the end shows the whole graph", async () => {
  const v = runViz("en");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  try {
    await ctx.addCookies([{ name: "design", value: "keynote", url: site.base }]);
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.locator("#devline .dlr-obj .box").waitFor({ state: "attached" });
    const r = await page.evaluate(() => {
      const box = document.querySelector("#devline .dlr-obj .box")!;
      return {
        tags: [...box.querySelectorAll(".tg")].map((t) => ({ text: t.textContent!.trim(), off: t.classList.contains("no") })),
        labels: [...box.querySelectorAll(".map text")].map((t) => t.textContent),
        stills: document.querySelectorAll("#devline .dlr-shot .box").length,
      };
    });
    const names = [v.map.design, v.map.sec, v.map.bp, v.map.deep, v.map.perf, v.map.prep, `${v.map.route}${v.map.full}`];
    for (const t of r.tags) expect(names, t.text).toContain(t.text);
    expect(r.tags.filter((t) => t.off).map((t) => t.text).sort()).toEqual([v.map.perf, v.map.prep].sort());
    // routes not taken stay on the full graph
    for (const n of [v.map.quick, v.map.bug, v.map.merge, v.map.back]) expect(r.labels, n).toContain(n);
    expect(r.stills).toBeGreaterThan(0);
  } finally {
    await ctx.close();
  }
}, 60_000);
