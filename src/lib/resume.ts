import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ResumeSource = "remote" | "cache" | "fallback";
/** en: the international CV at /resume.pdf; de: the German Lebenslauf at /resume-de.pdf. */
export type ResumeVariant = "en" | "de";

const VARIANTS = {
  en: { env: "RESUME_PDF_URL", file: "content/resume.pdf" },
  de: { env: "RESUME_PDF_URL_DE", file: "content/resume-de.pdf" },
} as const;

const TTL = 60 * 60_000;
const BACKOFF = 5 * 60_000;
const MAX_BYTES = 10 * 1024 * 1024;

type State = { good: { body: Uint8Array; at: number } | null; retryAt: number; inflight: Promise<Uint8Array | null> | null };
const fresh = (): State => ({ good: null, retryAt: 0, inflight: null });
let states: Record<ResumeVariant, State> = { en: fresh(), de: fresh() };

/** @internal test-only */
export function resetResumeCache() {
  states = { en: fresh(), de: fresh() };
}

/** Whether a German resume can be served (a remote URL or the bundled file). */
export function hasGermanResume(): boolean {
  return !!process.env[VARIANTS.de.env] || existsSync(/*turbopackIgnore: true*/ join(process.cwd(), VARIANTS.de.file));
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
  opts: { variant?: ResumeVariant; url?: string | null; fetchImpl?: typeof fetch; now?: () => number; fallbackPath?: string } = {},
): Promise<{ body: Uint8Array; source: ResumeSource }> {
  const v = VARIANTS[opts.variant ?? "en"];
  const s = states[opts.variant ?? "en"];
  const url = opts.url === undefined ? process.env[v.env] : opts.url;
  const now = (opts.now ?? Date.now)();
  const fallback = async () => ({
    // The Dockerfile copies content/ next to server.js; don't let tracing pull in the whole project.
    body: new Uint8Array(await readFile(/*turbopackIgnore: true*/ opts.fallbackPath ?? join(process.cwd(), v.file))),
    source: "fallback" as const,
  });
  if (!url) return fallback();

  if (s.good && now - s.good.at < TTL) return { body: s.good.body, source: "cache" };

  if (s.inflight || now >= s.retryAt) {
    s.inflight ??= fetchPdf(url, opts.fetchImpl ?? fetch)
      .then((body) => {
        s.good = { body, at: now };
        return body;
      })
      .catch((err) => {
        s.retryAt = now + BACKOFF;
        // host only: the share token lives in the path
        console.warn(`resume fetch from ${URL.canParse(url) ? new URL(url).host : "invalid-url"} failed: ${err instanceof Error ? err.message : err}`);
        return null;
      })
      .finally(() => {
        s.inflight = null;
      });
    const body = await s.inflight;
    if (body) return { body, source: "remote" };
  }
  return s.good ? { body: s.good.body, source: "cache" } : fallback();
}

/** The PDF response for a route handler. */
export async function resumeResponse(variant: ResumeVariant): Promise<Response> {
  try {
    const { body, source } = await getResumePdf({ variant });
    const name = variant === "de" ? "Marlon-Kranz-Lebenslauf.pdf" : "Marlon-Kranz-Resume.pdf";
    return new Response(Buffer.from(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "public, max-age=3600",
        "X-Resume-Source": source,
      },
    });
  } catch {
    return new Response("Resume not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }
}
