import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright-core";
import { launchBrowser, routeSlug } from "../scripts/shots";
import { assertBuilt, escapeHtml, get, githubStub, ROOT, startSite, STUB_MERGED_TOTAL, stub, type Site } from "./helpers";

const json = (file: string) => JSON.parse(readFileSync(join(ROOT, "content", file), "utf8"));
const lede = { en: json("en/data/about.json").lede as string, de: json("de/data/about.json").lede as string };
const duxTitles = (json("en/data/dux.json").featuredPrs as { title: string; note?: string }[]).map((p) => p.note ?? p.title);

const sites: Site[] = [];
const stubs: { stop(): unknown }[] = [];
async function site(env: Record<string, string> = {}) {
  const s = await startSite(env);
  sites.push(s);
  return s;
}
// Rendered markup only: the RSC payload in <script> tags carries every UI message string.
const markup = (html: string) => html.replace(/<script[^]*?<\/script>/g, "");
const design = (html: string) => /<html[^>]*data-design="([^"]*)"/.exec(html)?.[1];

let main: Site; // no env at all
beforeAll(async () => {
  assertBuilt();
  main = await site();
}, 90_000);
afterAll(async () => {
  await Promise.all([...sites.map((s) => s.stop()), ...stubs.map((s) => s.stop())]);
});

describe("design", () => {
  test("site config default", async () => {
    const res = await get(main, "/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(design(html)).toBe("keynote");
    expect(html).not.toContain("analytics.marlonkranz.com"); // Umami gated on env
  });

  test("env override and cookie precedence", async () => {
    const s = await site({ DESIGN: "thread" });
    expect(design(await (await get(s, "/")).text())).toBe("thread");
    expect(design(await (await get(s, "/", { Cookie: "design=keynote" })).text())).toBe("keynote");
    expect(design(await (await get(s, "/", { Cookie: "design=bogus" })).text())).toBe("thread");
  }, 90_000);

  test("toggle redirect keeps UTM", async () => {
    const res = await get(main, "/?design=thread&utm_source=linkedin&utm_medium=social");
    expect(res.status).toBe(307);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("design=thread");
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).toMatch(/SameSite=lax/i);
    const loc = new URL(res.headers.get("location")!, main.base);
    expect(loc.pathname).toBe("/");
    expect(loc.searchParams.get("utm_source")).toBe("linkedin");
    expect(loc.searchParams.get("utm_medium")).toBe("social");
    expect(loc.searchParams.has("design")).toBe(false);
    const followed = await get(main, loc.pathname + loc.search, { Cookie: "design=thread" });
    expect(design(await followed.text())).toBe("thread");
  });

  test("toggle redirect keeps /de and UTM", async () => {
    const res = await get(main, "/de?design=thread&utm_source=linkedin");
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!, main.base);
    expect(loc.pathname + loc.search).toBe("/de?utm_source=linkedin");
    expect(res.headers.get("set-cookie")).toContain("design=thread");
  });
});

describe("locale", () => {
  test("URL decides the language", async () => {
    const en = await (await get(main, "/")).text();
    expect(en).toContain('<html lang="en"');
    expect(en).toContain(escapeHtml(lede.en));
    expect(en).not.toContain(escapeHtml(lede.de));

    const de = await get(main, "/de");
    expect(de.status).toBe(200);
    const deHtml = await de.text();
    expect(deHtml).toContain('<html lang="de"');
    expect(deHtml).toContain(escapeHtml(lede.de));
    expect(deHtml).not.toContain(escapeHtml(lede.en));

    // no cookie or Accept-Language detection
    const cookieEn = await (await get(main, "/", { Cookie: "NEXT_LOCALE=de", "Accept-Language": "de" })).text();
    expect(cookieEn).toContain('<html lang="en"');
  });

  test("removed project pages are gone", async () => {
    for (const path of ["/projects/devline", "/de/projects/devline", "/projects/bachelor-thesis", "/de/projects/bachelor-thesis"])
      expect((await get(main, path)).status, path).toBe(404);
  });

  test("project pages and legacy prefix", async () => {
    expect((await get(main, "/projects/minj")).status).toBe(200);
    expect((await get(main, "/de/projects/minj")).status).toBe(200);
    const res = await get(main, "/en/projects");
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(new URL(res.headers.get("location")!, main.base).pathname).toBe("/projects");
  });
});

describe("github data", () => {
  test("live PR state from the stub", async () => {
    const gh = githubStub();
    stubs.push(gh);
    const s = await site({ GITHUB_TOKEN: "test", GITHUB_GRAPHQL_URL: gh.url });
    const html = markup(await (await get(s, "/")).text());
    expect(html).toMatch(/dux-shell#3768<\/code><\/a><span class="gh-title">A new system monitor window<\/span>[^]{0,40}data-pr-state="MERGED"/);
    expect(html).toMatch(/dux-shell#3727<\/code><\/a><span class="gh-title">Create and edit network connections in Settings<\/span>[^]{0,40}data-pr-state="OPEN"/);
    expect(html).toContain(`${STUB_MERGED_TOTAL} merged pull requests`);
    expect(html).toContain("Synced");
    expect(gh.calls.length).toBeGreaterThan(0);
    expect(gh.calls.every((c) => c.auth === "bearer test")).toBe(true);
  }, 90_000);

  const clean = async (s: Site) => {
    const res = await get(s, "/");
    expect(res.status).toBe(200);
    const html = markup(await res.text());
    expect(html).not.toContain("data-pr-state");
    expect(html).not.toMatch(/merged pull requests|Synced|Last synced/);
    expect(html).not.toMatch(/GitHub GraphQL|Application error|Internal Server Error/);
    for (const t of duxTitles) expect(html).toContain(escapeHtml(t));
  };

  test("tokenless render is clean", () => clean(main));

  test("GitHub 500 renders cleanly", async () => {
    const gh = githubStub(true);
    stubs.push(gh);
    await clean(await site({ GITHUB_TOKEN: "test", GITHUB_GRAPHQL_URL: gh.url }));
    expect(gh.calls.length).toBeGreaterThan(0);
  }, 90_000);
});

describe("resume", () => {
  const PDF = "%PDF-1.7\nstub-resume-bytes";
  const head = async (res: Response) => new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5));

  test("fallback without URL", async () => {
    const res = await get(main, "/resume.pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(res.headers.get("x-resume-source")).toBe("fallback");
    expect(await head(res)).toBe("%PDF-");
  });

  test("remote PDF from the stub", async () => {
    const pdf = stub(() => new Response(PDF, { headers: { "content-type": "application/pdf" } }));
    stubs.push(pdf);
    const res = await get(await site({ RESUME_PDF_URL: pdf.url }), "/resume.pdf");
    expect(res.headers.get("x-resume-source")).toBe("remote");
    expect(await res.text()).toBe(PDF);
  }, 90_000);

  test("HTML from the stub falls back", async () => {
    const html = stub(() => new Response("<html>login</html>", { headers: { "content-type": "text/html" } }));
    stubs.push(html);
    const res = await get(await site({ RESUME_PDF_URL: html.url }), "/resume.pdf");
    expect(res.headers.get("x-resume-source")).toBe("fallback");
    expect(await head(res)).toBe("%PDF-");
  }, 90_000);
});

describe("analytics (real browser, window.umami stubbed)", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchBrowser();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  /** Click one element, return the non-passive events recorded for it. */
  async function clicked(path: string, selector: string, permissions: string[] = []) {
    const ctx = await browser.newContext({ permissions });
    try {
      const page = await ctx.newPage();
      const events: [string, unknown][] = [];
      await page.exposeFunction("__track", (n: string, d: unknown) => events.push([n, d]));
      await page.addInitScript(() => {
        const w = window as unknown as { umami: unknown; __track(n: string, d: unknown): void };
        w.umami = { track: (n: string, d: unknown) => w.__track(n, d) };
        // Bubble phase runs after the site's capture listener: record, then stay on the page.
        addEventListener("click", (e) => (e.target as Element).closest?.("a") && e.preventDefault());
      });
      await page.route(/^(?!http:\/\/localhost)/, (r) => r.abort());
      await page.goto(main.base + path, { waitUntil: "load" });
      await page.locator(selector).first().click();
      await page.waitForTimeout(300);
      return events.filter(([n]) => n !== "section_view" && n !== "scroll_depth");
    } finally {
      await ctx.close();
    }
  }

  test("outbound link sends one outbound_click", async () => {
    const ev = await clicked("/", 'main a[href^="https://github.com"]');
    expect(ev.map(([n]) => n)).toEqual(["outbound_click"]);
  }, 60_000);

  test("email copy sends one email_copy", async () => {
    // The address is a copy button, not a mailto link, so the click is an email_copy.
    const ev = await clicked("/", ".copy-email .ce-btn", ["clipboard-read", "clipboard-write"]);
    expect(ev.map(([n]) => n)).toEqual(["email_copy"]);
  }, 60_000);

  test("resume link sends one resume_download", async () => {
    const ev = await clicked("/", 'a[href="/resume.pdf"]');
    expect(ev.map(([n]) => n)).toEqual(["resume_download"]);
  }, 60_000);

  test("design toggle sends one design_toggle", async () => {
    const ev = await clicked("/", 'header a[href*="design=thread"]');
    expect(ev).toEqual([["design_toggle", { from: "keynote", to: "thread", via: "header" }]]);
  }, 60_000);

  test("locale switch sends one locale_switch", async () => {
    const ev = await clicked("/", 'header a[hreflang="de"]');
    expect(ev).toEqual([["locale_switch", { from: "en", to: "de" }]]);
  }, 60_000);

  test("color mode sends one color_mode", async () => {
    // The toggle renders a placeholder until mounted; match the real button by its label.
    const ev = await clicked("/", 'header button[aria-label$=" mode"]');
    expect(ev.map(([n]) => n)).toEqual(["color_mode"]);
  }, 60_000);
});

describe("visual smoke", () => {
  test("shots harness passes against the test server", () => {
    const ROUTES = ["/", "/projects/minj"];
    const run = (routes = ROUTES.join(","), locales = "en,de", extra: string[] = []) =>
      spawnSync(
      "bun",
      [
        "scripts/shots.ts",
        "--url", main.base,
        "--routes", routes,
        "--locales", locales,
        ...extra,
        "--label", "e2e",
        "--out", join(tmpdir(), "portfolio-e2e-shots"),
      ],
      { cwd: ROOT, encoding: "utf8", timeout: 280_000 },
    );
    // A single unattributed 50-66ms long task (SwiftShader) flakes jank on a different page each run.
    // When jank alone fails, with measured numbers on every failing line, retry once for just
    // those pages. Anything else (another check, a jank run that errored) keeps the first failure.
    let r = run();
    const out = () => (r.stdout ?? "") + (r.stderr ?? "");
    const fails = [...out().matchAll(/^ {2}FAIL (\S+)/gm)].map((m) => m[1]);
    const bySlug = new Map(ROUTES.map((route) => [routeSlug(route), route]));
    const bad = [...out().matchAll(/^ {2}FAIL jank (\S+?)-(en|de)-(keynote|thread): p95 [\d.]+ms/gm)];
    const routes = bad.map((m) => bySlug.get(m[1]));
    const retry =
      r.status !== 0 && bad.length > 0 && bad.length === fails.length && fails.every((f) => f === "jank") && routes.every(Boolean);
    if (retry) {
      const first = out();
      r = run(
        [...new Set(routes)].join(","),
        [...new Set(bad.map((m) => m[2]))].join(","),
        ["--designs", [...new Set(bad.map((m) => m[3]))].join(",")],
      );
      expect(r.status, `retry after jank:\n${first}\n--- retry:\n${out()}`).toBe(0);
    }
    expect(r.status, out()).toBe(0);
  }, 600_000);
});
