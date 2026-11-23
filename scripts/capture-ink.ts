/**
 * Captures the Ink hero fallback images (no WebGL2 / saveData) from the real sim:
 * opens `/?ink-capture` at 1440x900 in light and dark, blooms from the period, steps 70 frames,
 * screenshots the canvas with the hero text hidden and writes AVIF at the highest quality <= 60 KB.
 *
 *   bun scripts/capture-ink.ts [--url http://localhost:3100]
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { launchBrowser, newContext } from "./shots";

const MAX_BYTES = 60 * 1024;
const STEPS = 70;
const { values } = parseArgs({ options: { url: { type: "string", default: "http://localhost:3100" } } });
const base = values.url!;

const browser = await launchBrowser();
try {
  for (const mode of ["light", "dark"] as const) {
    const ctx = await newContext(browser, base, { design: "keynote", mode, width: 1440, reduced: false });
    const page = await ctx.newPage();
    await page.goto(`${base}/?ink-capture`, { waitUntil: "load" });
    await page.waitForFunction(() => typeof (window as { __inkCapture?: unknown }).__inkCapture === "function");
    await page.evaluate((n) => (window as unknown as { __inkCapture: (n: number) => void }).__inkCapture(n), STEPS);
    // Only the ink and the paper under it: hide the hero text and the header.
    await page.addStyleTag({ content: ".ink-hero-in, header { visibility: hidden !important; }" });
    const png = await page.locator("canvas.ink-canvas").screenshot({ animations: "disabled" });

    let out: Buffer | undefined;
    let q = 90;
    for (; q >= 10; q -= 5) {
      out = await sharp(png).avif({ quality: q, effort: 9 }).toBuffer();
      if (out.length <= MAX_BYTES) break;
    }
    if (!out || out.length > MAX_BYTES) throw new Error(`${mode}: no quality fits ${MAX_BYTES} bytes`);
    const file = `public/images/ink/ink-${mode}.avif`;
    writeFileSync(file, out);
    console.log(`${file}: ${out.length} bytes at quality ${q}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
