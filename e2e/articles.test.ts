import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertBuilt, get, ROOT, startSite, stub, type Site } from "./helpers";

// HTTP-level checks of the articles and SEO against the production build.
const SLUGS = ["bpmnscript", "dux", "devline"] as const;
const DESIGNS = ["keynote", "thread", "flow", "type"] as const;
const ORIGIN = "https://marlonkranz.com";

const json = (file: string) => JSON.parse(readFileSync(join(ROOT, "content", file), "utf8"));
const markup = (html: string) => html.replace(/<script[^]*?<\/script>/g, "");
const text = async (s: Site, path: string, headers: Record<string, string> = {}) => (await get(s, path, headers)).text();
const links = (html: string, rel: string) =>
  [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]).filter((l) => l.includes(`rel="${rel}"`));
const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`, "i").exec(tag)?.[1];
const meta = (html: string, key: string) => {
  const tag = [...html.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]).find((m) => m.includes(`"${key}"`));
  return tag && attr(tag, "content");
};
const jsonLd = (html: string): Record<string, unknown>[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)].flatMap((m) => {
    const v = JSON.parse(m[1]);
    return Array.isArray(v) ? v : (v["@graph"] ?? [v]);
  });
const types = (html: string) => jsonLd(html).map((n) => n["@type"]);

const sites: Site[] = [];
const stubs: { stop(): unknown }[] = [];
let main: Site;
beforeAll(async () => {
  assertBuilt();
  main = await startSite();
  sites.push(main);
}, 90_000);
afterAll(async () => {
  await Promise.all([...sites.map((s) => s.stop()), ...stubs.map((s) => s.stop())]);
});

describe("articles", () => {
  for (const design of DESIGNS)
    for (const locale of ["en", "de"] as const)
      for (const slug of SLUGS)
        test(`${slug} renders (${design}, ${locale})`, async () => {
          const path = locale === "en" ? `/${slug}` : `/de/${slug}`;
          const res = await get(main, path, { Cookie: `design=${design}` });
          expect(res.status).toBe(200);
          const html = await res.text();
          expect(html).toContain(`<html lang="${locale}"`);
          const data = json(`${locale}/data/article-${slug}.json`).meta;
          const h1 = /<h1[^>]*>([^]*?)<\/h1>/.exec(markup(html))![1].replace(/<[^>]+>/g, "");
          expect(h1.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&")).toContain(data.title);
          for (const s of data.sections as { id: string }[]) expect(markup(html)).toMatch(new RegExp(`<section[^>]*id="${s.id}"`));
        });
});

describe("seo", () => {
  const pages = [
    ["/", "en", "/"],
    ["/de", "de", "/de"],
    ["/dux", "en", "/dux"],
    ["/de/dux", "de", "/de/dux"],
    ["/playground", "en", "/playground"],
    ["/projects/minj", "en", "/projects/minj"],
  ] as const;
  for (const [path, locale, canonical] of pages)
    test(`canonical, hreflang and social tags on ${path}`, async () => {
      const html = await text(main, path);
      const canon = links(html, "canonical");
      expect(canon).toHaveLength(1);
      expect(attr(canon[0], "href")).toBe(ORIGIN + (canonical === "/" ? "" : canonical));
      const alt = Object.fromEntries(links(html, "alternate").map((l) => [attr(l, "hreflang"), attr(l, "href")]));
      // The playground is English only: no German alternate.
      const langs = path === "/playground" ? ["en", "x-default"] : ["en", "de", "x-default"];
      for (const k of langs) expect(alt[k], k).toStartWith(ORIGIN);
      if (path === "/playground") expect(alt.de).toBeUndefined();
      expect(alt["x-default"]).toBe(alt.en);
      expect(meta(html, "og:locale")).toBe(locale === "de" ? "de_DE" : "en_US");
      expect(meta(html, "twitter:card")).toBe("summary_large_image");
      const img = new URL(meta(html, "og:image")!);
      const res = await fetch(main.base + img.pathname);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/jpeg");
    });

  test("JSON-LD parses and has the right types", async () => {
    const home = await text(main, "/");
    expect(jsonLd(home).find((n) => n["@type"] === "Person")?.sameAs).toBeTruthy();
    const bpmn = await text(main, "/bpmnscript");
    expect(types(bpmn)).toEqual(expect.arrayContaining(["TechArticle", "SoftwareSourceCode", "Thesis"]));
    expect(jsonLd(bpmn).find((n) => n["@type"] === "SoftwareSourceCode")?.license).toMatch(/apache.*2\.0/i);
    expect(String(jsonLd(bpmn).find((n) => n["@type"] === "Thesis")?.url)).toEndWith("/thesis.pdf");
    const devline = await text(main, "/devline");
    expect(types(devline)).toEqual(expect.arrayContaining(["TechArticle", "SoftwareSourceCode"]));
    expect(jsonLd(devline).find((n) => n["@type"] === "SoftwareSourceCode")?.license).toMatch(/MIT/);
    expect(types(await text(main, "/dux"))).toContain("TechArticle");
  });

  test("sitemap and robots", async () => {
    const xml = await text(main, "/sitemap.xml");
    for (const p of ["", "/bpmnscript", "/dux", "/devline", "/projects", "/projects/minj"]) {
      expect(xml).toContain(`<loc>${ORIGIN}${p}</loc>`);
      expect(xml).toContain(`<loc>${ORIGIN}/de${p}</loc>`);
    }
    expect(xml).toContain(`<loc>${ORIGIN}/playground</loc>`);
    expect(xml).not.toContain(`${ORIGIN}/de/playground`);
    expect(xml).toContain('hreflang="x-default"');
    expect(xml).not.toMatch(/projects\/(devline|bachelor-thesis)/);
    expect(await text(main, "/robots.txt")).toContain("sitemap.xml");
  });
});

describe("routes", () => {
  test("removed project pages 404 and /projects does not link to them", async () => {
    for (const p of ["/projects/devline", "/de/projects/devline", "/projects/bachelor-thesis", "/de/projects/bachelor-thesis"])
      expect((await get(main, p)).status, p).toBe(404);
    for (const p of ["/projects", "/de/projects"]) expect(await text(main, p)).not.toMatch(/projects\/(devline|bachelor-thesis)/);
  });

  test("thesis PDF is served", async () => {
    const res = await get(main, "/thesis.pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  for (const design of DESIGNS)
    test(`home links to the articles and thesis (${design})`, async () => {
      const cookie = { Cookie: `design=${design}` };
      const en = await text(main, "/", cookie);
      for (const p of ["/bpmnscript", "/dux", "/devline", "/thesis.pdf"]) expect(en, p).toContain(`href="${p}"`);
      const de = await text(main, "/de", cookie);
      for (const p of ["/de/bpmnscript", "/de/dux", "/de/devline", "/thesis.pdf"]) expect(de, p).toContain(`href="${p}"`);
      for (const html of [en, de]) expect(html).not.toMatch(/projects\/(devline|bachelor-thesis)/);
    });
});

describe("live PR state on /dux", () => {
  const prState = (html: string, n: number) =>
    new RegExp(`pull/${n}"[^]{0,600}?data-pr-state="(\\w+)"`).exec(markup(html))?.[1];

  test("MERGED for an org PR that is not featured, OPEN for #3727", async () => {
    const node = (number: number, state: string) => ({
      number,
      title: `STUB ${number}`,
      url: `https://github.com/duxlabs-dev/dux-shell/pull/${number}`,
      state,
      createdAt: "2026-05-01T00:00:00Z",
      mergedAt: state === "MERGED" ? "2026-06-01T00:00:00Z" : null,
      additions: 10,
      deletions: 2,
      reviews: { totalCount: 3 },
      repository: { nameWithOwner: "duxlabs-dev/dux-shell" },
    });
    const gh = stub(async (req) => {
      const { query } = (await req.json()) as { query: string };
      const data: Record<string, unknown> = {};
      for (const m of query.matchAll(/(p\d+): repository\([^)]*\) \{ pullRequest\(number: (\d+)\)/g))
        data[m[1]] = { pullRequest: Number(m[2]) === 3727 ? node(3727, "OPEN") : null };
      data.merged = { issueCount: 947 };
      data.open = { issueCount: 1 };
      data.list = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [node(3727, "OPEN"), node(4150, "MERGED")] };
      return Response.json({ data });
    });
    stubs.push(gh);
    const s = await startSite({ GITHUB_TOKEN: "test", GITHUB_GRAPHQL_URL: gh.url });
    sites.push(s);
    for (const design of DESIGNS) {
      const html = await text(s, "/dux", { Cookie: `design=${design}` });
      expect(prState(html, 4150), design).toBe("MERGED");
      expect(prState(html, 3727), design).toBe("OPEN");
    }
  }, 90_000);

  test("without a token there is no live state and each PR shows its plain-language note", async () => {
    const html = markup(await text(main, "/dux"));
    expect(html).not.toContain("data-pr-state");
    expect(html).not.toMatch(/Synced|Last synced|merged pull requests/);
    expect(html).toContain("List wallpapers reliably, even with unusual file names");
  });
});
