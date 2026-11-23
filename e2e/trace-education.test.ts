import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser } from "playwright-core";
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

// The pinned education frame is a titled scene: the heading lives in the sticky stage, so mid-pin it
// is still on screen above the half-revealed columns, and the section pad still measures at the
// heading's resting spot (the station keys and the trace do not read the pinned position).
test("trace: the education title stays in view while the stage is pinned", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    const pin = await page.evaluate(() => {
      const scene = document.querySelector<HTMLElement>('[data-scene="education"]')!;
      const h2 = document.querySelector<HTMLElement>("#education h2")!;
      const pin = h2.closest<HTMLElement>(".t-edu-pin")!;
      const top = scene.getBoundingClientRect().top + scrollY;
      window.scrollTo(0, top + (scene.offsetHeight - innerHeight) * 0.4);
      return { sticky: getComputedStyle(pin).position, inScene: scene.contains(h2) };
    });
    expect(pin).toEqual({ sticky: "sticky", inScene: true });
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>("#education h2")!.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, vh: innerHeight };
    });
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThan(r.vh / 2);
  } finally {
    await ctx.close();
  }
}, 60_000);

// The trace's ring is the 404/terminus mark: once the address was copied it stays filled.
test("trace: the contact ring stays filled after the first copy", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  try {
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: site.base });
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    const btn = page.locator(".t-contact .ce-btn");
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.waitForSelector(".t-contact [data-copied]");
    await page.waitForFunction(() => !document.querySelector(".t-contact [data-copied]"), null, { timeout: 5000 });
    expect(await page.locator(".terminus[data-filled]").count()).toBe(1);
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".terminus")!).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  } finally {
    await ctx.close();
  }
}, 60_000);

// j/k focuses the station heading; that must not drop the education pin (page height unchanged)
// and every station heading lands at header + 24.
for (const [w, h] of [[1440, 900], [1280, 720]] as const) {
  test(`trace: j keeps the education pin and lands headings at header+24 (${w}x${h})`, async () => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "no-preference" });
    try {
      const page = await ctx.newPage();
      await page.goto(site.base + "/", { waitUntil: "load" });
      await page.waitForTimeout(800);
      const sh0 = await page.evaluate(() => document.documentElement.scrollHeight);
      const hdr = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hdr")) || 0);
      let edu: { y: number; top: number } | undefined;
      for (let i = 0; i < 14 && !edu; i++) {
        await page.keyboard.press("j");
        await page.waitForTimeout(150);
        const r = await page.evaluate(() => {
          const a = document.activeElement as HTMLElement;
          return { y: scrollY, in: !!a.closest("#education"), top: a.getBoundingClientRect().top, sh: document.documentElement.scrollHeight };
        });
        expect(r.sh).toBe(sh0);
        if (r.in) edu = r;
        else expect(Math.abs(r.top - (hdr + 24))).toBeLessThan(2);
      }
      expect(edu).toBeDefined();
      expect(Math.abs(edu!.top - (hdr + 24))).toBeLessThan(2);
      expect(await page.evaluate(() => document.querySelector('[data-scene="education"]')!.hasAttribute("data-scene-disabled"))).toBe(false);
    } finally {
      await ctx.close();
    }
  }, 60_000);
}
