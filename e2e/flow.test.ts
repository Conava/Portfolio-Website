import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser, BrowserContextOptions, Page } from "playwright-core";
import { launchBrowser } from "../scripts/shots";
import { assertBuilt, get, startSite, type Site } from "./helpers";

let site: Site;
let browser: Browser;
beforeAll(async () => {
  assertBuilt();
  site = await startSite({ DESIGN: "flow" });
  browser = await launchBrowser();
}, 90_000);
afterAll(async () => {
  await browser?.close();
  await site?.stop();
});

/**
 * The test browser renders WebGL in software (SwiftShader), where Flow stays static on purpose.
 * `gpu` reports a hardware renderer name so the live and still paths run.
 */
async function withPage(opts: BrowserContextOptions, fn: (page: Page, errors: string[]) => Promise<void>, gpu = true) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  try {
    const page = await ctx.newPage();
    if (gpu)
      await page.addInitScript(() => {
        const get = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function (p: number) {
          return p === 0x9246 ? "Test GPU" : get.call(this, p);
        };
      });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await fn(page, errors);
  } finally {
    await ctx.close();
  }
}

const live = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live);
/** Opacity of the first text line of beat `k`. */
const textOpacity = (page: Page, k: number) =>
  page.evaluate((k) => +getComputedStyle(document.querySelector(`[data-beat="${k}"] .rv`)!).opacity, k);

test("flow: the subject goes live, and a beat's text appears once it is scrolled to", async () => {
  // Small viewport: software rendering is slow, and the frame budget guard would switch to stills
  // after about 30 frames.
  await withPage({ viewport: { width: 800, height: 600 } }, async (page, errors) => {
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live === "on");
    expect(await page.locator(".fl-gl").isVisible()).toBe(true);
    const inAt = () => page.evaluate(() => document.querySelector('[data-beat="6"]')!.classList.contains("in"));
    expect(await inAt()).toBe(false);
    await page.evaluate(() => document.getElementById("bpmnscript")!.scrollIntoView());
    await page.waitForFunction(() => document.querySelector('[data-beat="6"]')!.classList.contains("in"), null, { timeout: 10_000 });
    await page.waitForTimeout(1200);
    expect(await textOpacity(page, 6)).toBe(1);
    expect(errors).toEqual([]);
  });
}, 60_000);

/**
 * Walks the page in half-screen steps (with every detail panel open) and, at each step, reads the
 * frame the scene has just drawn. A form may meet the text at its edges, so the check is legibility:
 * at every sampled point of every line of text, the text colour against the canvas (over the page
 * ground) must keep 4.5:1; links and buttons must have nothing drawn under them at all. Returns the
 * failures and how many steps showed a form.
 */
/**
 * Software WebGL is too slow for the live path's frame budget: hand it even frame times, so the
 * subject stays live. Layout, not frame rate, decides where the form is drawn.
 */
const evenFrames = (page: Page, ms = 16) =>
  page.addInitScript((ms) => {
    const raf = window.requestAnimationFrame.bind(window);
    let ts = 0;
    window.requestAnimationFrame = (cb) => raf((now) => cb((ts = Math.min(now, ts + ms))));
  }, ms);

async function coverage(page: Page) {
  await evenFrames(page);
  await page.goto(site.base + "/", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live === "on");
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('[data-flow] button[aria-expanded="false"]').forEach((b) => b.click()));
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // panels open and the text settles before the walk
  await page.waitForTimeout(800);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const step = (page.viewportSize()!.height / 2) | 0;
  const found: string[] = [];
  let drawnAt = 0;
  for (let y = 0; y <= max + step - 1; y += step) {
    await page.evaluate((y) => scrollTo(0, y), Math.min(y, max));
    await frames();
    await frames();
    const r = await page.evaluate(
      () =>
        new Promise<{ out: string[]; lit: number }>((resolve) => {
          const root = document.querySelector<HTMLElement>("[data-flow]")!;
          // read in the frame event: the drawing buffer is only valid until the frame is shown
          root.addEventListener(
            "flowframe",
            () => {
              const gl = root.querySelector<HTMLCanvasElement>(".fl-gl")!.getContext("webgl2")!;
              const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, k = w / innerWidth;
              const px = new Uint8Array(w * h * 4);
              gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
              const idx = (x: number, y: number) => ((h - 1 - Math.floor(y * k)) * w + Math.floor(x * k)) * 4;
              let lit = 0;
              for (let i = 3; i < px.length; i += 4 * 7) if (px[i] > 8) lit++;
              const lum = (c: number[]) => {
                const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
                return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
              };
              const BG = [11, 11, 13];
              // the canvas (premultiplied) over the page ground at a point
              const under = (x: number, y: number) => {
                const i = idx(x, y), a = px[i + 3] / 255;
                return [px[i] + BG[0] * (1 - a), px[i + 1] + BG[1] * (1 - a), px[i + 2] + BG[2] * (1 - a)];
              };
              const name = (e: Element) => `${e.tagName.toLowerCase()} "${(e.textContent ?? "").trim().slice(0, 40)}" at ${scrollY}`;
              const each = (r: DOMRect, fn: (x: number, y: number) => boolean) => {
                const x1 = Math.min(innerWidth - 1, r.right), y1 = Math.min(innerHeight - 1, r.bottom);
                for (let y = Math.max(0, r.top); y <= y1; y += 3) for (let x = Math.max(0, r.left); x <= x1; x += 3) if (fn(x, y)) return true;
                return false;
              };
              const out: string[] = [];
              const range = document.createRange();
              for (const e of root.querySelectorAll(".fl-head, .fl-body, .fl-hero-foot")) {
                const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
                for (let n = tw.nextNode(); n; n = tw.nextNode()) {
                  const el = n.parentElement!;
                  // a filled button carries its own ground; visually hidden text is never drawn
                  if (!n.textContent!.trim() || el.closest(".btn-primary, .sr-only") || !el.checkVisibility({ opacityProperty: true })) continue;
                  const lt = lum(getComputedStyle(el).color.match(/\d+(\.\d+)?/g)!.map(Number));
                  range.selectNodeContents(n);
                  for (const r of range.getClientRects())
                    if (r.width > 0 && each(r, (x, y) => (lt + 0.05) / (lum(under(x, y)) + 0.05) < 4.5)) {
                      out.push(`text ${name(el)}`);
                      break;
                    }
                }
              }
              for (const e of document.querySelectorAll("[data-flow] :is(a, button, input, summary), .fl-hdr :is(a, button)")) {
                const r = e.getBoundingClientRect();
                if (r.width > 0 && r.height > 0 && each(r, (x, y) => Math.max(...px.subarray(idx(x, y), idx(x, y) + 4)) > 24)) out.push(`control ${name(e)}`);
              }
              resolve({ out, lit });
            },
            { once: true },
          );
        }),
    );
    found.push(...r.out);
    if (r.lit > 300) drawnAt++;
  }
  return { found, drawnAt };
}

for (const [w, h] of [
  [2560, 1440],
  [1920, 1080],
  [1440, 900],
  [1024, 768],
  [375, 812],
]) {
  test(`flow at ${w}: text stays legible over the forms, links and buttons are never covered, panels open`, async () => {
    await withPage({ viewport: { width: w, height: h } }, async (page, errors) => {
      const r = await coverage(page);
      expect(r.drawnAt).toBeGreaterThan(10);
      expect(r.found).toEqual([]);
      expect(errors).toEqual([]);
    });
  }, 120_000);
}

test("flow at 1440: big headlines, large text beside a smaller form column, the sides alternate, the schools are labelled", async () => {
  await withPage({}, async (page) => {
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live === "on");
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-beat]")].map((b) => {
        const st = b.querySelector("[data-stage]")!.getBoundingClientRect();
        const tx = b.querySelector(".fl-body, .fl-hero-foot")!.getBoundingClientRect();
        const hl = b.querySelector(".fl-hl");
        return { st: [st.left, st.right, st.top, st.bottom], tx: [tx.left, tx.right, tx.top, tx.bottom], hl: hl ? parseFloat(getComputedStyle(hl).fontSize) : 0 };
      }),
    );
    const [, ...beats] = boxes.slice(0, 9);
    const contact = boxes[10];
    beats.forEach((b, i) => {
      // odd beats (about, the current job, education, Dux): text left, form right; even beats the other way
      if (i % 2 === 0) expect(b.st[0]).toBeGreaterThanOrEqual(b.tx[1]);
      else expect(b.st[1]).toBeLessThanOrEqual(b.tx[0]);
      // the text column is a large, readable measure; the form column beside it is still the wider one
      expect(b.st[1] - b.st[0]).toBeGreaterThan(1.2 * (b.tx[1] - b.tx[0]));
      expect(b.tx[1] - b.tx[0]).toBeGreaterThanOrEqual(30 * 16);
      expect(b.tx[1] - b.tx[0]).toBeLessThanOrEqual(44 * 16);
      // a form column on the right stops short of the rail
      if (i % 2 === 0) expect(b.st[1]).toBeLessThanOrEqual(1440 - 100);
    });
    // every section headline is set large (the current job has its wordmark); the migration has its own, smaller one
    for (const k of [1, 2, 5, 6, 7, 8]) expect(boxes[k].hl).toBeGreaterThanOrEqual(96);
    expect(boxes[4].hl).toBeGreaterThanOrEqual(44);
    // the migration's text steps each take most of a screen
    const steps = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-beat="4"] .fl-step')].map((s) => s.offsetHeight));
    expect(steps).toHaveLength(2);
    for (const h of steps) expect(h).toBeGreaterThan(500);
    // education: each school's label stands on its piece of the form while the beat is read
    await page.evaluate(() => {
      const i = document.querySelector('[data-beat="5"] .fl-inner')!;
      scrollTo(0, i.getBoundingClientRect().top + scrollY - 80);
    });
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('[data-beat="5"] [data-label]')].every((l) => getComputedStyle(l).visibility === "visible" && +getComputedStyle(l).opacity > 0.9), null, { timeout: 10_000 });
    const labs = await page.evaluate(() => {
      const st = document.querySelector('[data-beat="5"] [data-stage]')!.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>('[data-beat="5"] [data-label]')].map((l) => {
        const r = l.getBoundingClientRect();
        return r.left >= st.left - 1 && r.right <= 1440 && r.top >= st.top - 40 && r.bottom <= 900;
      });
    });
    expect(labs).toEqual([true, true, true]);
    // contact: the stage is the whole section, the text sits in its middle (the ring frames it)
    const mid = (contact.tx[0] + contact.tx[1]) / 2;
    expect(contact.st[0] < mid && mid < contact.st[1] && contact.st[2] < contact.tx[2] && contact.tx[3] < contact.st[3]).toBe(true);
  });
}, 60_000);

for (const [w, h] of [
  [1920, 1080],
  [2560, 1440],
]) {
  test(`flow at ${w}: the split holds (text at its own side, one form beside it), marks fit the text column, the form follows the scroll a little at a time`, async () => {
    await withPage({ viewport: { width: w, height: h } }, async (page) => {
      await evenFrames(page, 33);
      await page.goto(site.base + "/", { waitUntil: "load" });
      // poll by timer: rAF polling would add frames of its own to the scene's frame clock
      const poll = { polling: 250, timeout: 45_000 };
      await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live === "on", null, poll);
      const r = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("[data-beat][data-at]")].map((b) => {
          const st = b.querySelector("[data-stage]")!.getBoundingClientRect();
          const tx = b.querySelector(".fl-body")!.getBoundingClientRect();
          const marks = [...b.querySelectorAll<HTMLImageElement>(".fl-wm img")].map((i) => i.getBoundingClientRect().width);
          return { at: b.dataset.at, st: [st.left, st.right], tx: [tx.left, tx.right], marks, end: b.getBoundingClientRect().bottom + scrollY };
        }),
      );
      expect(r).toHaveLength(8);
      for (const b of r) {
        // the text keeps to the outer quarter of its side; the form column is on the other side
        if (b.at === "r") {
          expect(b.tx[0]).toBeLessThan(w * 0.1);
          expect(b.st[0]).toBeGreaterThanOrEqual(b.tx[1]);
        } else {
          expect(b.tx[1]).toBeGreaterThan(w * 0.9);
          expect(b.st[1]).toBeLessThanOrEqual(b.tx[0]);
        }
        for (const m of b.marks) expect(m).toBeLessThanOrEqual(b.tx[1] - b.tx[0]);
      }
      // through the gap after the first beat the form changes in step with the scroll: it never snaps to
      // the next beat, a small scroll moves it a little, and it gets there
      const pos = () => page.evaluate(() => +document.querySelector<HTMLElement>("[data-flow]")!.dataset.pos!);
      const seen: number[] = [];
      for (let y = r[0].end - h; y <= r[0].end + h * 0.6; y += 80) {
        await page.evaluate((y) => scrollTo(0, y), y);
        // the form eases to the scroll position in a few hundred ms; wait until it holds still
        let a = await pos(), b2 = a;
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(250);
          b2 = await pos();
          if (Math.abs(b2 - a) < 0.005) break;
          a = b2;
        }
        seen.push(b2);
      }
      for (let i = 1; i < seen.length; i++) {
        expect(seen[i] - seen[i - 1], `step ${i}: ${seen.join(" ")}`).toBeGreaterThanOrEqual(-0.01);
        expect(seen[i] - seen[i - 1], `step ${i}: ${seen.join(" ")}`).toBeLessThan(0.35);
      }
      expect(seen[seen.length - 1] - seen[0]).toBeGreaterThan(0.9);
    });
  }, 150_000);
}

test("flow: in the pinned beat the step being read is marked as the form changes", async () => {
  await withPage({}, async (page) => {
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live === "on");
    const reading = async (i: number) => {
      await page.evaluate((i) => {
        const s = document.querySelectorAll<HTMLElement>('[data-beat="4"] .fl-step')[i];
        scrollTo(0, s.getBoundingClientRect().top + scrollY - innerHeight * 0.3);
      }, i);
      await page.waitForFunction((i) => document.querySelectorAll('[data-beat="4"] .fl-step')[i].hasAttribute("data-reading"), i, { timeout: 10_000 });
    };
    await reading(0);
    await reading(1);
    expect(await page.evaluate(() => document.querySelectorAll('[data-beat="4"] .fl-step')[0].hasAttribute("data-reading"))).toBe(false);
  });
}, 60_000);

test("flow: the migration beat is headed as the migration I lead, in both languages", async () => {
  for (const [path, text] of [["/", "The migration I lead"], ["/de", "Die Migration, die ich leite"]]) {
    const html = await (await get(site, path)).text();
    expect(html).toMatch(new RegExp(`data-beat="4"[^]*?<h4 class="fl-hl">${text}</h4>`));
  }
});

test("flow at 1440: the projects form is the devline run: the figure shows its card beside it, the caption of the stage shown stands at its station, and the Final gate stays lit at the last stage", async () => {
  await withPage({}, async (page, errors) => {
    await evenFrames(page);
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live === "on");
    // the figure draws its card and slider alone (the form is the route); its own caption is for assistive tech
    await page.waitForFunction(() => document.querySelector<HTMLElement>("#devline .dlr")?.dataset.lay === "cd", null, { timeout: 10_000 });
    expect(await page.evaluate(() => document.querySelector("#devline .dlr-capcol")!.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    const stage = async (k: number, extra = 0) => {
      await page.evaluate(
        ([k, extra]) => {
          const s = document.querySelector<HTMLElement>("#devline .dlr-scene")!, pin = document.querySelector<HTMLElement>("#devline .dlr-pin")!;
          const top0 = s.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(pin).top) || 0);
          scrollTo(0, top0 + (k * (s.offsetHeight - pin.offsetHeight)) / 9 + extra);
        },
        [k, extra],
      );
      await page.waitForFunction((k) => document.querySelector(`[data-beat="8"] [data-label="${100 + k}"]`)?.hasAttribute("data-on"), k, { timeout: 15_000 });
      return page.evaluate(() => ({
        names: [...document.querySelectorAll('[data-beat="8"] [data-label][data-on]:not([data-cap])')].map((l) => l.textContent),
        caps: [...document.querySelectorAll('[data-beat="8"] [data-cap][data-on] b')].map((l) => l.textContent),
      }));
    };
    expect(await stage(2)).toEqual({ names: ["Brainstorm"], caps: ["Brainstorm"] });
    expect(await stage(5)).toEqual({ names: ["Implement"], caps: ["Implement"] });
    // a scroll that lands a little past the last stage's place still shows the Final gate lit
    expect(await stage(9, 3)).toEqual({ names: ["Final gate"], caps: ["Final gate"] });
    expect(errors).toEqual([]);
  });
}, 90_000);

test("flow at 1440: after the devline run the other projects get the whole width, with only a few blocks at the window's edges", async () => {
  await withPage({}, async (page) => {
    await evenFrames(page);
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live === "on");
    const width = await page.evaluate(() => document.querySelector('[data-beat="9"] .fl-body')!.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(1440 * 0.7);
    await page.evaluate(() => scrollTo(0, document.querySelector('[data-beat="9"]')!.getBoundingClientRect().top + scrollY));
    await page.waitForFunction(() => Math.abs(+document.querySelector<HTMLElement>("[data-flow]")!.dataset.pos! - 9) < 0.02, null, { polling: 250, timeout: 20_000 });
    // what the scene draws stays in the outer strips of the window
    const r = await page.evaluate(
      () =>
        new Promise<{ mid: number; edge: number }>((resolve) => {
          const root = document.querySelector<HTMLElement>("[data-flow]")!;
          root.addEventListener(
            "flowframe",
            () => {
              const gl = root.querySelector<HTMLCanvasElement>(".fl-gl")!.getContext("webgl2")!;
              const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
              gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
              let mid = 0, edge = 0;
              for (let y = 0; y < h; y += 3)
                for (let x = 0; x < w; x += 3) if (px[(y * w + x) * 4 + 3] > 8) (x > w * 0.12 && x < w * 0.88 ? mid++ : edge++);
              resolve({ mid, edge });
            },
            { once: true },
          );
        }),
    );
    expect(r.mid).toBe(0);
    expect(r.edge).toBeGreaterThan(0);
  });
}, 90_000);

test("flow: a lost WebGL context leaves the static page", async () => {
  await withPage({}, async (page) => {
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live === "on");
    await page.evaluate(() => {
      const gl = document.querySelector<HTMLCanvasElement>(".fl-gl")!.getContext("webgl2");
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    });
    await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live === "off");
    expect(await page.locator(".fl-gl").isVisible()).toBe(false);
    expect(await textOpacity(page, 8)).toBe(1);
    const stageH = await page.evaluate(() => document.querySelector<HTMLElement>('[data-beat="3"] [data-stage]')!.offsetHeight);
    expect(stageH).toBe(0);
  });
}, 60_000);

test("flow: a software renderer gets the static page without loading three.js", async () => {
  await withPage(
    {},
    async (page) => {
      const scripts: string[] = [];
      page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
      await page.goto(site.base + "/", { waitUntil: "load" });
      await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live === "off");
      await page.waitForTimeout(500);
      expect(await page.locator(".fl-gl").isVisible()).toBe(false);
      expect(await textOpacity(page, 8)).toBe(1);
      const three = await Promise.all(scripts.map(async (u) => (await (await fetch(u)).text()).includes("MeshPhysicalMaterial")));
      expect(three.some(Boolean)).toBe(false);
    },
    false,
  );
}, 60_000);

test("flow: reduced motion shows one still per beat and all text, no live canvas", async () => {
  await withPage({ reducedMotion: "reduce" }, async (page, errors) => {
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-flow]")?.dataset.live === "still");
    await page.waitForFunction(() => document.querySelectorAll("[data-stage] > img").length === 10);
    expect(await page.locator(".fl-gl").isVisible()).toBe(false);
    for (const k of [1, 5, 9]) expect(await textOpacity(page, k)).toBe(1);
    // every still takes room, including the hero's absolutely positioned stage
    const heights = await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>("[data-stage] > img")].map((i) => i.offsetHeight));
    expect(heights).toHaveLength(10);
    expect(heights.every((h) => h > 0)).toBe(true);
    expect(errors).toEqual([]);
  });
}, 60_000);

test("flow: without JS stages take no room and the text moves into the first column", async () => {
  await withPage({ javaScriptEnabled: false }, async (page) => {
    await page.goto(site.base + "/de", { waitUntil: "load" });
    const r = await page.evaluate(() => ({
      stages: [...document.querySelectorAll<HTMLElement>("[data-stage]")].map((s) => s.offsetHeight),
      left: document.querySelector('[data-beat="2"] .fl-body')!.getBoundingClientRect().left,
      h1: document.querySelector("h1")!.textContent,
      // beats whose headline overlaps their text (the projects after the devline run have no headline)
      overlap: [...document.querySelectorAll<HTMLElement>(".fl-beat:has(> .fl-inner > .fl-head)")]
        .filter((b) => b.querySelector(".fl-head")!.getBoundingClientRect().bottom > b.querySelector(".fl-body")!.getBoundingClientRect().top)
        .map((b) => b.dataset.beat),
    }));
    expect(r.overlap).toEqual([]);
    expect(r.stages.every((h) => h === 0)).toBe(true);
    expect(r.left).toBeLessThan(200);
    expect(r.h1).toBe("Marlon Kranz");
  });
}, 60_000);

test("design toggle with four designs: the icon steps on, the footer lists all", async () => {
  const html = await (await get(site, "/")).text();
  expect(html).toContain('data-design="flow"');
  // The header icon goes to the next design (Type), the footer offers every other one.
  expect(html).toMatch(/<header class="fl-hdr"[^]*?href="\?design=type"[^]*?<\/header>/);
  const footer = html.match(/<footer[^]*?<\/footer>/)![0];
  for (const d of ["keynote", "thread", "type"]) expect(footer).toContain(`href="?design=${d}"`);
  expect(footer).not.toContain('href="?design=flow"');
});

test("type renders with its own styling", async () => {
  const res = await get(site, "/", { Cookie: "design=type" });
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('data-design="type"');
  expect(html).toContain('id="contact"');
  await withPage({}, async (page) => {
    await page.context().addCookies([{ name: "design", value: "type", url: site.base }]);
    await page.goto(site.base + "/", { waitUntil: "load" });
    // Type's UI face is Archivo (src/styles/type.css); Ink and Flow use other faces.
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font).toMatch(/archivo/i);
  });
}, 60_000);
