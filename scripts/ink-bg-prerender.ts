/**
 * Renders the static ink blooms (the ambient ink's reduced-motion / no-WebGL fallback in
 * src/components/ink/ink-bg.css) to WebP once. SVG filters (feTurbulence) as CSS masks
 * re-rasterize on every tile and cost frames while scrolling; pre-rendered images do not.
 * Needs only the cached Chromium (no server).
 *
 *   bun scripts/ink-bg-prerender.ts   # writes public/images/ink/bg/bloom-{1,2,3}.webp
 *
 * The masks are white with alpha; the CSS colours them.
 */
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { launchBrowser } from "./shots";

const SVG: Record<string, [number, number, string]> = {
  "bloom-1": [480, 480, `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><filter id='f' x='-30%' y='-30%' width='160%' height='160%'><feTurbulence type='fractalNoise' baseFrequency='.013' numOctaves='3' seed='3'/><feDisplacementMap in='SourceGraphic' scale='80' xChannelSelector='R' yChannelSelector='B'/><feGaussianBlur stdDeviation='2.5'/></filter><g filter='url(#f)' fill='white' stroke='white'><circle cx='190' cy='200' r='118' fill-opacity='.5' stroke-width='5'/><circle cx='334' cy='306' r='15' fill-opacity='.6' stroke-width='3'/><circle cx='64' cy='86' r='8' fill-opacity='.6' stroke-width='2'/></g></svg>`],
  "bloom-2": [480, 480, `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><filter id='f' x='-30%' y='-30%' width='160%' height='160%'><feTurbulence type='fractalNoise' baseFrequency='.011' numOctaves='3' seed='11'/><feDisplacementMap in='SourceGraphic' scale='95' xChannelSelector='G' yChannelSelector='R'/><feGaussianBlur stdDeviation='3'/></filter><g filter='url(#f)' fill='white' stroke='white'><ellipse cx='200' cy='200' rx='150' ry='92' fill-opacity='.45' stroke-width='5' transform='rotate(-14 200 200)'/><circle cx='86' cy='318' r='11' fill-opacity='.6' stroke-width='2.5'/></g></svg>`],
  "bloom-3": [480, 480, `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><filter id='f' x='-30%' y='-30%' width='160%' height='160%'><feTurbulence type='fractalNoise' baseFrequency='.016' numOctaves='3' seed='21'/><feDisplacementMap in='SourceGraphic' scale='70' xChannelSelector='B' yChannelSelector='G'/><feGaussianBlur stdDeviation='2'/></filter><g filter='url(#f)' fill='white' stroke='white'><circle cx='170' cy='190' r='92' fill-opacity='.5' stroke-width='4.5'/><circle cx='262' cy='236' r='64' fill-opacity='.42' stroke-width='4'/></g></svg>`],
};

const out = "public/images/ink/bg";
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage();
for (const [name, [w, h, svg]] of Object.entries(SVG)) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style><img width="${w}" height="${h}" src="data:image/svg+xml,${encodeURIComponent(svg)}">`,
  );
  await page.waitForTimeout(100);
  const png = await page.screenshot({ omitBackground: true });
  const info = await sharp(png).webp({ quality: 70, alphaQuality: 70, effort: 6 }).toFile(`${out}/${name}.webp`);
  console.log(name, info.size);
}
await browser.close();
