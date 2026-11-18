import { Archivo, Bricolage_Grotesque, Geist, Instrument_Serif, Mona_Sans, Source_Serif_4, Spline_Sans_Mono } from "next/font/google";
import localFont from "next/font/local";

// Each design preloads only its display face. `subsets` decides what is preloaded
// (latin only, one file per face); latin-ext and the rest still load on demand
// through the @font-face unicode-range.

/** Ink display + UI. Variable wght, opsz, wdth. */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  display: "swap",
  preload: true,
  adjustFontFallback: false, // our own metric-matched faces (globals.css)
  fallback: ["Bricolage Fallback"],
  variable: "--font-bricolage",
});

/**
 * Ink running text (ledes, panels, articles). The italic file is fetched only where italic
 * text renders (`<em>` in article prose), so it is not preloaded.
 */
const sourceSerif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
  // Our own metric-matched face (globals.css) covers more systems than next/font's.
  adjustFontFallback: false,
  fallback: ["Source Serif Fallback"],
  variable: "--font-source-serif",
});

/** Code and data values in both designs. */
const splineMono = Spline_Sans_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-spline-mono",
});

/** Trace: all text. Variable wght, wdth. */
const monaSans = Mona_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["Mona Fallback"],
  variable: "--font-mona",
});

/** Flow headlines (roman and italic). Not preloaded: only Flow pages request it. */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
  variable: "--font-instrument-serif",
});

/** Flow text. Variable wght. */
const geist = Geist({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  variable: "--font-geist",
});

/**
 * Flow labels and code. Vendored (OFL, see docs/assets.md): Google sometimes serves this face
 * from a URL with `&skey=` that Turbopack's next/font/google lookup rejects, failing ~1 in 4 cold builds.
 */
const geistMono = localFont({
  src: [
    { path: "../fonts/geist-mono/GeistMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/geist-mono/GeistMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  variable: "--font-geist-mono",
});

/** Type: all text. Variable wght, wdth (62-125%); the canvas draws the facade words with it. */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-archivo",
});

/** Class string that defines the `--font-*` variables; goes on `<html>`. */
export const fontVariables = [bricolage, sourceSerif, splineMono, monaSans, instrumentSerif, geist, geistMono, archivo]
  .map((f) => f.variable)
  .join(" ");
