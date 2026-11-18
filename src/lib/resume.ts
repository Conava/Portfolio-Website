import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ResumeSource = "remote" | "cache" | "fallback";

const TTL = 60 * 60_000;
const BACKOFF = 5 * 60_000;
const MAX_BYTES = 10 * 1024 * 1024;

let good: { body: Uint8Array; at: number } | null = null;
let retryAt = 0;
let inflight: Promise<Uint8Array | null> | null = null;

/** @internal test-only */
export function resetResumeCache() {
  good = null;
  retryAt = 0;
  inflight = null;
}

async function fetchPdf(url: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get("content-length")) > MAX_BYTES) throw new Error("too large");
  const body = new Uint8Array(await res.arrayBuffer());
  if (body.length >= MAX_BYTES) throw new Error("too large");
  if (new TextDecoder().decode(body.subarray(0, 5)) !== "%PDF-") throw new Error("not a PDF");
  return body;
}

/**
 * Latest resume PDF: remote (cached 1 h) -> last good copy -> bundled fallback.
 * After a failed fetch the remote is not retried for 5 min.
 */
export async function getResumePdf(
  opts: { url?: string | null; fetchImpl?: typeof fetch; now?: () => number; fallbackPath?: string } = {},
): Promise<{ body: Uint8Array; source: ResumeSource }> {
  const url = opts.url === undefined ? process.env.RESUME_PDF_URL : opts.url;
  const now = (opts.now ?? Date.now)();
  const fallback = async () => ({
    // The Dockerfile copies content/ next to server.js; don't let tracing pull in the whole project.
    body: new Uint8Array(await readFile(/*turbopackIgnore: true*/ opts.fallbackPath ?? join(process.cwd(), "content/resume.pdf"))),
    source: "fallback" as const,
  });
  if (!url) return fallback();

  if (good && now - good.at < TTL) return { body: good.body, source: "cache" };

  if (inflight || now >= retryAt) {
    inflight ??= fetchPdf(url, opts.fetchImpl ?? fetch)
      .then((body) => {
        good = { body, at: now };
        return body;
      })
      .catch((err) => {
        retryAt = now + BACKOFF;
        // host only: the share token lives in the path
        console.warn(`resume fetch from ${URL.canParse(url) ? new URL(url).host : "invalid-url"} failed: ${err instanceof Error ? err.message : err}`);
        return null;
      })
      .finally(() => {
        inflight = null;
      });
    const body = await inflight;
    if (body) return { body, source: "remote" };
  }
  return good ? { body: good.body, source: "cache" } : fallback();
}
