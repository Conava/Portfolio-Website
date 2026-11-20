import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright-core";
import { launchBrowser } from "../scripts/shots";
import { assertBuilt, escapeHtml, get, ROOT, startSite, type Site } from "./helpers";

const json = (file: string) => JSON.parse(readFileSync(join(ROOT, file), "utf8"));
const DESIGNS = ["keynote", "thread", "flow", "type"] as const;
type Agent = { id: string; model: string; kb?: string[] };
type Stage = { id: string; label: string; approval?: boolean; gate?: boolean; skill?: string; agents?: Agent[] };
type RunViz = { stages: Stage[]; hooks: { id: string }[]; standalone: { id: string; command: string; agents?: Agent[] }[] };
const runViz = (l: string): RunViz =>
  json(`content/${l}/data/projects.json`).projects.find((p: { id: string }) => p.id === "devline").panel.viz;

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

/** The figure inside #devline, as served (no JS). */
const figure = (html: string) => {
  const at = html.indexOf('id="devline"');
  const start = html.indexOf('<figure class="viz viz-run"', at);
  return start < 0 || at < 0 ? "" : html.slice(start, html.indexOf("</figure>", start));
};

test("devline visual: every design serves the whole run without JS (stages, skills, agents with model tier and kb-skills, gates, loops, hooks, standalone skills)", async () => {
  for (const l of ["en", "de"]) {
    const m = json(`messages/${l}.json`);
    const run = m.devline.run;
    const v = runViz(l);
    for (const d of DESIGNS) {
      const fig = figure(await (await get(site, l === "de" ? "/de" : "/", { Cookie: `design=${d}` })).text());
      const label = `${d} ${l}`;
      expect(fig, label).not.toBe("");
      for (const s of v.stages) {
        expect(fig, `${label} ${s.id}`).toContain(escapeHtml(s.label));
        if (!s.gate) expect(fig, `${label} ${s.id} note`).toContain(escapeHtml(m.devline.flowShort[s.id]));
        if (s.skill) expect(fig, `${label} ${s.id} skill`).toContain(`/devline:${s.skill}`);
        for (const a of s.agents ?? []) {
          expect(fig, `${label} ${s.id} ${a.id}`).toContain(`>${a.id}<`);
          for (const k of a.kb ?? []) expect(fig, `${label} ${a.id} ${k}`).toContain(`>${k.replace(/^kb-/, "")}</li>`);
        }
      }
      // A gate after each approval stage plus the gate stages themselves.
      expect(fig.match(/data-gate/g)?.length, label).toBe(v.stages.filter((s) => s.approval || s.gate).length);
      expect(fig, label).toContain(escapeHtml(run.gate));
      for (const k of ["replan", "iterate", "ladder", "skip", "start", "end"]) expect(fig, `${label} ${k}`).toContain(escapeHtml(run[k]));
      expect(fig, label).toContain(escapeHtml(m.devline.flowEach));
      expect(fig, label).toContain(escapeHtml(m.devline.flowLoop));
      for (const h of v.hooks) expect(fig, `${label} ${h.id}`).toContain(escapeHtml(run.hook[h.id.replace(/\.sh$/, "")]));
      // Every agent chip carries its model mark: Opus and Sonnet differ in capability and cost.
      const tiers = [...fig.matchAll(/class="vr-tier" data-model="(\w+)"/g)].map((t) => t[1]);
      expect(tiers.length, label).toBe(v.stages.reduce((n, s) => n + (s.agents?.length ?? 0), 0));
      expect(new Set(tiers), label).toEqual(new Set(["opus", "sonnet"]));
      for (const k of ["skill", "agent", "kb"]) expect(fig, `${label} key ${k}`).toContain(escapeHtml(run.kinds[k]));
      expect(fig, label).toContain(escapeHtml(run.srKinds));
      for (const c of v.standalone) {
        expect(fig, `${label} ${c.id}`).toContain(escapeHtml(c.command));
        expect(fig, `${label} ${c.id} note`).toContain(escapeHtml(run.aloneNote[c.id]));
      }
      for (const k of ["replanShort", "iterateShort", "fix"]) expect(fig, `${label} ${k}`).toContain(escapeHtml(run[k]));
      expect(fig, label).not.toMatch(/I approve|Ich gebe frei/);
    }
  }
}, 60_000);

test("devline visual: the drawing keeps text short and large; notes open by keyboard without moving anything", async () => {
  const run = json("messages/en.json").devline.run;
  for (const d of DESIGNS)
    for (const width of [1440, 375]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      try {
        await ctx.addCookies([{ name: "design", value: d, url: site.base }]);
        const page = await ctx.newPage();
        await page.goto(site.base + "/", { waitUntil: "load" });
        const fig = page.locator("#devline .viz-run");
        const r = await fig.evaluate((f) => {
          const shown = [...f.querySelectorAll(".vr-guard *, .vr-alone *")].filter(
            (e) => e.getClientRects().length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && !e.closest(".sr-only"),
          );
          return {
            small: shown.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.textContent),
            words: shown.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ")).join(" ").split(/\s+/).filter(Boolean).length,
          };
        });
        const label = `${d} ${width}`;
        expect(r.small, label).toEqual([]);
        expect(r.words, label).toBeLessThan(90);
        // A hook note and a standalone note open by keyboard as an overlay: the chip, its
        // neighbour, the caption and the next section stay where they were; Esc closes it.
        for (const [list, i, text] of [[".vr-hooks", 0, run.hook["validate-bash"]], [".vr-alone", 1, run.aloneNote.debug]] as const) {
          const tip = fig.locator(`${list} .vr-tip`).nth(i);
          const note = fig.locator(`${list} .vr-pop`).nth(i);
          const boxes = () =>
            fig.evaluate((f, [list, i]) => {
              const next = [...document.querySelectorAll("section[id]")].find((s) => !s.contains(f) && f.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING);
              const chips = f.querySelectorAll(`${list} .vr-tip`);
              return [chips[i], chips[i + 1], f.querySelector("figcaption"), next].map((e) => {
                const b = e!.getBoundingClientRect();
                return [b.x + scrollX, b.y + scrollY, b.width, b.height];
              });
            }, [list, i] as const);
          expect(await note.isVisible(), label).toBe(false);
          const before = await boxes();
          await tip.focus();
          await page.keyboard.press("Enter");
          expect(await note.isVisible(), `${label} ${list}`).toBe(true);
          expect(await note.textContent(), label).toContain(text);
          // Within a pixel: a scroll to the focused chip can land on a fractional offset.
          const after = await boxes();
          const shift = Math.max(...after.flatMap((b, k) => b.map((v, n) => Math.abs(v - before[k][n]))));
          expect(shift, `${label} ${list} layout shift ${JSON.stringify({ before, after })}`).toBeLessThanOrEqual(1);
          const nb = (await note.boundingBox())!;
          expect(nb.x >= 0 && nb.x + nb.width <= width, `${label} ${list} note inside viewport ${JSON.stringify(nb)}`).toBe(true);
          await page.keyboard.press("Escape");
          expect(await note.isVisible(), label).toBe(false);
          expect(await tip.evaluate((e) => e === document.activeElement), `${label} focus stays on the chip`).toBe(true);
        }
      } finally {
        await ctx.close();
      }
    }
}, 120_000);

test("devline visual: lanes across on a wide figure, one column on a phone, nothing clipped or wider than its box", async () => {
  for (const d of DESIGNS)
    for (const width of [1440, 1024, 375]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      try {
        await ctx.addCookies([{ name: "design", value: d, url: site.base }]);
        const page = await ctx.newPage();
        await page.goto(site.base + "/", { waitUntil: "load" });
        const r = await page.locator("#devline .viz-run").evaluate((fig) => {
          const tops = [...fig.querySelectorAll(".vr-skill")].map((c) => Math.round(c.getBoundingClientRect().top));
          const clipped = [...fig.querySelectorAll(".vr-name, .vr-chip, .vr-kb li, .vr-task, .vr-gl, .vr-loop > span, .vr-tip")]
            .filter((e) => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1)
            .map((e) => e.textContent);
          // Loops: each runs from its source to the plan with no gap (arrowhead at the plan).
          const box = (q: string) => fig.querySelector(q)!.getBoundingClientRect();
          const plan = box('.vr-skill[data-step="plan"]');
          const gate = box('.vr-skill[data-step="gate"] .vr-dia');
          const fan = box('.vr-skill[data-step="implement"]');
          const fanCard = box(".vr-card[data-fan]");
          const loop = (id: string) => box(`.vr-loop[data-loop="${id}"]`);
          const [rp, it] = [loop("replan"), loop("iterate")];
          const gaps =
            fig.clientWidth >= 1100
              ? [rp.left - plan.left, it.left - plan.left, rp.right - fan.right, it.right - (gate.left + gate.width / 2)]
              : [rp.left - fanCard.right, rp.bottom - (fan.top + parseFloat(getComputedStyle(fig).getPropertyValue("--vr-y"))), it.left - gate.right];
          return {
            gaps: gaps.map(Math.round),
            rows: new Set(tops).size,
            n: tops.length,
            down: tops.every((t, i) => i === 0 || t > tops[i - 1]),
            over: fig.scrollWidth - fig.clientWidth,
            page: document.documentElement.scrollWidth - innerWidth,
            w: fig.clientWidth,
            clipped,
          };
        });
        const label = `${d} ${width}`;
        expect(r.over, label).toBeLessThanOrEqual(0);
        expect(r.page, label).toBeLessThanOrEqual(0);
        expect(r.clipped, label).toEqual([]);
        for (const g of r.gaps) expect(Math.abs(g), `${label} loop gaps ${r.gaps}`).toBeLessThanOrEqual(4);
        if (r.w >= 1100) expect(r.rows, label).toBe(1);
        else expect(r.down, label).toBe(true);
      } finally {
        await ctx.close();
      }
    }
}, 180_000);
