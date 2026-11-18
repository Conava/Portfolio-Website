import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import { launchBrowser } from "../scripts/shots";
import { assertBuilt, escapeHtml, get, ROOT, startSite, type Site } from "./helpers";

const preset = (name: string) => join(ROOT, "public", "playground", "presets", name);
const presetText = (name: string) => readFileSync(preset(name), "utf8");
const messages = (l: string) => JSON.parse(readFileSync(join(ROOT, "messages", `${l}.json`), "utf8"));
const MONACO = /monaco-editor|monaco-vscode|djs-container/;

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

type Ev = [string, Record<string, unknown>];
type Opened = { page: Page; ctx: BrowserContext; events: () => Ev[]; bad: string[] };

/**
 * A page with the design cookie, a window.umami recorder and console/network problems collected in `bad`.
 * Only playground_* events and outbound clicks are kept in `events`.
 */
async function open(
  path: string,
  opts: { design?: string; locale?: string; width?: number; height?: number; js?: boolean; clipboard?: boolean } = {},
  fn: (o: Opened) => Promise<void>,
) {
  const ctx = await browser.newContext({
    locale: opts.locale ?? "en",
    viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 },
    javaScriptEnabled: opts.js ?? true,
    acceptDownloads: true,
    reducedMotion: "reduce",
    permissions: opts.clipboard ? ["clipboard-read", "clipboard-write"] : [],
  });
  try {
    if (opts.design) await ctx.addCookies([{ name: "design", value: opts.design, url: site.base }]);
    const page = await ctx.newPage();
    const all: Ev[] = [];
    const bad: string[] = [];
    await page.exposeFunction("__track", (n: string, d: Record<string, unknown>) => all.push([n, d]));
    await page.addInitScript(() => {
      const w = window as unknown as { umami: unknown; __track(n: string, d: unknown): void };
      w.umami = { track: (n: string, d: unknown) => w.__track(n, d) };
    });
    await page.route(/^(?!http:\/\/localhost)/, (r) => r.abort());
    page.on("pageerror", (e) => bad.push(`pageerror ${e.message}`));
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && bad.push(`${m.type()} ${m.text()}`));
    page.on("response", (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
    const res = await page.goto(site.base + path, { waitUntil: "load" });
    expect(res!.status()).toBe(200);
    await fn({ page, ctx, bad, events: () => all.filter(([n]) => n.startsWith("playground_")) });
  } finally {
    await ctx.close();
  }
}

const app = (p: Page) => p.locator("[data-playground]");
const attr = (p: Page, name: string) => app(p).getAttribute(name);
const seq = async (p: Page) => Number(await attr(p, "data-compile-seq"));
const elements = async (p: Page) => Number(await p.locator("#pg-pane-diagram [data-pg-diagram]").getAttribute("data-elements"));

/** Language server up, Monaco live, first compile applied. */
async function ready(p: Page) {
  await p.waitForSelector('[data-playground][data-lsp="ready"][data-compile="ok"]');
  await p.waitForSelector("[data-pg-editor][data-mounted]");
  await p.waitForFunction(() => Number(document.querySelector("#pg-pane-diagram [data-pg-diagram]")?.getAttribute("data-elements")) > 0);
}
const compiledAfter = (p: Page, n: number) =>
  p.waitForFunction((n) => Number(document.querySelector("[data-playground]")!.getAttribute("data-compile-seq")) > n, n);

/** The menu is inert until opened: open the one holding `item`, then click it. */
async function pick(p: Page, item: string) {
  const root = p.locator(".pg-menu-root", { has: p.locator(item) });
  await root.locator(":scope > button").click();
  await root.locator("[data-open]").waitFor();
  await root.locator(item).click();
}
async function exportAs(p: Page, format: "bpmn" | "bpmnscript") {
  const [dl] = await Promise.all([p.waitForEvent("download"), pick(p, `[data-pg-export="${format}"]`)]);
  return Bun.file((await dl.path())!).text();
}
const importFile = (p: Page, name: string) => p.setInputFiles("input[data-pg-import]", preset(name));

/** Gives the Monaco editor keyboard focus (a click into its text). */
const focusEditor = (p: Page) => p.locator("[data-pg-editor] .view-lines").click();

describe("playground", () => {
  test("1. import, edit, export", async () => {
    await open("/playground", { design: "keynote" }, async ({ page, events }) => {
      await ready(page);
      await importFile(page, "invoice-receipt.bpmn");
      await page.waitForFunction(() => document.querySelectorAll("[data-pg-import-log] li").length >= 3);
      expect(await page.locator("[data-pg-refusal]").count()).toBe(0);
      await page.waitForSelector('[data-playground][data-compile="ok"]');
      const before = { seq: await seq(page), els: await elements(page) };
      expect(before.els).toBeGreaterThan(0);

      // Before the last `end` (the export ends with a newline, then `}`): a task after an end would not compile.
      await focusEditor(page);
      await page.keyboard.press("Control+End");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Home");
      await page.keyboard.insertText('user typedReview(label: "Typed Review")');
      await page.keyboard.press("Escape");
      await page.keyboard.press("Enter");
      await compiledAfter(page, before.seq);
      await page.waitForFunction((n) => Number(document.querySelector("#pg-pane-diagram [data-pg-diagram]")!.getAttribute("data-elements")) > n, before.els);
      expect(await attr(page, "data-compile")).toBe("ok");

      expect(await exportAs(page, "bpmnscript")).toContain('user typedReview(label: "Typed Review")');
      const xml = await exportAs(page, "bpmn");
      expect(xml).toContain("<bpmn:definitions");
      expect(xml).toMatch(/<bpmn:userTask [^>]*name="Typed Review"/);

      expect(events()).toEqual([
        ["playground_import", { result: "warning", source: "file" }],
        ["playground_export", { format: "bpmnscript" }],
        ["playground_export", { format: "bpmn" }],
      ]);
    });
  }, 90_000);

  test("2. a refused import leaves the editor unchanged", async () => {
    await open("/playground", { design: "keynote" }, async ({ page, events }) => {
      await ready(page);
      const baseline = await exportAs(page, "bpmnscript");
      await importFile(page, "error-start.bpmn");
      const banner = page.locator("[data-pg-refusal]");
      await banner.waitFor();
      const text = await banner.innerText();
      expect(text).toContain("cannot start on an error");
      expect(text).toContain(messages("en").playground.import.refused);
      expect(await exportAs(page, "bpmnscript")).toBe(baseline);
      expect(events().filter(([n]) => n === "playground_import")).toEqual([["playground_import", { result: "refused", source: "file" }]]);
    });
  }, 60_000);

  test("3. real language server: completion, diagnostics, compile error event", async () => {
    await open("/playground", { design: "keynote" }, async ({ page, events }) => {
      await ready(page);
      await focusEditor(page);
      // A new empty line right inside the process.
      await page.keyboard.press("Control+Home");
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Control+Space");
      const suggest = page.locator(".suggest-widget.visible");
      await suggest.waitFor();
      // The list is virtualized: filter it down to the entry.
      await page.keyboard.type("serv");
      await suggest.locator(".monaco-list-row", { hasText: "service" }).first().waitFor();
      await page.keyboard.press("Escape");
      for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");

      await page.keyboard.type("bogus(");
      await page.waitForSelector('[data-playground][data-compile="error"]');
      await page.waitForFunction(() => document.querySelectorAll("[data-pg-problems] [data-pg-problem]").length >= 1);
      expect(await page.locator("[data-pg-problem-count]").innerText()).toMatch(/[1-9]\d* errors?/);
      expect(await page.locator("[data-pg-compile-state]").innerText()).toMatch(/^Does not compile, first error on line \d+$/);
      // Problems are grouped by file; the explorer marks the file.
      expect(await page.locator("[data-pg-problems] .pg-pfile").first().innerText()).toContain("invoice-approval.bpmnscript");
      expect(await page.locator('[data-pg-file="invoice-approval.bpmnscript"] .pg-xname[data-errors]').count()).toBe(1);
      expect(events().filter(([n]) => n === "playground_compile_error")).toHaveLength(1);

      // More keystrokes while still in error: no second event.
      const s = await seq(page);
      await page.keyboard.type("x");
      await compiledAfter(page, s);
      expect(await attr(page, "data-compile")).toBe("error");
      expect(events().filter(([n]) => n === "playground_compile_error")).toHaveLength(1);

      await page.keyboard.press("Control+Shift+K"); // delete the line
      await page.waitForSelector('[data-playground][data-compile="ok"]');
      expect(events().filter(([n]) => n === "playground_compile_error")).toHaveLength(1);
    });
  }, 90_000);

  test("4. presets and the share link round trip", async () => {
    await open("/playground", { design: "keynote", clipboard: true }, async ({ page, ctx, events }) => {
      await ready(page);
      let s = await seq(page);
      await pick(page, '[data-pg-preset="loan-approval"]');
      await compiledAfter(page, s);
      expect(await attr(page, "data-compile")).toBe("ok");
      expect(events()).toEqual([["playground_preset", { preset: "loan-approval" }]]);
      const loan = await exportAs(page, "bpmnscript");
      expect(loan).toBe(presetText("loan-approval.bpmnscript"));

      await pick(page, '[data-pg-preset="service-no-binding"]');
      await page.locator("[data-pg-refusal]").waitFor();
      expect(events().at(-1)).toEqual(["playground_import", { result: "refused", source: "preset", preset: "service-no-binding" }]);
      expect(await exportAs(page, "bpmnscript")).toBe(loan);

      await page.locator("[data-pg-share]").click();
      await page.waitForFunction(() => document.querySelector("[data-pg-share]")!.getAttribute("data-state") === "copied");
      const url = await page.evaluate(() => navigator.clipboard.readText());
      expect(new URL(url).hash).toMatch(/^#src=/);
      expect(events().filter(([n]) => n === "playground_share")).toEqual([["playground_share", {}]]);

      const other = await ctx.newPage();
      await other.route(/^(?!http:\/\/localhost)/, (r) => r.abort());
      await other.goto(url);
      await ready(other);
      expect(await exportAs(other, "bpmnscript")).toBe(loan);

      // The shared source opened as a file of its own, next to the example.
      expect(await other.locator("[data-pg-file]").evaluateAll((els) => els.map((e) => e.getAttribute("data-pg-file")))).toEqual([
        "invoice-approval.bpmnscript",
        "loan-approval.bpmnscript",
      ]);

      // A garbage hash, in a fresh browser (no stored files), falls back to the example with the notice.
      const fresh = await browser.newContext({ reducedMotion: "reduce" });
      const bad = await fresh.newPage();
      const errors: string[] = [];
      bad.on("pageerror", (e) => errors.push(e.message));
      await bad.goto(`${site.base}/playground#src=@@`);
      await ready(bad);
      await bad.locator(".pg-notice", { hasText: messages("en").playground.share.invalid }).waitFor();
      expect(await exportAs(bad, "bpmnscript")).toContain("process invoice-approval");
      expect(errors).toEqual([]);
      await fresh.close();
    });
  }, 90_000);

  test("5. English only, the same IDE in every design: /de/playground redirects, no design or language switch", async () => {
    const res = await get(site, "/de/playground");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/playground");
    const sub = await get(site, "/de/playground/x");
    expect(sub.headers.get("location")).toBe("/playground/x");
    await open("/de/playground", { design: "thread", locale: "de" }, async ({ page, bad }) => {
      await ready(page);
      expect(new URL(page.url()).pathname).toBe("/playground");
      expect(await page.getAttribute("html", "lang")).toBe("en");
      expect(await page.locator(".pg-title").innerText()).toBe("BPMNscript Playground");
      expect(await page.title()).toContain("BPMNscript Playground");
      expect(await page.locator('.pg-hdr a[href="/"]').count()).toBe(1);
      expect(await page.locator('.pg-hdr a[href*="design="], .pg-hdr .ctl-locale').count()).toBe(0);
      // The IDE keeps its own font whatever the site design is.
      const font = () => page.evaluate(() => getComputedStyle(document.querySelector(".pg-app")!).fontFamily);
      const traceFont = await font();
      await page.context().addCookies([{ name: "design", value: "keynote", url: site.base }]);
      await page.reload();
      await ready(page);
      expect(await font()).toBe(traceFont);
      const s = await seq(page);
      await pick(page, '[data-pg-preset="loan-approval"]');
      await compiledAfter(page, s);
      expect(await attr(page, "data-compile")).toBe("ok");
      expect(bad).toEqual([]);
    });
  }, 60_000);

  test("5c. phone layout: tabs, explorer drawer, no horizontal scroll, clean console", async () => {
    await open("/playground", { design: "keynote", width: 375, height: 800 }, async ({ page, bad }) => {
      await ready(page);
      // Panel starts closed on phones, and so does the explorer drawer.
      expect(await page.locator(".pg-panel").count()).toBe(0);
      expect(await page.locator("[data-pg-explorer]").isVisible()).toBe(false);
      await pick(page, '[data-pg-preset="loan-approval"]');
      await page.waitForFunction(() => document.querySelector("[data-playground]")!.getAttribute("data-active-file") === "loan-approval.bpmnscript");
      await page.locator("[data-pg-explorer-toggle]").click();
      await page.locator("[data-pg-explorer]").waitFor({ state: "visible" });
      await page.locator('[data-pg-file="invoice-approval.bpmnscript"] .pg-xrow').click();
      await page.locator("[data-pg-explorer]").waitFor({ state: "hidden" });
      expect(await attr(page, "data-active-file")).toBe("invoice-approval.bpmnscript");
      await page.locator("#pg-tab-phone-diagram").click();
      await page.locator("#pg-pane-diagram [data-pg-diagram]").waitFor({ state: "visible" });
      expect(await page.locator("#pg-pane-source").isVisible()).toBe(false);
      // The whole diagram is fitted into the pane, end event included.
      await page.waitForTimeout(200);
      const fit = await page.evaluate(() => {
        const host = document.querySelector("#pg-pane-diagram .pg-diagram-canvas")!.getBoundingClientRect();
        const drawn = document.querySelector("#pg-pane-diagram .djs-container .viewport")!.getBoundingClientRect();
        return { host: [host.left, host.right], drawn: [drawn.left, drawn.right] };
      });
      expect(fit.drawn[0]).toBeGreaterThanOrEqual(fit.host[0]);
      expect(fit.drawn[1]).toBeLessThanOrEqual(fit.host[1]);
      await page.locator("#pg-tab-phone-xml").click();
      await page.locator("#pg-pane-xml").waitFor({ state: "visible" });
      await page.locator("#pg-tab-phone-source").click();
      await page.locator("#pg-pane-source").waitFor({ state: "visible" });
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(sw).toBeLessThanOrEqual(cw);
      expect(bad).toEqual([]);
    });
  }, 60_000);

  test("6. Monaco and bpmn-js load only on /playground", async () => {
    for (const design of ["keynote", "thread"])
      for (const path of ["/", "/de"])
        await open(path, { design }, async ({ page }) => {
          // Everything the page loads, including scripts that arrive after load.
          const scripts: { url: string; body: string }[] = [];
          const urls: string[] = [];
          page.on("request", (r) => urls.push(r.url()));
          page.on("response", async (r) => {
            if (r.request().resourceType() === "script") scripts.push({ url: r.url(), body: await r.text().catch(() => "") });
          });
          await page.reload({ waitUntil: "networkidle" });
          expect(scripts.length, `${design}${path} scripts`).toBeGreaterThan(0);
          expect(urls.filter((u) => u.includes("/playground/")), `${design}${path}`).toEqual([]);
          expect(scripts.filter((s) => MONACO.test(s.body)).map((s) => s.url), `${design}${path}`).toEqual([]);
        });
  }, 90_000);

  test("7. unknown playground paths get the designed 404", async () => {
    for (const design of ["keynote", "thread"]) {
      const path = "/playground/nope";
      const res = await get(site, path, { Cookie: `design=${design}` });
      expect(res.status, path).toBe(404);
      const html = await res.text();
      const msg = escapeHtml(messages("en").notFound.message);
      expect(html, path).toContain(`<html lang="en" data-design="${design}"`);
      const main = html.replace(/<script[^]*?<\/script>/g, "").match(/<main id="main">([^]*?)<\/main>/)?.[1] ?? "";
      expect(main, path).toContain(`<h1>${msg}</h1>`);
      expect(main, path).toContain(design === "keynote" ? "ink-nf-path" : "t-nf-trace");
      expect(html, path).not.toContain("data-playground");
    }
    // The real route is not swallowed by the 404 rewrite.
    expect((await get(site, "/playground")).status).toBe(200);
  }, 30_000);

  test("8. without JavaScript the example frame shows and the tools are hidden", async () => {
    for (const [width, phone] of [[1440, false], [375, true]] as const)
      await open("/playground", { design: "keynote", js: false, width, height: 800 }, async ({ page }) => {
        const label = phone ? "phone" : "desktop";
        await page.locator("#pg-pane-source").getByText("process invoice-approval").first().waitFor();
        expect(await page.locator("#pg-pane-diagram svg").first().isVisible(), label).toBe(true);
        expect(await page.locator(".pg-nojs").innerText(), label).toBe(messages("en").playground.noscript);
        for (const sel of [".pg-tools", ".pg-tabs", ".pg-bottom", ".pg-status", ".pg-side", ".pg-etabs"])
          for (const el of await page.locator(sel).all()) expect(await el.isVisible(), `${label} ${sel}`).toBe(false);
        if (phone) {
          // Source and diagram stack, both with room.
          for (const id of ["#pg-pane-source", "#pg-pane-diagram"]) {
            const box = await page.locator(id).boundingBox();
            expect(box?.height ?? 0, `${label} ${id}`).toBeGreaterThan(100);
          }
        }
      });
  }, 60_000);

  test("9. tabs and tabpanels are wired with unique ids", async () => {
    await open("/playground", { design: "keynote" }, async ({ page }) => {
      await ready(page);
      const r = await page.evaluate(() => {
        // Monaco brings its own markup; the playground's controls are everything outside the editor.
        const inScope = (el: Element) => !el.closest("[data-pg-editor]");
        const els = [...document.querySelectorAll("[data-playground] [id]")].filter(inScope);
        const ids = els.map((e) => e.id);
        const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
        const missing: string[] = [];
        for (const el of document.querySelectorAll("[data-playground] [aria-controls],[data-playground] [aria-labelledby]")) {
          if (!inScope(el)) continue;
          for (const a of ["aria-controls", "aria-labelledby"])
            for (const id of (el.getAttribute(a) ?? "").split(/\s+/).filter(Boolean))
              if (!document.getElementById(id)) missing.push(`${a}=${id}`);
        }
        const tabs = [...document.querySelectorAll("[role=tab]")].filter(inScope).map((t) => ({
          id: t.id,
          controls: t.getAttribute("aria-controls"),
          panelLabel: t.getAttribute("aria-controls") ? document.getElementById(t.getAttribute("aria-controls")!)?.getAttribute("aria-labelledby") : null,
        }));
        const panels = [...document.querySelectorAll("[role=tabpanel]")].filter(inScope).map((p) => ({ id: p.id, by: p.getAttribute("aria-labelledby") }));
        return { dup, missing, tabs, panels };
      });
      expect(r.dup).toEqual([]);
      expect(r.missing).toEqual([]);
      for (const t of r.tabs) expect(t.id, JSON.stringify(t)).not.toBe("");
      // Every tabpanel is labelled by an existing tab; the output tablist labels diagram and xml.
      for (const p of r.panels) expect(r.tabs.map((t) => t.id)).toContain(p.by!);
      for (const k of ["source", "diagram", "xml"]) {
        const t = r.tabs.find((t) => t.id === `pg-tab-phone-${k}`);
        expect(t?.controls, k).toBe(`pg-pane-${k}`);
      }
      for (const k of ["diagram", "xml"]) expect(r.tabs.find((t) => t.id === `pg-tab-pane-${k}`)?.controls, k).toBe(`pg-pane-${k}`);
      // Switching the pane tab moves aria-selected.
      await page.locator("#pg-tab-pane-xml").click();
      expect(await page.locator("#pg-tab-pane-xml").getAttribute("aria-selected")).toBe("true");
      expect(await page.locator("#pg-tab-pane-diagram").getAttribute("aria-selected")).toBe("false");
    });
  }, 60_000);

  test("10. a newer preset or import wins over a slower earlier one", async () => {
    await open("/playground", { design: "keynote" }, async ({ page, events }) => {
      await ready(page);
      // Holds one preset file's response until released.
      const hold = async (file: string) => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const done = page.waitForResponse((r) => r.url().endsWith(file));
        await page.route(`**/playground/presets/${file}`, async (route) => {
          await gate;
          await route.continue();
        });
        return async () => {
          release();
          // A stale result fires nothing observable: wait for its body, then two frames for the handler.
          await (await done).finished();
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        };
      };

      // A: a slow BPMN preset, then a fast source preset. The preset wins.
      const releaseReceipt = await hold("invoice-receipt.bpmn");
      await pick(page, '[data-pg-preset="invoice-receipt"]');
      let s = await seq(page);
      await pick(page, '[data-pg-preset="loan-approval"]');
      await compiledAfter(page, s);
      await page.waitForSelector('[data-playground][data-compile="ok"]');
      await releaseReceipt();
      expect(await exportAs(page, "bpmnscript")).toBe(presetText("loan-approval.bpmnscript"));
      expect(await page.locator("[data-pg-import-log] li").count()).toBe(0);
      expect(events().filter(([n]) => n !== "playground_export")).toEqual([["playground_preset", { preset: "loan-approval" }]]);

      // B: a slow source preset, then a fast BPMN import. The import wins.
      await page.unroute("**/playground/presets/invoice-receipt.bpmn");
      const releaseOrder = await hold("order-handling.bpmnscript");
      await pick(page, '[data-pg-preset="order-handling"]');
      s = await seq(page);
      await pick(page, '[data-pg-preset="invoice-handwritten"]');
      await page.waitForFunction(() => document.querySelectorAll("[data-pg-import-log] li").length === 1);
      await compiledAfter(page, s);
      const winner = await exportAs(page, "bpmnscript");
      expect(winner).not.toContain("process order-handling");
      await releaseOrder();
      expect(await exportAs(page, "bpmnscript")).toBe(winner);
      expect(events().filter(([n]) => n === "playground_preset")).toHaveLength(1);
      expect(events().filter(([n]) => n === "playground_import")).toEqual([
        ["playground_import", { result: "warning", source: "preset", preset: "invoice-handwritten" }],
      ]);
    });
  }, 90_000);

  test("10b. a preset picked while a file is still being read wins over the file", async () => {
    await open("/playground", { design: "keynote" }, async ({ page, events }) => {
      await ready(page);
      // Holds every File.arrayBuffer() until released.
      await page.evaluate(() => {
        const orig = File.prototype.arrayBuffer;
        const gate = new Promise<void>((r) => ((window as unknown as { releaseRead: () => void }).releaseRead = r));
        File.prototype.arrayBuffer = async function (this: File) {
          await gate;
          return orig.call(this);
        };
      });
      await importFile(page, "invoice-receipt.bpmn");
      const s = await seq(page);
      await pick(page, '[data-pg-preset="loan-approval"]');
      await compiledAfter(page, s);
      await page.evaluate(() => (window as unknown as { releaseRead: () => void }).releaseRead());
      // The stale import has no observable effect: give the read and handler two frames.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await exportAs(page, "bpmnscript")).toBe(presetText("loan-approval.bpmnscript"));
      expect(await page.locator("[data-pg-import-log] li").count()).toBe(0);
      expect(events().filter(([n]) => n === "playground_import")).toEqual([]);
    });
  }, 60_000);

  test("11. empty source: notice, BPMN export disabled, no error count", async () => {
    await open("/playground", { design: "keynote" }, async ({ page }) => {
      await ready(page);
      await focusEditor(page);
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Delete");
      await page.locator(".pg-notice", { hasText: messages("en").playground.empty }).waitFor();
      await page.waitForSelector('[data-playground][data-compile="pending"]');
      expect(await page.locator("[data-pg-compile-state]").innerText()).toBe("");
      const root = page.locator(".pg-menu-root", { has: page.locator('[data-pg-export="bpmn"]') });
      await root.locator(":scope > button").click();
      await root.locator("[data-open]").waitFor();
      expect(await root.locator('[data-pg-export="bpmn"]').getAttribute("aria-disabled")).toBe("true");
      expect(await root.locator('[data-pg-export="bpmnscript"]').getAttribute("aria-disabled")).toBeNull();
      await page.keyboard.press("Escape");
      // Undo brings the source, and the compile, back.
      await focusEditor(page);
      await page.keyboard.press("Control+Z");
      await page.waitForSelector('[data-playground][data-compile="ok"]');
      expect(await page.locator(".pg-notice", { hasText: messages("en").playground.empty }).count()).toBe(0);
    });
  }, 60_000);

  test("12. files: create, rename, switch with state and undo kept, save, close, delete, reload persists", async () => {
    await open("/playground", { design: "keynote" }, async ({ page }) => {
      page.on("dialog", (d) => void d.accept());
      await ready(page);
      const activeFile = () => attr(page, "data-active-file");
      const tab = (name: string) => page.locator(`[data-pg-tab-file="${name}"]`);
      const row = (name: string) => page.locator(`[data-pg-file="${name}"] .pg-xrow`);

      // New file: named in place, then it compiles on its own.
      let s = await seq(page);
      await page.locator("[data-pg-new-file]").click();
      const field = page.locator("[data-pg-rename]");
      await field.waitFor();
      await field.fill("second");
      await field.press("Enter");
      await page.waitForFunction(() => document.querySelector("[data-playground]")!.getAttribute("data-active-file") === "second.bpmnscript");
      await compiledAfter(page, s);
      expect(await attr(page, "data-compile")).toBe("ok");
      expect(await exportAs(page, "bpmnscript")).toContain("process second {");

      // An edit marks the tab dirty.
      await focusEditor(page);
      await page.keyboard.press("Control+End");
      await page.keyboard.insertText("// note");
      await tab("second.bpmnscript").and(page.locator("[data-dirty]")).waitFor();
      expect(await page.locator('[data-pg-file="second.bpmnscript"] [data-pg-dirty]').count()).toBe(1);

      // Switch away: the diagram follows the file.
      s = await seq(page);
      await tab("invoice-approval.bpmnscript").locator(".pg-etab-name").click();
      expect(await activeFile()).toBe("invoice-approval.bpmnscript");
      await compiledAfter(page, s);
      expect(await exportAs(page, "bpmnscript")).toContain("process invoice-approval");
      expect(await elements(page)).toBeGreaterThan(5);

      // Switch back with the keyboard: the text is kept, and so is its undo history.
      await page.keyboard.press("Alt+PageDown");
      await page.waitForFunction(() => document.querySelector("[data-playground]")!.getAttribute("data-active-file") === "second.bpmnscript");
      expect(await exportAs(page, "bpmnscript")).toContain("// note");
      await focusEditor(page);
      // Monaco undoes typing a word at a time.
      const dirty = () => tab("second.bpmnscript").evaluate((el) => el.hasAttribute("data-dirty"));
      for (let i = 0; i < 5 && (await dirty()); i++) {
        await page.keyboard.press("Control+Z");
        await page.waitForTimeout(100);
      }
      expect(await dirty()).toBe(false);
      expect(await exportAs(page, "bpmnscript")).not.toContain("// note");

      // Ctrl+S saves: an edit, then a save clears the marker; a later edit sets it again.
      await focusEditor(page);
      await page.keyboard.insertText("// saved");
      await tab("second.bpmnscript").and(page.locator("[data-dirty]")).waitFor();
      await page.keyboard.press("Control+s");
      await page.waitForFunction(() => !document.querySelector('[data-pg-tab-file="second.bpmnscript"]')!.hasAttribute("data-dirty"));
      await page.keyboard.insertText(" and kept");
      await tab("second.bpmnscript").and(page.locator("[data-dirty]")).waitFor();

      // F2 renames from the explorer; the file keeps its text.
      await row("invoice-approval.bpmnscript").focus();
      await page.keyboard.press("F2");
      await field.fill("main");
      await field.press("Enter");
      await row("main.bpmnscript").waitFor();

      // Reload: files, the open file, unsaved text and the dirty marker come back.
      await page.waitForFunction(() => (localStorage.getItem("pg-workspace-v1") ?? "").includes("and kept"));
      await page.reload();
      await ready(page);
      expect(await page.locator("[data-pg-file]").evaluateAll((els) => els.map((e) => e.getAttribute("data-pg-file")))).toEqual([
        "main.bpmnscript",
        "second.bpmnscript",
      ]);
      expect(await activeFile()).toBe("second.bpmnscript");
      expect(await exportAs(page, "bpmnscript")).toContain("// saved and kept");
      await tab("second.bpmnscript").and(page.locator("[data-dirty]")).waitFor();

      // Alt+W closes the tab (the file stays); with no tab open the editor says so.
      await page.keyboard.press("Alt+W");
      await page.keyboard.press("Alt+W");
      await page.locator("[data-pg-nofile]").waitFor();
      expect(await page.locator("[data-pg-file]").count()).toBe(2);
      await row("main.bpmnscript").click();
      await page.locator("[data-pg-nofile]").waitFor({ state: "detached" });
      expect(await activeFile()).toBe("main.bpmnscript");

      // Delete (confirmed) removes the file for good.
      await row("second.bpmnscript").focus();
      await page.keyboard.press("Delete");
      await row("second.bpmnscript").waitFor({ state: "detached" });
      await page.waitForFunction(() => !(localStorage.getItem("pg-workspace-v1") ?? "").includes("second"));
      await page.reload();
      await ready(page);
      expect(await page.locator("[data-pg-file]").count()).toBe(1);
    });
  }, 120_000);
});
