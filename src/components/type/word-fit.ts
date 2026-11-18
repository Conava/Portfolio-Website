/**
 * Server-side fit of a facade word: picks Archivo's width (wdth) and a font size so the word
 * fills the facade without measuring in the browser, so the first paint is already final.
 * Advances are Archivo at weight 780, in thousandths of an em, measured in Chromium.
 */

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ 0123456789.-";
// prettier-ignore
const ADV: Record<Stretch, number[]> = {
  62.5: [499,484,507,506,454,397,534,507,242,425,504,411,676,511,545,473,545,499,455,458,498,473,703,488,483,464,499,545,498,119,427,363,419,425,414,428,427,380,415,427,212,241],
  75: [580,569,587,588,535,477,627,598,269,491,589,480,753,601,632,547,632,582,534,528,591,556,794,569,564,535,580,632,591,143,491,449,486,490,483,491,491,460,483,491,247,272],
  100: [742,740,748,752,696,637,813,780,324,624,761,616,905,780,806,695,806,746,693,668,776,722,976,730,725,676,742,806,776,190,619,620,620,620,620,619,620,620,620,619,316,333],
  112.5: [836,826,845,843,780,717,913,883,347,677,853,683,1024,883,910,778,910,839,779,756,871,811,1093,833,818,765,836,910,871,248,701,659,700,703,698,702,704,671,710,703,330,375],
  125: [930,912,943,934,863,798,1013,986,369,730,946,749,1144,985,1013,860,1013,931,865,844,966,899,1210,936,911,855,930,1013,966,306,783,699,780,786,776,785,788,722,800,788,345,416],
};
export type Stretch = 62.5 | 75 | 100 | 112.5 | 125;
const STRETCHES: Stretch[] = [125, 112.5, 100, 75, 62.5];
/** Cap height of Archivo, in em. */
export const CAP = 0.688;
/** Letter spacing of the facade word, in em (also set in CSS). */
export const TRACK = -0.015;

/** Width of one line in em at the given stretch. Unknown characters count as an average letter. */
export function emWidth(line: string, stretch: Stretch): number {
  const adv = ADV[stretch];
  let w = 0;
  for (const ch of line) {
    const i = CHARS.indexOf(ch);
    w += (i < 0 ? adv[0] : adv[i]) / 1000 + TRACK;
  }
  return w - TRACK;
}

export interface Fit {
  lines: string[];
  stretch: Stretch;
  /** Font size limited by the width, in vw. */
  vw: number;
  /** Font size limited by the height, in svh. */
  vh: number;
}

/** Share of the viewport width the word fills, in percent. */
const WIDTH = 88;

/**
 * Desktop: one line, as wide as possible (expanded) while the capitals stay at least 5vw tall.
 * Phone: each word on its own line at the narrowest width, which gives the tallest word.
 */
export function fitWord(word: string, mode: "desktop" | "phone"): Fit {
  const upper = word.toLocaleUpperCase("de-DE");
  const phone = mode === "phone";
  const lines = phone ? upper.split(" ") : [upper];
  // Height share of the capitals (all lines plus the gaps between them), in svh.
  const vh = round((phone ? 34 : 30) / CAP / (1 + 1.25 * (lines.length - 1)));
  const fit = (stretch: Stretch): Fit => ({
    lines,
    stretch,
    vw: round(WIDTH / Math.max(...lines.map((l) => emWidth(l, stretch)))),
    vh,
  });
  if (phone) return fit(62.5);
  for (const stretch of STRETCHES) {
    const f = fit(stretch);
    if (f.vw * CAP >= 5) return f;
  }
  return fit(62.5);
}

const round = (n: number) => Math.round(n * 100) / 100;
