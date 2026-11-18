import { beforeEach, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getResumePdf, resetResumeCache } from "./resume";

const dir = mkdtempSync(join(tmpdir(), "resume-"));
const fallbackPath = join(dir, "fb.pdf");
writeFileSync(fallbackPath, "%PDF-fallback");
const pdf = (s: string) => new Response(`%PDF-1.7 ${s}`);
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const URL_ = "https://cloud.example.com/s/secrettoken/download";
const MIN = 60_000;

beforeEach(resetResumeCache);

test("no URL serves fallback", async () => {
  const r = await getResumePdf({ url: null, fallbackPath });
  expect(r.source).toBe("fallback");
  expect(text(r.body)).toBe("%PDF-fallback");
});

test("remote is served then cached; refetched after 1 h", async () => {
  let t = 0;
  let calls = 0;
  const fetchImpl = (async () => (calls++, pdf("a"))) as unknown as typeof fetch;
  const o = { url: URL_, fetchImpl, now: () => t, fallbackPath };
  expect((await getResumePdf(o)).source).toBe("remote");
  expect((await getResumePdf(o)).source).toBe("cache");
  expect(calls).toBe(1);
  t = 61 * MIN;
  expect((await getResumePdf(o)).source).toBe("remote");
  expect(calls).toBe(2);
});

test("invalid remote content falls back", async () => {
  const fetchImpl = (async () => new Response("<html>login</html>")) as unknown as typeof fetch;
  const r = await getResumePdf({ url: URL_, fetchImpl, fallbackPath });
  expect(r.source).toBe("fallback");
});

test("last good copy survives an outage; backoff for 5 min", async () => {
  let t = 0;
  let calls = 0;
  let fail = false;
  const fetchImpl = (async () => {
    calls++;
    if (fail) throw new Error("down");
    return pdf("good");
  }) as unknown as typeof fetch;
  const o = { url: URL_, fetchImpl, now: () => t, fallbackPath };
  await getResumePdf(o);
  fail = true;
  t = 61 * MIN;
  const r = await getResumePdf(o);
  expect(r.source).toBe("cache");
  expect(text(r.body)).toContain("good");
  expect(calls).toBe(2);
  t += 4 * MIN;
  await getResumePdf(o);
  expect(calls).toBe(2);
  t += 2 * MIN;
  await getResumePdf(o);
  expect(calls).toBe(3);
});

test("concurrent requests share one fetch", async () => {
  let calls = 0;
  const fetchImpl = (async () => (calls++, pdf("a"))) as unknown as typeof fetch;
  const o = { url: URL_, fetchImpl, fallbackPath };
  await Promise.all([getResumePdf(o), getResumePdf(o)]);
  expect(calls).toBe(1);
});

test("malformed URL and oversized content-length fall back", async () => {
  const big = (async () =>
    new Response("%PDF-x", { headers: { "content-length": String(11 * 1024 * 1024) } })) as unknown as typeof fetch;
  expect((await getResumePdf({ url: URL_, fetchImpl: big, fallbackPath })).source).toBe("fallback");
  resetResumeCache();
  const boom = (async () => { throw new Error("x"); }) as unknown as typeof fetch;
  expect((await getResumePdf({ url: "not a url", fetchImpl: boom, fallbackPath })).source).toBe("fallback");
});
