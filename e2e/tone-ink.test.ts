import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser } from "playwright-core";
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

test("reduced motion: ink follows the band at once (scene sets it, paper clears it)", async () => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    const center = (sel: string) => page.evaluate((s) => document.querySelector(s)!.scrollIntoView({ block: "center" }), sel);
    const hasInk = () => document.documentElement.dataset.toneInk !== undefined;
    await center(".ink-ftr");
    await page.waitForFunction(hasInk, null, { timeout: 2000 });
    await center("#about");
    await page.waitForFunction(() => !(document.documentElement.dataset.toneInk !== undefined), null, { timeout: 2000 });
    expect(await page.evaluate(hasInk)).toBe(false);
  } finally {
    await ctx.close();
  }
}, 60_000);
