import { expect, test } from "bun:test";
import { loadSitemapInput, sitemapEntries } from "./sitemap";

// The real content with articles published; the unpublished case is the last test.
process.env.ARTICLES = "on";

test("sitemap has an EN and a DE entry per page, each with both alternates", async () => {
  const input = await loadSitemapInput();
  const entries = sitemapEntries(input);
  const paths = ["/", "/bpmnscript", "/dux", "/devline", "/projects", ...input.projectSlugs.map((s) => `/projects/${s}`)];
  expect(input.projectSlugs.length).toBeGreaterThan(0);
  expect(entries).toHaveLength(paths.length * 2 + 1);
  for (const p of paths) {
    const en = "https://marlonkranz.com" + (p === "/" ? "" : p);
    const de = "https://marlonkranz.com/de" + (p === "/" ? "" : p);
    for (const url of [en, de]) {
      const e = entries.find((x) => x.url === url);
      expect(e?.alternates?.languages).toEqual({ en, de, "x-default": en });
    }
  }
  expect(entries.filter((e) => /^https:\/\/marlonkranz\.com\/de(\/|$)/.test(e.url)).length).toBe(paths.length);
  // English only: one entry, no German alternate.
  const pg = "https://marlonkranz.com/playground";
  expect(entries.filter((e) => e.url.endsWith("/playground"))).toEqual([{ url: pg, alternates: { languages: { en: pg, "x-default": pg } } }]);
});

test("removed project pages are not listed, and dates are real", async () => {
  const entries = sitemapEntries(await loadSitemapInput());
  expect(entries.some((e) => /\/projects\/(devline|bachelor-thesis)$/.test(e.url))).toBe(false);
  for (const e of entries) {
    if (e.lastModified !== undefined) expect(String(e.lastModified)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  expect(entries.find((e) => e.url.endsWith("/dux"))?.lastModified).toBeDefined();
  expect(entries.find((e) => e.url.endsWith("/projects/minj"))?.lastModified).toBeUndefined();
});

test("unpublished articles stay out of the sitemap", async () => {
  process.env.ARTICLES = "";
  try {
    expect((await loadSitemapInput()).articles).toEqual([]);
  } finally {
    process.env.ARTICLES = "on";
  }
});
