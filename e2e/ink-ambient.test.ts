import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser, BrowserContextOptions } from "playwright-core";
import { launchBrowser } from "../scripts/shots";
import { assertBuilt, startSite, type Site } from "./helpers";

let site: Site;
let browser: Browser;
beforeAll(async () => {
  assertBuilt();
  site = await startSite({ DESIGN: "keynote" });
  browser = await launchBrowser();
}, 90_000);
afterAll(async () => {
  await browser?.close();
  await site?.stop();
});

async function withPage<T>(opts: BrowserContextOptions, fn: (page: import("playwright-core").Page) => Promise<T>) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    return await fn(page);
  } finally {
    await ctx.close();
  }
}

const ambient = () => document.documentElement.dataset.inkAmbient;
const canvas = () => {
  const c = document.querySelector<HTMLCanvasElement>(".ink-ambient")!;
  const s = getComputedStyle(c);
  return { display: s.display, opacity: Number(s.opacity), z: Number(s.zIndex) };
};

test("one ink field from the hero down: the same canvas at the top and in the body", async () => {
  await withPage({}, async (page) => {
    await page.waitForFunction(() => document.documentElement.dataset.inkAmbient === "live");
    expect(await page.evaluate(canvas)).toMatchObject({ display: "block", opacity: 1 });
    // The hero's own canvas stays (empty) for reduced motion and capture; no image with motion.
    expect(await page.locator("canvas.ink-canvas").count()).toBe(1);
    await page.evaluate(() => document.getElementById("about")!.scrollIntoView());
    expect(await page.evaluate(canvas)).toMatchObject({ display: "block", opacity: 1 });
  });
}, 60_000);

test("no WebGL2 with motion: the hero shows the pre-rendered image, the body the static blooms", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await ctx.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error narrowing the overloads is not worth it in a stub
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        return type === "webgl2" ? null : get.call(this, type, ...rest);
      };
    });
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.dataset.inkAmbient === "static");
    await page.waitForSelector(".ink-canvas--image");
  } finally {
    await ctx.close();
  }
}, 60_000);

test("the ambient ink stays visible on a scene band, above the scene ground", async () => {
  await withPage({}, async (page) => {
    await page.waitForFunction(() => document.documentElement.dataset.inkAmbient === "live");
    await page.evaluate(() => document.querySelector(".dux-player")!.scrollIntoView());
    await page.waitForFunction(() => document.documentElement.dataset.toneActive === "scene");
    const c = await page.evaluate(canvas);
    expect(c.display).toBe("block");
    expect(c.opacity).toBe(1);
    const ground = await page.evaluate(() => Number(getComputedStyle(document.body, "::after").zIndex));
    expect(c.z).toBeGreaterThan(ground);
  });
}, 60_000);

test("reduced motion: static blooms on the paper sections, no canvas", async () => {
  await withPage({ reducedMotion: "reduce" }, async (page) => {
    await page.waitForFunction(() => document.documentElement.dataset.inkAmbient === "static");
    expect((await page.evaluate(canvas)).display).toBe("none");
    const mask = await page.evaluate(() => getComputedStyle(document.getElementById("about")!, "::before").maskImage);
    expect(mask).toContain("bloom-1.webp");
  });
}, 60_000);

test("more contrast: no ambient ink at all", async () => {
  await withPage({ contrast: "more" }, async (page) => {
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(ambient)).toBeUndefined();
    expect((await page.evaluate(canvas)).display).toBe("none");
  });
}, 60_000);
