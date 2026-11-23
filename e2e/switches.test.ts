import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { assertBuilt, get, startSite, type Site, markup } from "./helpers";

// The first public release: two designs, no German, no articles. The runtime switches must hide the rest.
const location = (s: Site, r: Response) => {
  const u = new URL(r.headers.get("location") ?? "", s.base);
  return u.pathname + u.search;
};
const page = async (s: Site, path: string, headers: Record<string, string> = {}) => (await get(s, path, headers)).text();

let site: Site;
beforeAll(async () => {
  assertBuilt();
  // DESIGN names a disabled design on purpose: it must be ignored too.
  site = await startSite({ DESIGNS: "keynote,type", GERMAN: "", ARTICLES: "", DESIGN: "flow" });
}, 90_000);
afterAll(() => site?.stop());

describe("release switches (DESIGNS=keynote,type, GERMAN and ARTICLES unset)", () => {
  test("only Ink and Type are offered, in the header icon, the menu and the footer", async () => {
    for (const design of ["keynote", "type"] as const) {
      const html = markup(await page(site, "/", { Cookie: `design=${design}` }));
      expect(html, design).toContain(`data-design="${design}"`);
      const offered = new Set([...html.matchAll(/href="\?design=(\w+)"/g)].map((m) => m[1]));
      expect([...offered], design).toEqual([design === "keynote" ? "type" : "keynote"]);
      // The footer's text switch is there, listing just the two.
      expect(html, design).toContain("ctl-switch ctl-design");
    }
  });

  test("a disabled design is ignored: ?design=flow sets no cookie, and a flow cookie or DESIGN=flow falls back to Ink", async () => {
    const r = await get(site, "/projects?design=flow&utm_source=x");
    expect(r.status).toBe(307);
    expect(location(site, r)).toBe("/projects?utm_source=x");
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(await page(site, "/")).toContain('data-design="keynote"');
    expect(await page(site, "/", { Cookie: "design=flow" })).toContain('data-design="keynote"');
    const ok = await get(site, "/?design=type");
    expect(ok.headers.get("set-cookie")).toContain("design=type");
  });

  test("/de URLs redirect to the English page, keeping the query", async () => {
    for (const [from, to] of [
      ["/de", "/"],
      ["/de/x", "/x"],
      ["/de/projects?utm_source=x", "/projects?utm_source=x"],
    ]) {
      const r = await get(site, from);
      expect(r.status, from).toBe(307);
      expect(location(site, r), from).toBe(to);
    }
  });

  test("no language toggle, no de hreflang and no German alternates anywhere on the page", async () => {
    for (const design of ["keynote", "type"] as const) {
      const html = await page(site, "/", { Cookie: `design=${design}` });
      expect(html, design).not.toContain("ctl-locale");
      expect(html, design).not.toMatch(/hreflang="de"/i);
      expect(html, design).not.toMatch(/marlonkranz\.com\/de(?![a-z])/);
      expect(html, design).not.toContain("de_DE");
      expect(html, design).toMatch(/hreflang="en"/i);
    }
    expect(await page(site, "/projects")).not.toMatch(/hreflang="de"/i);
  });

  test("the sitemap lists only English URLs", async () => {
    const xml = await page(site, "/sitemap.xml");
    expect(xml).toContain("<loc>https://marlonkranz.com</loc>");
    expect(xml).not.toMatch(/marlonkranz\.com\/de(?![a-z])/);
    expect(xml).not.toMatch(/hreflang="de"/);
  });

  test("with articles off, the homepage links to no article", async () => {
    for (const design of ["keynote", "type"] as const) {
      const html = markup(await page(site, "/", { Cookie: `design=${design}` }));
      expect(html, design).not.toMatch(/href="\/(de\/)?(bpmnscript|dux|devline)[/"?#]/);
    }
  });
});
