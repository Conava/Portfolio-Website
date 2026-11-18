import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser } from "playwright-core";
import { launchBrowser } from "../scripts/shots";
import { assertBuilt, startSite, type Site } from "./helpers";

// The first bit of scrolling must not move the hero's content away or start the scroll-driven
// handover: a nudge, a collapsing address bar, scrolling just to see the whole hero.
let site: Site;
let browser: Browser;
beforeAll(async () => {
  assertBuilt();
  site = await startSite();
  browser = await launchBrowser();
}, 90_000);
afterAll(async () => {
  await browser?.close();
  await site?.stop();
});

const STEPS = [0, 40, 80, 120, 500]; // the last one is past the hold

/** Opens the homepage in `design`, then reads `probe` (a function source) and the h1's document top at each scroll step. */
async function steps(design: string, size: { width: number; height: number }, probe: string) {
  const ctx = await browser.newContext({ viewport: size });
  try {
    await ctx.addCookies([{ name: "design", value: design, url: site.base }]);
    const page = await ctx.newPage();
    // software WebGL: report a hardware renderer so Flow goes live
    await page.addInitScript(() => {
      const get = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function (p: number) {
        return p === 0x9246 ? "Test GPU" : get.call(this, p);
      };
    });
    // software WebGL is too slow for Flow's frame budget guard: hand it even frame times so it stays live
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      let ts = 0;
      window.requestAnimationFrame = (cb) => raf((now) => cb((ts = Math.min(now, ts + 16))));
    });
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const out: { h1: number; probe: string }[] = [];
    for (const y of STEPS) {
      await page.evaluate((y) => scrollTo(0, y), y);
      await page.waitForTimeout(400);
      // past the hold the probe must change; allow a slow (loaded, software-rendered) frame loop to catch up
      if (y === STEPS.at(-1) && design !== "thread")
        await page.waitForFunction((src) => String((0, eval)(`(${src})()`)) !== "0" && String((0, eval)(`(${src})()`)) !== "0.000", probe, { timeout: 8000 }).catch(() => {});
      out.push(
        await page.evaluate(
          (src) => ({
            h1: document.querySelector("h1")!.getBoundingClientRect().top + scrollY,
            probe: String((0, eval)(`(${src})()`)),
          }),
          probe,
        ),
      );
    }
    return out;
  } finally {
    await ctx.close();
  }
}

const sizes = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

for (const size of sizes) {
  test(`ink: the hero rests through a small scroll (${size.width}px)`, async () => {
    const r = await steps("keynote", size, `() => document.querySelector(".ink-ambient").dataset.carry`);
    for (const s of r.slice(0, 4)) {
      expect(Math.abs(s.h1 - r[0].h1)).toBeLessThan(1.5); // only the page's own scroll moves it
      expect(s.probe).toBe("0"); // the field has not been carried yet
    }
    expect(+r[4].probe).toBeGreaterThan(0);
  }, 60_000);

  // The lit line already rests until the first station reaches the reading line, hundreds of px down.
test(`trace: the line holds through a small scroll (${size.width}px)`, async () => {
    const r = await steps(
      "thread",
      size,
      `() => { const h = document.querySelector(".trace-head").getBoundingClientRect(); return Math.round(h.top + scrollY) + "," + Math.round(h.left); }`,
    );
    for (const s of r.slice(0, 4)) {
      expect(Math.abs(s.h1 - r[0].h1)).toBeLessThan(1.5);
      expect(s.probe).toBe(r[0].probe); // the head sits at the same place on the page
    }
  }, 60_000);

  test(`flow: the stream stays on the hero through a small scroll (${size.width}px)`, async () => {
    const r = await steps("flow", size, `() => document.querySelector("[data-flow]").dataset.pos`);
    for (const s of r.slice(0, 4)) {
      expect(Math.abs(s.h1 - r[0].h1)).toBeLessThan(1.5);
      expect(s.probe).toBe("0.000");
    }
    // one column: the handover is scroll-linked and has begun; two columns: the next form takes
    // over only past the middle of the gap between the beats, so the hero still holds
    if (size.width < 1200) expect(+r[4].probe).toBeGreaterThan(0);
    else expect(r[4].probe).toBe("0.000");
  }, 60_000);
}
