import { describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  ARTICLE_SLUGS,
  contentGithubRefs,
  contentRoot,
  getArticle,
  getHomeContent,
  getProjectSource,
  loadJson,
} from "./content";

const fixtures = path.join(import.meta.dir, "__fixtures__", "content");

describe("loaders", () => {
  test("getHomeContent loads all sections", async () => {
    const c = await getHomeContent("en", fixtures);
    expect(Object.keys(c).sort()).toEqual(["about", "bpmnscript", "contact", "dux", "education", "projects", "work"]);
    expect(c.about.lede).toBe("Hello");
  });

  test("locale fallback per file", async () => {
    const c = await getHomeContent("de", fixtures);
    expect(c.about.lede).toBe("Hallo");
    expect(c.contact.email).toBe("contact@example.test");
  });

  test("malformed JSON throws with path", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-"));
    fs.mkdirSync(path.join(root, "en", "data"), { recursive: true });
    fs.writeFileSync(path.join(root, "en", "data", "about.json"), "{nope");
    await expect(loadJson("en", "about.json", root)).rejects.toThrow(path.join(root, "en", "data", "about.json"));
  });

  test("locale isolation", async () => {
    const en = await getHomeContent("en", fixtures);
    const de = await getHomeContent("de", fixtures);
    expect(de.work.jobs[0].role).toBe("Entwickler");
    expect(en.work.jobs[0].role).toBe("Developer");
    expect({ ...de, about: 0, work: 0 }).toEqual({ ...en, about: 0, work: 0 });
  });

  test("contentGithubRefs dedupes repos and lists PRs", async () => {
    const refs = contentGithubRefs(await getHomeContent("en", fixtures));
    expect(refs.repos.sort()).toEqual(["o/bpmn", "o/shell"]);
    expect(refs.prs).toEqual(["o/shell#1", "o/shell#2"]);
  });
});

// email is intentionally per locale (contact@ vs kontakt@), so it is not a fact key.
const FACT_KEYS = new Set(["id", "slug", "start", "end", "url", "href", "repo", "shellRepo", "ref", "src", "value", "scale", "status", "type", "event", "command", "published", "updated", "plate"]);

/** Returns "path: reason" for the first EN/DE mismatch, or null. */
function diff(a: unknown, b: unknown, p = "$", key = ""): string | null {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return `${p}: array vs non-array`;
    if (a.length !== b.length) return `${p}: length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = diff(a[i], b[i], `${p}[${i}]`, key);
      if (d) return d;
    }
    return null;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort().join();
    const kb = Object.keys(b).sort().join();
    if (ka !== kb) return `${p}: keys {${ka}} vs {${kb}}`;
    for (const k of Object.keys(a)) {
      const d = diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${p}.${k}`, k);
      if (d) return d;
    }
    return null;
  }
  if (a === null || b === null || typeof a !== typeof b) return a === b ? null : `${p}: type ${typeof a} vs ${typeof b}`;
  if (typeof a !== "string" || FACT_KEYS.has(key)) return a === b ? null : `${p}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  return null;
}

function parity(root: string): string | null {
  const dir = (l: string) => path.join(root, l, "data");
  for (const f of fs.readdirSync(dir("en")).filter((f) => f.endsWith(".json"))) {
    if (!fs.existsSync(path.join(dir("de"), f))) continue;
    const read = (l: string) => JSON.parse(fs.readFileSync(path.join(dir(l), f), "utf-8"));
    const d = diff(read("en"), read("de"));
    if (d) return `${f} ${d}`;
  }
  return null;
}

describe("real content", () => {
  test("every job has a logo that exists under public/", () => {
    for (const l of ["en", "de"]) {
      const { jobs } = JSON.parse(fs.readFileSync(path.join(contentRoot, l, "data", "work.json"), "utf-8"));
      for (const j of jobs) {
        expect(j.logo?.src, `${l}/${j.id}`).toBeTruthy();
        expect(fs.existsSync(path.join(process.cwd(), "public", j.logo.src)), `${l}/${j.id}`).toBe(true);
      }
    }
  });
});

describe("EN/DE parity", () => {
  test("real content tree matches", () => {
    expect(parity(contentRoot)).toBeNull();
  });

  test("mismatched start is reported with JSON path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "parity-"));
    fs.cpSync(fixtures, root, { recursive: true });
    const f = path.join(root, "de", "data", "work.json");
    fs.writeFileSync(f, fs.readFileSync(f, "utf-8").replace("2020-01", "2021-01"));
    expect(parity(root)).toContain("work.json $.jobs[0].start");
  });
});

describe("articles", () => {
  test("getArticle loads JSON and MDX for each slug", async () => {
    for (const slug of ARTICLE_SLUGS) {
      const { data, mdx } = await getArticle("en", slug, fixtures);
      expect(data.meta.sections.length).toBe(2);
      expect(mdx).toContain('<Section id="intro">');
    }
  });

  test("DE falls back to the EN MDX but keeps DE JSON", async () => {
    const { data, mdx } = await getArticle("de", "dux", fixtures);
    expect(data.meta.title).toBe("T de");
    expect(mdx).toBe(fs.readFileSync(path.join(fixtures, "en", "articles", "dux.mdx"), "utf-8"));
    expect((await getArticle("de", "devline", fixtures)).mdx).toContain("Hallo.");
  });

  test("malformed article JSON rejects with the file path", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "article-"));
    fs.cpSync(fixtures, root, { recursive: true });
    const f = path.join(root, "en", "data", "article-dux.json");
    fs.writeFileSync(f, "{nope");
    await expect(getArticle("en", "dux", root)).rejects.toThrow(f);
  });

  test("a non-ENOENT MDX error is not swallowed", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "article-"));
    fs.cpSync(fixtures, root, { recursive: true });
    const f = path.join(root, "de", "articles", "devline.mdx");
    fs.rmSync(f);
    fs.mkdirSync(f); // reading a directory throws EISDIR
    await expect(getArticle("de", "devline", root)).rejects.toThrow();
  });
});

/** Values of `attr` on every `<tag …>` (any attribute order; "x", 'x' or {"x"}); null marks a tag whose value couldn't be read. */
function tagAttrs(mdx: string, tag: string, attr: string): (string | null)[] {
  const val = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["']([^"']*)["']\\s*\\})`);
  return [...mdx.matchAll(new RegExp(`<${tag}\\b((?:"[^"]*"|'[^']*'|\\{[^}]*\\}|[^>])*)>`, "g"))].map((m) => {
    const v = m[1].match(val);
    return v ? (v[1] ?? v[2] ?? v[3]) : null;
  });
}

/**
 * Returns "slug locale: reason" for the first MDX/JSON reference problem, or null. Files resolve like
 * getArticle (locale, else EN); a slug is skipped only when it has neither EN MDX nor EN JSON.
 */
function articleRefs(root: string): string | null {
  const file = (l: string, slug: string, kind: "mdx" | "json") =>
    path.join(root, l, kind === "mdx" ? "articles" : "data", kind === "mdx" ? `${slug}.mdx` : `article-${slug}.json`);
  for (const slug of ARTICLE_SLUGS) {
    const enMdx = fs.existsSync(file("en", slug, "mdx"));
    const enJson = fs.existsSync(file("en", slug, "json"));
    if (!enMdx && !enJson) continue;
    if (enMdx !== enJson) return `${slug} en: ${enMdx ? "mdx without json" : "json without mdx"}`;
    for (const l of ["en", "de"]) {
      const pick = (kind: "mdx" | "json") => (fs.existsSync(file(l, slug, kind)) ? file(l, slug, kind) : file("en", slug, kind));
      // Fenced code may show tags as examples.
      const mdx = fs.readFileSync(pick("mdx"), "utf-8").replace(/^(`{3,}|~{3,})[\s\S]*?^\1/gm, "");
      const data = JSON.parse(fs.readFileSync(pick("json"), "utf-8"));
      const where = `${slug} ${l}`;

      const sections = tagAttrs(mdx, "Section", "id");
      const want = (data.meta.sections as { id: string }[]).map((s) => s.id);
      if (sections.join() !== want.join())
        return `${where}: Section ids [${sections}] do not match meta.sections [${want}]`;

      const has = (list: { id: string }[] | undefined) => new Set((list ?? []).map((x) => x.id));
      const checks: [string, (string | null)[], Set<string>][] = [
        ["Figure", tagAttrs(mdx, "Figure", "id"), has(data.figures)],
        ["Num", tagAttrs(mdx, "Num", "id"), has(data.numbers)],
        ["Pct", [...tagAttrs(mdx, "Pct", "of"), ...tagAttrs(mdx, "Pct", "in")], has(data.numbers)],
        ["Contribution", tagAttrs(mdx, "Contribution", "id"), has(data.contributions)],
      ];
      for (const [tag, used, known] of checks)
        for (const id of used) {
          if (id === null) return `${where}: a <${tag}> has no readable id`;
          if (!known.has(id)) return `${where}: <${tag}> id "${id}" not in JSON`;
        }
    }
  }
  return null;
}

describe("article MDX references", () => {
  test("fixtures are consistent", () => {
    expect(articleRefs(fixtures)).toBeNull();
  });

  test("a Section id missing from JSON names slug, locale and id", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));
    fs.cpSync(fixtures, root, { recursive: true });
    const f = path.join(root, "en", "articles", "devline.mdx");
    fs.writeFileSync(f, fs.readFileSync(f, "utf-8").replace('id="stages"', 'id="nope"'));
    const r = articleRefs(root);
    expect(r).toContain("devline en");
    expect(r).toContain("nope");
  });

  test("reordered Sections fail", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));
    fs.cpSync(fixtures, root, { recursive: true });
    const f = path.join(root, "de", "articles", "bpmnscript.mdx");
    fs.writeFileSync(f, '<Section id="result">\nA\n</Section>\n<Section id="intro">\nB\n</Section>\n');
    expect(articleRefs(root)).toContain("bpmnscript de");
  });

  test("an unknown Num, Pct or Figure id fails", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));
    fs.cpSync(fixtures, root, { recursive: true });
    const f = path.join(root, "en", "articles", "bpmnscript.mdx");
    const src = fs.readFileSync(f, "utf-8");
    fs.writeFileSync(f, src.replace('in="n-b"', 'in="n-z"'));
    expect(articleRefs(root)).toContain('"n-z"');
    fs.writeFileSync(f, src.replace('<Figure id="fig-a"', '<Figure id="fig-z"'));
    expect(articleRefs(root)).toContain('"fig-z"');
  });

  test("DE JSON is checked against the EN MDX it falls back to", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));
    fs.cpSync(fixtures, root, { recursive: true });
    const f = path.join(root, "de", "data", "article-dux.json");
    const data = JSON.parse(fs.readFileSync(f, "utf-8"));
    data.meta.sections.reverse();
    fs.writeFileSync(f, JSON.stringify(data));
    expect(articleRefs(root)).toContain("dux de");
  });

  test("an EN MDX without its JSON fails", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));
    fs.cpSync(fixtures, root, { recursive: true });
    for (const l of ["en", "de"]) fs.rmSync(path.join(root, l, "data", "article-dux.json"), { force: true });
    expect(articleRefs(root)).toContain("dux en: mdx without json");
  });

  test("any attribute order and quoting is read; fenced examples are ignored", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));
    fs.cpSync(fixtures, root, { recursive: true });
    const f = path.join(root, "en", "articles", "bpmnscript.mdx");
    const src = fs.readFileSync(f, "utf-8");
    fs.writeFileSync(f, src.replace('<Figure id="fig-a"', `<Figure alt="a > b" id={'fig-a'}`) + '\n```mdx\n<Figure id="nope" />\n```\n');
    expect(articleRefs(root)).toBeNull();
    fs.writeFileSync(f, src.replace('<Figure id="fig-a"', `<Figure alt="x" id='fig-z'`));
    expect(articleRefs(root)).toContain('"fig-z"');
  });

  test("real content tree is consistent", () => {
    expect(articleRefs(contentRoot)).toBeNull();
  });
});

describe("hardening", () => {
  test("bad JSON in a DE file throws naming the DE path, no EN fallback", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-"));
    for (const l of ["en", "de"]) fs.mkdirSync(path.join(root, l, "data"), { recursive: true });
    fs.writeFileSync(path.join(root, "en", "data", "about.json"), "{}");
    fs.writeFileSync(path.join(root, "de", "data", "about.json"), "{nope");
    await expect(loadJson("de", "about.json", root)).rejects.toThrow(path.join(root, "de", "data", "about.json"));
  });

  test("getProjectSource rejects bad slug and locale", async () => {
    await expect(getProjectSource("en", "../x")).rejects.toThrow("Invalid project slug");
    await expect(getProjectSource("xx" as never, "a")).rejects.toThrow("Invalid locale");
  });

  test("contentGithubRefs dedupes case-insensitively and includes pr-dots repos", async () => {
    const home = await getHomeContent("en", fixtures);
    home.bpmnscript.panel = { did: [], viz: { type: "pr-dots", caption: "c", repos: ["O/BPMN", "o/extra"] } };
    expect(contentGithubRefs(home).repos.sort()).toEqual(["o/bpmn", "o/extra", "o/shell"]);
  });
});
