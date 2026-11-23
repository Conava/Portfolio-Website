import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser, BrowserContextOptions, Page } from "playwright-core";
import { launchBrowser } from "../scripts/shots";
import { assertBuilt, startSite, type Site } from "./helpers";

let site: Site;
let browser: Browser;
beforeAll(async () => {
  assertBuilt();
  site = await startSite({ DESIGN: "type" });
  browser = await launchBrowser();
}, 90_000);
afterAll(async () => {
  await browser?.close();
  await site?.stop();
});

async function withPage<T>(opts: BrowserContextOptions, fn: (page: Page) => Promise<T>, wait = true) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/", { waitUntil: "load" });
    if (wait) await page.waitForFunction(() => document.querySelector("[data-ty-facade][data-ready]"));
    return await fn(page);
  } finally {
    await ctx.close();
  }
}

const toEnd = (page: Page) =>
  page.evaluate(async () => {
    scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    await new Promise((r) => setTimeout(r, 400));
  });

test("type: after scrolling to the end the h1, every facade h2 and the hero CTAs stay in the accessibility tree", async () => {
  await withPage({}, async (page) => {
    const words = await page.evaluate(() => [...document.querySelectorAll("[data-ty-word]")].map((e) => [e.tagName, e.textContent!]));
    expect(words.filter(([t]) => t === "H1").length).toBe(1);
    expect(words.filter(([t]) => t === "H2").length).toBeGreaterThanOrEqual(6);
    await toEnd(page);
    expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);
    for (const [, text] of words) expect(await page.getByRole("heading", { name: text, exact: true }).count(), text).toBeGreaterThan(0);
    // The facade itself is not hidden, only its paint.
    expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-ty-facade]")].filter((f) => getComputedStyle(f).visibility === "hidden").length)).toBe(0);
    // A hero CTA is focusable and brings the page back to the hero.
    await page.locator("a[href='/resume.pdf']").first().focus();
    expect(await page.evaluate(() => document.activeElement?.getAttribute("href"))).toBe("/resume.pdf");
    expect(await page.evaluate(() => scrollY)).toBeLessThan(900);
  });
}, 60_000);

test("type: data-ty-mode is static under reduced motion and live otherwise", async () => {
  await withPage({ reducedMotion: "reduce" }, async (page) => {
    expect(await page.evaluate(() => document.documentElement.dataset.tyMode)).toBe("static");
  });
  await withPage({ reducedMotion: "no-preference" }, async (page) => {
    expect(await page.evaluate(() => document.documentElement.dataset.tyMode)).toBe("live");
  });
}, 60_000);

test("type: the contact card is unobscured at rest and at the end of the page, with the closing name under it", async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    await withPage({ viewport }, async (page) => {
      const probe = () =>
        page.evaluate(() => {
          const a = document.querySelector<HTMLElement>("#contact .ce-btn")!;
          const r = a.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          const end = document.querySelector<HTMLElement>("#contact .ty-end [data-ty-facade]")!;
          const er = end.getBoundingClientRect();
          return {
            visible: r.top >= 0 && r.bottom <= innerHeight && r.width > 0,
            hit: !!hit && a.contains(hit),
            endOff: end.dataset.off !== undefined,
            endShown: getComputedStyle(end.parentElement!).visibility === "visible",
            endInView: er.top < innerHeight && er.bottom > 0,
            endClear: er.top >= document.querySelector("#contact .ty-links")!.getBoundingClientRect().bottom,
          };
        });
      await page.waitForFunction(() => document.querySelectorAll("#contact [data-ty-facade][data-ready]").length === 2);
      // Where the card has landed and rests (the flight's rest scroll).
      await page.evaluate(async () => {
        const room = document.querySelector<HTMLElement>("#contact")!;
        const end = room.getBoundingClientRect().top + scrollY + room.offsetHeight - innerHeight;
        scrollTo({ top: end - innerHeight * 0.45, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 500));
      });
      const mid = await probe();
      expect(mid).toMatchObject({ visible: true, hit: true, endShown: true });
      await toEnd(page);
      const end = await probe();
      expect(end).toEqual({ visible: true, hit: true, endOff: false, endShown: true, endInView: true, endClear: true });
    });
  }
}, 90_000);

test("type: the room label shows once the flight lands, and a job panel is fully open where it rests", async () => {
  await withPage({ reducedMotion: "no-preference" }, async (page) => {
    const state = (frac: number) =>
      page.evaluate(async (frac) => {
        const room = document.getElementById("work")!;
        const stage = room.querySelector<HTMLElement>(".ty-stage")!;
        const end = room.getBoundingClientRect().top + scrollY + room.offsetHeight - stage.offsetHeight;
        const start = room.getBoundingClientRect().top + scrollY;
        scrollTo({ top: start + (end - start) * frac, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 700));
        const tag = room.querySelector<HTMLElement>(".ty-tag span")!;
        const panel = room.querySelector<HTMLElement>(".ty-job-panel")!;
        const r = tag.getBoundingClientRect();
        const wrap = room.querySelector<HTMLElement>(".ty-wrap")!.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        const hit = document.elementFromPoint(p.right - 30, p.top + 30);
        return {
          opacity: getComputedStyle(tag.parentElement!).opacity,
          text: tag.textContent,
          inGutter: r.right <= wrap.left + parseFloat(getComputedStyle(room.querySelector(".ty-wrap")!).paddingLeft) + 1,
          panelOpen: !!hit && panel.contains(hit),
        };
      }, frac);
    expect((await state(0.3)).opacity).toBe("0");
    const landed = await state(1);
    expect(landed).toMatchObject({ opacity: "1", inGutter: true, panelOpen: true });
    expect(landed.text).toMatch(/01\s*Work/i);
  });
}, 60_000);

test("type: without JS the facades stack above their rooms", async () => {
  await withPage(
    { javaScriptEnabled: false },
    async (page) => {
      expect(await page.evaluate(() => document.documentElement.dataset.tyMode)).toBeUndefined();
      const r = await page.evaluate(() => {
        const stage = document.querySelector<HTMLElement>(".ty-stage")!;
        const f = stage.querySelector<HTMLElement>(".ty-facade")!.getBoundingClientRect();
        const i = stage.querySelector<HTMLElement>("[data-ty-in]")!.getBoundingClientRect();
        return { pos: getComputedStyle(stage).position, fBottom: f.bottom, iTop: i.top };
      });
      expect(r.pos).toBe("static");
      expect(r.fBottom).toBeLessThanOrEqual(r.iTop + 1);
    },
    false,
  );
}, 60_000);

test("type: focus inside a room scrolls past its flight", async () => {
  await withPage({ reducedMotion: "no-preference" }, async (page) => {
    await page.locator("#work a").first().focus();
    const r = await page.evaluate(() => {
      const room = document.getElementById("work")!;
      const stage = room.querySelector<HTMLElement>(".ty-stage")!;
      return { y: scrollY, end: room.getBoundingClientRect().top + scrollY + room.offsetHeight - stage.offsetHeight };
    });
    expect(r.y).toBeGreaterThanOrEqual(r.end - 2);
  });
}, 60_000);

test("type: with motion, client-side 'back to projects' lands on #projects", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  try {
    const page = await ctx.newPage();
    await page.goto(site.base + "/projects/chess-engine?from=home", { waitUntil: "load" });
    await page.click('a[href="/#projects"]');
    await page.waitForFunction(() => location.hash === "#projects" && document.querySelector("[data-ty-facade][data-ready]"));
    await page.waitForTimeout(1000);
    const top = await page.evaluate(() => document.getElementById("projects")!.getBoundingClientRect().top);
    expect(Math.abs(top), `#projects top ${top}`).toBeLessThan(120);
    // The first Tab after landing is not painted over by a facade word.
    await page.keyboard.press("Tab");
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const covered = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return "no focus";
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el === hit || el.contains(hit) ? "" : `blocked by ${(hit as HTMLElement | null)?.className}`;
    });
    expect(covered).toBe("");
  } finally {
    await ctx.close();
  }
}, 60_000);

/** Scrolls to `frac` of the Work flight; where its first "Read more" is and whether the eye sees it. */
const workTrigger = (page: Page, frac: number) =>
  page.evaluate(async (frac) => {
    const room = document.getElementById("work")!;
    const stage = room.querySelector<HTMLElement>(".ty-stage")!;
    const start = room.getBoundingClientRect().top + scrollY;
    const end = start + room.offsetHeight - stage.offsetHeight;
    scrollTo({ top: start + (end - start) * frac, behavior: "instant" });
    // The flight eases behind the scroll: wait until the wall and the room hold still for 5 frames.
    const pose = () => {
      const f = room.querySelector<HTMLElement>("[data-ty-ann]")!.style;
      return `${f.transform}|${f.opacity}|${room.querySelector<HTMLElement>("[data-ty-in]")!.style.transform}`;
    };
    for (let same = 0, last = "", t0 = performance.now(); same < 5 && performance.now() - t0 < 10_000; ) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = pose();
      same = now === last ? same + 1 : 0;
      last = now;
    }
    const b = room.querySelector<HTMLElement>(".dp-trigger")!.getBoundingClientRect();
    const x = b.left + b.width / 2,
      y = b.top + b.height / 2;
    // Visible = in the viewport and not painted over by the facade (its canvas is clear there).
    const f = room.querySelector<HTMLElement>("[data-ty-facade]")!;
    const cv = f.querySelector("canvas")!;
    let alpha = 0;
    if (f.dataset.off === undefined && cv.width) {
      const r = cv.getBoundingClientRect();
      const k = cv.width / r.width;
      alpha = cv.getContext("2d")!.getImageData(Math.round((x - r.left) * k), Math.round((y - r.top) * k), 1, 1).data[3];
    }
    return { x, y, visible: y > 0 && y < innerHeight && alpha === 0 };
  }, frac);
const workState = (page: Page) => page.evaluate(() => document.querySelector("#work .dp-region")!.getAttribute("data-state"));

test("type: a visible Work 'Read more' opens wherever it is clicked, mid-flight included; the wall itself is not clickable", async () => {
  await withPage({ reducedMotion: "no-preference" }, async (page) => {
    let seen = 0;
    for (const frac of [0.4, 0.6, 0.7, 0.8, 0.95, 1, 1.2]) {
      const t = await workTrigger(page, frac);
      if (!t.visible) continue;
      seen++;
      await page.mouse.click(t.x, t.y);
      await page.waitForFunction(() => document.querySelector("#work .dp-region")!.getAttribute("data-state") !== "closed", null, { timeout: 3000 }).catch(() => {});
      expect(await workState(page), `frac ${frac}`).toBe("open");
      await page.mouse.click(t.x, t.y);
      await page.waitForFunction(() => document.querySelector("#work .dp-region")!.getAttribute("data-state") === "closed", null, { timeout: 5000 }).catch(() => {});
      expect(await workState(page)).toBe("closed");
    }
    // Mid-flight positions count, not only the landed room.
    expect(seen).toBeGreaterThanOrEqual(5);
    // A press on the opaque wall does not reach the room hidden behind it.
    await workTrigger(page, 0.4);
    const wall = await page.evaluate(() => {
      const cv = document.querySelector<HTMLCanvasElement>("#work [data-ty-facade] canvas")!;
      const r = cv.getBoundingClientRect();
      const k = cv.width / r.width;
      const ctx = cv.getContext("2d")!;
      for (const l of document.querySelectorAll<HTMLElement>("#work [data-ty-in] :is(a, button)")) {
        const b = l.getBoundingClientRect();
        const x = b.left + b.width / 2,
          y = b.top + b.height / 2;
        if (y < 0 || y > innerHeight || x < 0 || x > innerWidth || !b.width) continue;
        if (ctx.getImageData(Math.round((x - r.left) * k), Math.round((y - r.top) * k), 1, 1).data[3] === 255) return { x, y };
      }
      return null;
    });
    expect(wall).not.toBeNull();
    const before = await page.evaluate(() => location.href);
    await page.mouse.click(wall!.x, wall!.y);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => location.href)).toBe(before);
    expect(await workState(page)).toBe("closed");
  });
}, 90_000);

test("type: opening a Work panel keeps its button in place and shows the panel; closing keeps Work on screen", async () => {
  await withPage({ reducedMotion: "no-preference" }, async (page) => {
    for (const at of [160, 420]) {
      await workTrigger(page, 1);
      await page.evaluate((at) => {
        const b = document.querySelector<HTMLElement>("#work .dp-trigger")!;
        scrollBy({ top: b.getBoundingClientRect().top - at, behavior: "instant" });
      }, at);
      await page.waitForTimeout(400);
      const box = (await page.locator("#work .dp-trigger").first().boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(900);
      const open = await page.evaluate(() => {
        const b = document.querySelector<HTMLElement>("#work .dp-trigger")!.getBoundingClientRect();
        const first = document.querySelector<HTMLElement>("#work .dp-region .dp-body > *")!.getBoundingClientRect();
        return { top: b.top, first: first.top, h: innerHeight };
      });
      expect(Math.abs(open.top - box.y), `button moved from ${box.y} to ${open.top}`).toBeLessThan(8);
      expect(open.first).toBeGreaterThan(0);
      expect(open.first).toBeLessThan(open.h - 40);
      await page.mouse.click(box.x + box.width / 2, open.top + box.height / 2);
      await page.waitForTimeout(900);
      const closed = await page.evaluate(() => {
        const r = document.getElementById("work")!.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, h: innerHeight, state: document.querySelector("#work .dp-region")!.getAttribute("data-state") };
      });
      expect(closed.state).toBe("closed");
      expect(closed.top).toBeLessThan(closed.h * 0.5);
      expect(closed.bottom).toBeGreaterThan(closed.h * 0.5);
    }
  });
}, 90_000);

/**
 * Scrolls through the first two flights (hero and Work) in 8 px steps and samples, per step, the
 * box of each room and of its facade word while on screen. Each edge and width must move one way
 * only (1 px jitter allowed). Until the hero's hold is used up nothing moves.
 */
async function sampleFlights(page: Page) {
  await page.waitForFunction(() => ["top", "work"].every((id) => document.querySelector(`#${id} [data-ty-facade][data-ready]`)));
  return page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const work = document.getElementById("work")!;
    const until = work.getBoundingClientRect().top + scrollY + work.offsetHeight;
    const out: Record<string, { y: number; top: number; left: number; width: number }[]> = {};
    const add = (k: string, y: number, r: DOMRect) => (out[k] ??= []).push({ y, top: r.top, left: r.left, width: r.width });
    for (let y = 0; y <= until; y += 8) {
      scrollTo({ top: y, behavior: "instant" });
      await frame();
      for (const id of ["top", "work"]) {
        const room = document.getElementById(id)!;
        const stage = room.querySelector<HTMLElement>(".ty-stage")!;
        const st = stage.getBoundingClientRect();
        if (st.top >= innerHeight || st.bottom <= 0) continue;
        add(`${id} room`, y, room.querySelector<HTMLElement>("[data-ty-in]")!.getBoundingClientRect());
        const f = room.querySelector<HTMLElement>("[data-ty-facade]")!;
        if (f.dataset.off === undefined) add(`${id} word`, y, f.querySelector<HTMLElement>("[data-ty-word]")!.getBoundingClientRect());
      }
    }
    return out;
  });
}

function assertMonotonic(series: Record<string, { y: number; top: number; left: number; width: number }[]>, label: string) {
  expect(Object.keys(series).sort()).toEqual(["top room", "top word", "work room", "work word"]);
  for (const [k, s] of Object.entries(series))
    for (const m of ["top", "left", "width"] as const) {
      // A slow drift back counts too: compare with the furthest value reached so far.
      let dir = 0,
        ext = s[0][m];
      for (let i = 1; i < s.length; i++) {
        const v = s[i][m];
        if (!dir && Math.abs(v - ext) > 1) dir = Math.sign(v - ext);
        if (dir && (ext - v) * dir > 1)
          throw new Error(`${label} ${k} ${m} reverses at scroll ${s[i].y}: ${ext.toFixed(1)} -> ${v.toFixed(1)}`);
        if (!dir || (v - ext) * dir > 0) ext = v;
      }
    }
}

test("type: each counter flight is one monotonic camera move, and the hero rests for the first scroll", async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await withPage({ viewport, reducedMotion: "no-preference" }, async (page) => {
      const s = await sampleFlights(page);
      const label = `${viewport.width}px`;
      assertMonotonic(s, label);
      // The hero holds still for the first 15 % of a viewport.
      const hold = s["top word"].filter((p) => p.y <= viewport.height * 0.15);
      for (const k of ["top word", "top room"])
        for (const p of s[k].filter((p) => p.y <= viewport.height * 0.15))
          expect(Math.abs(p.top - s[k][0].top) + Math.abs(p.width - s[k][0].width), `${label} ${k} moved at ${p.y}`).toBeLessThan(0.5);
      expect(hold.length).toBeGreaterThan(10);
      // Both rooms land at full size and the flights actually zoom.
      for (const id of ["top", "work"]) {
        const r = s[`${id} room`];
        expect(r[0].width, `${label} ${id} starts small`).toBeLessThan(viewport.width * 0.7);
        expect(Math.abs(r[r.length - 1].width - viewport.width), `${label} ${id} lands full width`).toBeLessThan(2);
      }
    });
  }
}, 120_000);

test("type: every flight has finished, the room at the top with no wall left, before its stage scrolls on", async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await withPage({ viewport, reducedMotion: "no-preference" }, async (page) => {
      await page.waitForFunction(() => [...document.querySelectorAll(".ty-stage > [data-ty-facade]")].every((f) => f.hasAttribute("data-ready")));
      const ids = await page.evaluate(() => [...document.querySelectorAll(".ty-stage")].map((s) => s.parentElement!.id));
      expect(ids).toEqual(["top", "work", "education", "bpmnscript", "dux", "projects", "contact"]);
      for (const id of ids) {
        const r = await page.evaluate(async (id) => {
          const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const room = document.getElementById(id)!;
          const stage = room.querySelector<HTMLElement>(".ty-stage")!;
          const start = room.getBoundingClientRect().top + scrollY;
          const release = start + room.offsetHeight - stage.offsetHeight;
          // Mid-flight, then one fast flick to the last pinned scroll position: the eased camera lags behind.
          scrollTo({ top: start + (release - start) * 0.4, behavior: "instant" });
          await new Promise((r) => setTimeout(r, 400));
          scrollTo({ top: Math.floor(release), behavior: "instant" });
          await frame();
          const f = room.querySelector<HTMLElement>("[data-ty-facade]")!;
          return {
            wallGone: f.dataset.off !== undefined,
            stageTop: Math.round(stage.getBoundingClientRect().top) + 0,
            roomAtRest: room.querySelector<HTMLElement>("[data-ty-in]")!.style.transform === "",
          };
        }, id);
        expect(r, `${viewport.width}px ${id}`).toEqual({ wallGone: true, stageTop: 0, roomAtRest: true });
      }
    });
  }
}, 120_000);
