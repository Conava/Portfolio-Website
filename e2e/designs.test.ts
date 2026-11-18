import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { launchBrowser } from "../scripts/shots";
import { assertBuilt, escapeHtml, get, githubStub, ROOT, startSite, STUB_MERGED_TOTAL, type Site } from "./helpers";

const json = (file: string) => JSON.parse(readFileSync(join(ROOT, file), "utf8"));
const DESIGNS = ["keynote", "thread", "flow", "type"] as const;
// The pinned scenes (BPMN window, education stage, player) and the gallery are Ink and Trace components.
const SCENE_DESIGNS = ["keynote", "thread"] as const;
const LOCALES = ["en", "de"] as const;
const SECTIONS = ["about", "work", "education", "bpmnscript", "dux", "projects", "contact"];
const content = (l: string) => ({
  lede: json(`content/${l}/data/about.json`).lede as string,
  job: json(`content/${l}/data/work.json`).jobs[0] as { id: string; company: string; role: string },
  email: json(`content/${l}/data/contact.json`).email as string,
  duxTitles: (json(`content/${l}/data/dux.json`).featuredPrs as { title: string; note?: string }[]).map((p) => p.note ?? p.title),
});
const slugs = readdirSync(join(ROOT, "content/en/projects"))
  .filter((f) => f.endsWith(".mdx"))
  .map((f) => f.replace(/\.mdx$/, ""));
// Rendered markup only: the RSC payload in <script> tags carries every UI message string.
const markup = (html: string) => html.replace(/<script[^]*?<\/script>/g, "");
const prefix = (l: string) => (l === "de" ? "/de" : "");
const home = (l: string) => (l === "de" ? "/de" : "/");

let main: Site; // no env: the GitHub null path
let live: Site; // GitHub stub
let gh: ReturnType<typeof githubStub>;
let browser: Browser;
beforeAll(async () => {
  assertBuilt();
  gh = githubStub();
  main = await startSite();
  live = await startSite({ GITHUB_TOKEN: "test", GITHUB_GRAPHQL_URL: gh.url });
  browser = await launchBrowser();
}, 120_000);
afterAll(async () => {
  await browser?.close();
  await Promise.all([main?.stop(), live?.stop(), gh?.stop()]);
});

type Ev = [string, Record<string, unknown>];
type Opts = Parameters<Browser["newContext"]>[0];

/** A page with the design cookie and a window.umami stub recording into `events` (passive events filtered out). */
async function withPage(
  site: Site,
  design: string,
  opts: Opts,
  fn: (page: Page, events: () => Ev[]) => Promise<void>,
  locale = "en",
) {
  // Type's live mode puts a room behind its flight until you scroll to it; the click-driven tests
  // here run on the stacked layout (the flight is covered in type.test.ts).
  const motion: Opts = design === "type" ? { reducedMotion: "reduce" } : {};
  const ctx: BrowserContext = await browser.newContext({ locale, ...motion, ...opts });
  try {
    await ctx.addCookies([{ name: "design", value: design, url: site.base }]);
    const page = await ctx.newPage();
    const all: Ev[] = [];
    await page.exposeFunction("__track", (n: string, d: Record<string, unknown>) => all.push([n, d]));
    await page.addInitScript(() => {
      const w = window as unknown as { umami: unknown; __track(n: string, d: unknown): void };
      w.umami = { track: (n: string, d: unknown) => w.__track(n, d) };
    });
    await page.route(/^(?!http:\/\/localhost)/, (r) => r.abort());
    await fn(page, () => all.filter(([n]) => n !== "section_view" && n !== "scroll_depth"));
  } finally {
    await ctx.close();
  }
}

describe("designs", () => {
  test("1. both designs render the same content", async () => {
    for (const name of DESIGNS)
      for (const l of LOCALES) {
        const c = content(l);
        const res = await get(main, home(l), { Cookie: `design=${name}` });
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain(`data-design="${name}"`);
        for (const id of SECTIONS) expect(html, `${name}/${l} #${id}`).toContain(`id="${id}"`);
        for (const s of [c.lede, c.job.company, c.job.role]) expect(html, `${name}/${l} ${s}`).toContain(escapeHtml(s));
        expect(html).toContain(c.email);
        expect(c.email.startsWith(l === "de" ? "kontakt@" : "contact@")).toBe(true);
      }
  });

  test("1b. Ink and Type draw one timeline of work and education; only Trace keeps the month table disclosure", async () => {
    for (const name of DESIGNS) {
      const html = markup(await (await get(main, "/", { Cookie: `design=${name}` })).text());
      const figures = html.match(/<figure class="viz viz-timeline">[^]*?<\/figure>/g) ?? [];
      if (name === "keynote" || name === "type") {
        expect(figures.length, name).toBe(1);
        expect(figures[0]?.match(/class="viz-group"/g)?.length, name).toBe(2);
      }
      for (const f of figures) {
        expect(f.includes("<details"), name).toBe(name === "thread");
        expect(f).toContain("<table");
      }
    }
  });

  test("2. design toggle end to end in the browser; the next design opens at the top", async () => {
    await withPage(main, "keynote", { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }, async (page, events) => {
      // a hash and a scroll position in the middle of the page: neither carries over
      await page.goto(main.base + "/?utm_source=linkedin#education", { waitUntil: "load" });
      expect(await page.getAttribute("html", "data-design")).toBe("keynote");
      await page.evaluate(() => document.getElementById("education")!.scrollIntoView());
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(900);
      await page.locator('header a[href*="design=thread"]').first().click();
      await page.waitForFunction(() => document.documentElement?.dataset?.design === "thread", null, { timeout: 15_000 });
      await page.waitForLoadState("load");
      expect(new URL(page.url()).searchParams.get("utm_source")).toBe("linkedin");
      expect(new URL(page.url()).searchParams.has("design")).toBe(false);
      expect(new URL(page.url()).hash).toBe("");
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      expect(events()).toEqual([["design_toggle", { from: "keynote", to: "thread", via: "header" }]]);

      await page.reload({ waitUntil: "load" });
      expect(await page.getAttribute("html", "data-design")).toBe("thread");

      await page.evaluate(() => document.getElementById("dux")!.scrollIntoView());
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(900);
      await page.locator('footer a[href*="design=keynote"]').first().click();
      await page.waitForFunction(() => document.documentElement?.dataset?.design === "keynote", null, { timeout: 15_000 });
      await page.waitForLoadState("load");
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      // Exactly one new event for the footer click.
      expect(events()).toEqual([
        ["design_toggle", { from: "keynote", to: "thread", via: "header" }],
        ["design_toggle", { from: "thread", to: "keynote", via: "footer" }],
      ]);
    });
  }, 90_000);

  test("3. live PR badges in both designs, and the null path", async () => {
    for (const name of DESIGNS) {
      const html = markup(await (await get(live, "/", { Cookie: `design=${name}` })).text());
      expect(html, name).toMatch(/dux-shell#3768<\/code><\/a><span class="gh-title">A new system monitor window<\/span>[^]{0,40}data-pr-state="MERGED"/);
      expect(html, name).toMatch(/dux-shell#3727<\/code><\/a><span class="gh-title">Create and edit network connections in Settings<\/span>[^]{0,40}data-pr-state="OPEN"/);
      expect(html, name).toContain(`${STUB_MERGED_TOTAL} merged pull requests`);

      const bare = markup(await (await get(main, "/", { Cookie: `design=${name}` })).text());
      expect(bare).not.toContain("data-pr-state");
      expect(bare).not.toMatch(/Synced|Last synced|STUB|merged pull requests/);
      // STUB_MERGED_TOTAL is chosen to appear nowhere else in the page text (attributes such as
      // build hashes are skipped).
      expect(bare).not.toMatch(new RegExp(`>[^<]*\\b${STUB_MERGED_TOTAL}\\b`));
      for (const t of content("en").duxTitles) expect(bare).toContain(escapeHtml(t));
    }
  }, 60_000);

  test("4. detail panel deep link, keyboard, events", async () => {
    const id = content("en").job.id;
    for (const name of DESIGNS) {
      // Before hydration (no app chunks at all) the inline hash script has already opened it, so
      // hydration moves nothing. (Ink's deep link still shifts ~0.03 when the serif swaps in.)
      await withPage(main, name, { viewport: { width: 1440, height: 900 } }, async (page) => {
        await page.route(/\/_next\/static\/chunks\//, (r) => r.abort());
        await page.goto(`${main.base}/#panel-${id}`, { waitUntil: "load" });
        const r = await page.evaluate((i) => {
          const region = document.getElementById(`panel-${i}`)!;
          const body = region.querySelector<HTMLElement>(".dp-body")!;
          return { state: region.dataset.state, open: region.querySelector("details")!.open, h: body.offsetHeight };
        }, id);
        expect(r.state, `${name} pre-hydration`).toBe("open");
        expect(r.open, name).toBe(true);
        expect(r.h, name).toBeGreaterThan(100);
      });
      await withPage(main, name, { viewport: { width: 1440, height: 900 } }, async (page, events) => {
        await page.goto(`${main.base}/#panel-${id}`, { waitUntil: "load" });
        const trigger = page.locator(`button[aria-controls="panel-${id}"]`);
        // data-state is "open" before hydration (inline hash script); aria-expanded only after it.
        await page.waitForFunction((i) => document.querySelector(`button[aria-controls="panel-${i}"]`)?.getAttribute("aria-expanded") === "true", id);
        expect(await page.evaluate((i) => document.getElementById(`panel-${i}`)?.dataset.state, id)).toBe("open");
        expect(await page.locator(`#panel-${id}`).isVisible()).toBe(true);
        // The browser's native fragment scroll brings the deep-linked panel into view (the plan said "without scrolling").
        const box = (await page.locator(`#panel-${id}`).boundingBox())!;
        expect(box.y, `${name}: panel in view`).toBeLessThan(900);
        expect(box.y + box.height, name).toBeGreaterThan(0);

        await trigger.focus();
        await page.keyboard.press("Escape");
        expect(await trigger.getAttribute("aria-expanded")).toBe("false");
        expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-controls"))).toBe(`panel-${id}`);

        await trigger.click();
        await trigger.click();
        await page.waitForTimeout(200);
        const ev = events().filter(([n]) => n.startsWith("panel_"));
        // Esc already sent one panel_close; the two clicks add exactly one open and one close.
        expect(ev, name).toEqual([
          ["panel_close", { panel: id, section: "work" }],
          ["panel_open", { panel: id, section: "work" }],
          ["panel_close", { panel: id, section: "work" }],
        ]);

        // Collapsed it is no landmark; back/forward away from its hash closes it.
        expect(await page.locator(`#panel-${id}`).getAttribute("role")).toBeNull();
        await page.evaluate((i) => (location.hash = `panel-${i}`), id);
        await page.waitForFunction((i) => document.getElementById(`panel-${i}`)?.dataset.state === "open", id);
        expect(await page.locator(`#panel-${id}`).getAttribute("role")).toBe("region");
        await page.goBack();
        await page.waitForFunction((i) => document.getElementById(`panel-${i}`)?.dataset.state === "closed", id);
      });
    }
  }, 90_000);

  test("5. reduced motion and no-JS give static, complete scenes", async () => {
    const id = content("en").job.id;
    for (const name of SCENE_DESIGNS) {
      await withPage(main, name, { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }, async (page) => {
        await page.goto(main.base + "/", { waitUntil: "load" });
        await page.waitForTimeout(500);
        const stages = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("[data-scene]")].map((e) => [e.dataset.scene, e.getBoundingClientRect().height]),
        );
        expect(stages.map(([s]) => s).sort(), name).toEqual(["bpmnscript", "education", "player"]);
        for (const [s, h] of stages) expect(h as number, `${name} ${s}`).toBeLessThanOrEqual(900 * 1.5);
        const bpmn = await page.evaluate(() => {
          const scene = document.querySelector<HTMLElement>('[data-scene="bpmnscript"]')!;
          const lines = [...scene.querySelectorAll<HTMLElement>(".bpmn-src .ln")];
          const hidden = lines.filter((l) => +getComputedStyle(l).opacity < 1 || l.getBoundingClientRect().height === 0);
          return { n: lines.length, hidden: hidden.length, text: scene.textContent ?? "" };
        });
        expect(bpmn.n).toBeGreaterThan(5);
        expect(bpmn.hidden, name).toBe(0);
        // Both show the compiler's verdict: Ink in the window footer, Trace under its terminal line.
        expect(bpmn.text, name).toContain(json("messages/en.json").scene.valid);
        if (name === "thread") expect(bpmn.text).toContain("compiled invoice-approval.bpmnscript");
      });
      await withPage(main, name, { viewport: { width: 1440, height: 900 }, javaScriptEnabled: false }, async (page) => {
        await page.goto(main.base + "/", { waitUntil: "load" });
        const r = await page.evaluate(
          ({ ids, id }) => {
            const vis = (e: Element) => {
              for (let n: Element | null = e; n; n = n.parentElement) {
                const s = getComputedStyle(n);
                if (s.display === "none" || +s.opacity === 0 || s.visibility === "hidden") return false;
              }
              return true;
            };
            const heads = ids.map((i) => [i, !!document.querySelector(`#${i} h2`) && vis(document.querySelector(`#${i} h2`)!)]);
            const body = document.querySelector(`#panel-${id} .dp-body`);
            return { heads, body: body ? vis(body) && (body.textContent ?? "").length > 50 : false };
          },
          { ids: SECTIONS, id },
        );
        for (const [i, ok] of r.heads) expect(ok, `${name} no-JS #${i} h2`).toBe(true);
        expect(r.body, `${name} no-JS first panel`).toBe(true);
      });
    }
  }, 90_000);

  test("6. no horizontal scroll and a clean console at 375", async () => {
    for (const name of DESIGNS)
      for (const scheme of ["light", "dark"] as const)
        for (const path of ["/", "/projects/minj", "/no-such-page"])
          await withPage(main, name, { viewport: { width: 375, height: 800 }, colorScheme: scheme }, async (page) => {
            const bad: string[] = [];
            page.on("pageerror", (e) => bad.push(`pageerror ${e.message}`));
            page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && bad.push(`${m.type()} ${m.text()}`));
            const res = await page.goto(main.base + path, { waitUntil: "load" });
            expect(res!.status()).toBe(path === "/no-such-page" ? 404 : 200);
            await page.evaluate(async () => {
              for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
                scrollTo(0, y);
                await new Promise((r) => setTimeout(r, 30));
              }
            });
            const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
            const label = `${name} ${scheme} ${path}`;
            expect(w[0], `${label} scrollWidth`).toBeLessThanOrEqual(w[1]);
            // A 404 page is logged by the browser as a failed resource: ignore only that line.
            expect(bad.filter((b) => !(path === "/no-such-page" && /404/.test(b))), label).toEqual([]);
          });
  }, 180_000);

  test("7. designed 404", async () => {
    // The server HTML is the designed page (src/app/global-not-found.tsx), so it holds without JS.
    const mark = { keynote: /class="ink-nf-path data"><span>\/no-such-page<\/span><svg/, thread: /class="t-nf-trace"/, flow: /class="fl-nf-path">\/no-such-page</, type: /class="ty-nf"/ };
    for (const name of DESIGNS)
      for (const l of LOCALES)
        // Dotted paths skip the proxy; they still get the designed page in the URL's language.
        for (const path of ["/no-such-page", "/projects/no-such-page", "/wp-login.php", "/x.php", "/projects/x.php", "/projects/minj.md"]) {
          const label = `${name}/${l}${path}`;
          const res = await get(main, `${prefix(l)}${path}`, { Cookie: `design=${name}` });
          expect(res.status, label).toBe(404);
          const html = await res.text();
          const msg = escapeHtml(json(`messages/${l}.json`).notFound.message);
          expect(html, label).not.toContain("__next_error__");
          expect(html, label).toContain(`<html lang="${l}" data-design="${name}"`);
          expect(html, label).toContain(`<title>${msg} | Marlon Kranz</title>`);
          expect(html, label).toContain('<meta name="robots" content="noindex"/>');
          const body = markup(html);
          const main404 = body.match(/<main id="main">([^]*?)<\/main>/)?.[1] ?? "";
          if (path === "/no-such-page") expect(main404, label).toMatch(mark[name]);
          else expect(main404, label).toContain({ keynote: "ink-nf-path", thread: "t-nf-trace", flow: "fl-nf", type: "ty-nf" }[name]);
          expect(main404, label).toContain(`<h1>${msg}</h1>`);
          expect(main404, label).toContain(`<a href="${home(l)}">`);
        }
    // A real project page is not caught by the dotted-path matcher.
    expect((await get(main, "/projects/minj")).status).toBe(200);
    // /en/ dotted project paths go through the proxy's /en redirect to the designed 404.
    const en = await get(main, "/en/projects/x.php");
    expect(en.status).toBe(307);
    expect(new URL(en.headers.get("location")!, main.base).pathname).toBe("/projects/x.php");
    // And the browser keeps it after hydration.
    await withPage(main, "thread", { viewport: { width: 1440, height: 900 } }, async (page) => {
      const res = await page.goto(`${main.base}/de/no-such-page`, { waitUntil: "load" });
      expect(res!.status()).toBe(404);
      expect(await page.locator("#main h1").innerText()).toBe(json("messages/de.json").notFound.message);
      expect(await page.locator("#main a").first().getAttribute("href")).toBe("/de");
    }, "de");
  }, 60_000);

  test("8. copy email and outbound tracking", async () => {
    for (const name of DESIGNS)
      for (const l of LOCALES)
        await withPage(
          main,
          name,
          { viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] },
          async (page, events) => {
            await page.goto(main.base + home(l), { waitUntil: "load" });
            await page.locator(".copy-email .ce-btn").first().click();
            await page.waitForTimeout(300);
            expect(events().map(([n]) => n), `${name}/${l}`).toEqual(["email_copy"]);
            expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(content(l).email);
          },
          l,
        );
    for (const name of DESIGNS)
      await withPage(main, name, { viewport: { width: 1440, height: 900 } }, async (page, events) => {
        await page.goto(main.base + "/", { waitUntil: "load" });
        // Bubble phase runs after the site's capture listener: record, then stay on the page.
        await page.evaluate(() => addEventListener("click", (e) => (e.target as Element).closest?.("a") && e.preventDefault()));
        await page.locator("#dux .gh-row a").first().click();
        await page.waitForTimeout(300);
        const ev = events();
        expect(ev.map(([n]) => n), name).toEqual(["outbound_click"]);
        expect(ev[0][1]).toMatchObject({ host: "github.com", section: "dux" });
      });
  }, 90_000);

  test("9. project pages in both designs", async () => {
    for (const name of DESIGNS)
      for (const p of ["/", "/projects", ...slugs.map((s) => `/projects/${s}`)]) {
        const res = await get(main, p, { Cookie: `design=${name}` });
        expect(res.status, `${name} ${p}`).toBe(200);
        const html = await res.text();
        expect(html).not.toContain("bg-clip-text");
        expect(html).not.toContain("▸");
        expect(html, `${name} ${p} #main`).toContain('id="main"');
      }
  });

  test("10. a link inside a gallery figure navigates on a mouse click; a drag still scrolls", async () => {
    for (const name of SCENE_DESIGNS)
      await withPage(main, name, { viewport: { width: 1000, height: 900 } }, async (page) => {
        await page.goto(main.base + "/", { waitUntil: "load" });
        // No gallery image carries a credit link today: plant one where a credit would sit, after
        // hydration (which would drop a node it did not render).
        await page.waitForFunction(() => {
          const row = document.querySelector(".gal-row");
          return !!row && Object.keys(row).some((k) => k.startsWith("__reactProps"));
        });
        await page.evaluate(() => {
          const a = Object.assign(document.createElement("a"), { href: "#gal-link", textContent: "credit" });
          document.querySelector(".gal-item")!.append(a);
        });
        const link = page.locator('.gal-item a[href="#gal-link"]');
        await link.scrollIntoViewIfNeeded();
        await link.click();
        expect(await page.evaluate(() => location.hash), name).toBe("#gal-link");

        const row = page.locator(".gal-row").first();
        const box = (await row.boundingBox())!;
        const y = box.y + box.height / 2;
        await page.mouse.move(box.x + box.width - 40, y);
        await page.mouse.down();
        await page.mouse.move(box.x + 40, y, { steps: 10 });
        await page.mouse.up();
        expect(await row.evaluate((el) => el.scrollLeft), name).toBeGreaterThan(0);
      });
  }, 60_000);

  test("11. action links and panel triggers are buttons: labelled, 44px on phones, one primary per section", async () => {
    const rows = ".btn-row a, .dp-trigger, .dp-actions a, .pj-meta a, :is(.ink-hero-cta, .t-cta) a";
    for (const name of DESIGNS)
      for (const path of ["/", "/projects/minj", "/bpmnscript"])
        await withPage(main, name, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }, async (page) => {
          await page.goto(main.base + path, { waitUntil: "load" });
          const r = await page.evaluate((sel) => {
            const els = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.getClientRects().length);
            const primaries = [...document.querySelectorAll("section[id]")].map(
              (s) => [s.id, s.querySelectorAll(".btn-primary").length] as const,
            );
            return {
              count: els.length,
              notBtn: els.filter((e) => !e.classList.contains("btn")).map((e) => e.outerHTML.slice(0, 80)),
              short: els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent),
              unlabelled: els.filter((e) => !e.textContent?.trim()).length,
              githubNoMark: els
                .filter((e) => (e as HTMLAnchorElement).href?.startsWith("https://github.com/") && !e.querySelector("svg[fill='currentColor']"))
                .map((e) => e.textContent),
              extraPrimary: primaries.filter(([, n]) => n > 1),
            };
          }, rows);
          const label = `${name} ${path}`;
          expect(r.count, label).toBeGreaterThan(path === "/" ? 10 : 0);
          expect(r.notBtn, label).toEqual([]);
          expect(r.short, label).toEqual([]);
          expect(r.unlabelled, label).toBe(0);
          expect(r.githubNoMark, label).toEqual([]);
          expect(r.extraPrimary, label).toEqual([]);
        });
  }, 90_000);
});
