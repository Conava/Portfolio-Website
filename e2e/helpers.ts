import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

// Tests that click the design toggle must use reducedMotion "reduce" for functional checks:
// the cross-document view transition hangs rAF and screenshots in headless Chromium.
export const ROOT = join(import.meta.dir, "..");

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer().unref().on("error", reject);
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

export function assertBuilt() {
  if (!existsSync(join(ROOT, ".next", "BUILD_ID"))) {
    throw new Error("No production build found (.next/BUILD_ID). Run `bun run build` before `bun run test:e2e`.");
  }
}

const STANDALONE = join(ROOT, ".next", "standalone");

/** Lays out .next/standalone as the Dockerfile's runner stage does; once per build. */
function prepareStandalone() {
  const buildId = readFileSync(join(ROOT, ".next", "BUILD_ID"), "utf8");
  const marker = join(STANDALONE, ".e2e-build-id");
  if (existsSync(marker) && readFileSync(marker, "utf8") === buildId) return;
  cpSync(join(ROOT, "public"), join(STANDALONE, "public"), { recursive: true });
  cpSync(join(ROOT, ".next", "static"), join(STANDALONE, ".next", "static"), { recursive: true });
  cpSync(join(ROOT, "content"), join(STANDALONE, "content"), { recursive: true });
  writeFileSync(marker, buildId);
}

type Stoppable = { stop(): unknown };
// Everything still running; killed on process exit or Ctrl-C even if a test crashed.
const running = new Set<Stoppable>();
const stopAll = () => {
  for (const s of running) void s.stop();
};
process.on("exit", stopAll);
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopAll();
    process.exit(1);
  });
}

export type Site = { base: string; stop(): Promise<void> };

/** The standalone server (`node server.js`, laid out as in Docker) on a free port. GITHUB_TOKEN, RESUME_PDF_URL, DESIGN, DESIGNS and GITHUB_GRAPHQL_URL are unset unless `env` sets them; ARTICLES and GERMAN are on unless `env` sets them. */
export async function startSite(env: Record<string, string> = {}): Promise<Site> {
  // Cached GitHub data from an earlier server must not leak into this one.
  prepareStandalone();
  rmSync(join(STANDALONE, ".next", "cache", "fetch-cache"), { recursive: true, force: true });
  const port = await freePort();
  const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "::", ARTICLES: "on", GERMAN: "on", ...env };
  for (const k of ["GITHUB_TOKEN", "RESUME_PDF_URL", "RESUME_PDF_URL_DE", "DESIGN", "DESIGNS", "GITHUB_GRAPHQL_URL"]) if (!(k in env)) delete childEnv[k];
  const proc: ChildProcess = spawn("node", ["server.js"], {
    cwd: STANDALONE,
    env: childEnv,
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const kill = (sig: NodeJS.Signals) => {
    try {
      if (proc.pid) process.kill(-proc.pid, sig); // whole process group
    } catch {}
  };
  const handle: Site = {
    base: `http://localhost:${port}`,
    async stop() {
      running.delete(handle);
      if (proc.exitCode !== null) return;
      const done = new Promise((r) => proc.once("exit", r));
      kill("SIGTERM");
      await Promise.race([done, new Promise((r) => setTimeout(r, 3000))]);
      kill("SIGKILL");
    },
  };
  running.add(handle);
  try {
    const deadline = Date.now() + 60_000;
    for (;;) {
      if (proc.exitCode !== null) throw new Error(`server exited with ${proc.exitCode}`);
      if (Date.now() > deadline) throw new Error(`server did not answer on ${handle.base}`);
      try {
        await fetch(handle.base, { redirect: "manual" });
        return handle;
      } catch {
        await Bun.sleep(200);
      }
    }
  } catch (e) {
    await handle.stop();
    throw e;
  }
}

/** Stub server on a free port. */
export function stub(handler: (req: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ port: 0, fetch: handler });
  const handle = {
    url: `http://localhost:${server.port}`,
    stop() {
      running.delete(handle);
      return server.stop(true);
    },
  };
  running.add(handle);
  return handle;
}

const PR_TITLES: Record<number, { title: string; state: "MERGED" | "OPEN" }> = {
  3768: { title: "STUB sysmon rework", state: "MERGED" },
  3727: { title: "STUB network editor", state: "OPEN" },
};
// Unusual on purpose: tests assert it is absent from pages rendered without GitHub data.
export const STUB_MERGED_TOTAL = 947;

/** GitHub GraphQL stub: answers every `pN: repository(...)` alias in the posted query. `fail` returns 500. */
export function githubStub(fail = false) {
  const calls: { auth: string | null }[] = [];
  const s = stub(async (req) => {
    calls.push({ auth: req.headers.get("authorization") });
    if (fail) return new Response("boom", { status: 500 });
    const { query } = (await req.json()) as { query: string };
    const data: Record<string, unknown> = {};
    const node = (number: number, title: string, state: string) => ({
      number,
      title,
      url: `https://github.com/duxlabs-dev/dux-shell/pull/${number}`,
      state,
      createdAt: "2026-05-01T00:00:00Z",
      mergedAt: state === "MERGED" ? "2026-06-01T00:00:00Z" : null,
      additions: 10,
      deletions: 2,
      reviews: { totalCount: 3 },
      repository: { nameWithOwner: "duxlabs-dev/dux-shell" },
    });
    for (const m of query.matchAll(/(p\d+): repository\([^)]*\) \{ pullRequest\(number: (\d+)\)/g)) {
      const t = PR_TITLES[Number(m[2])];
      data[m[1]] = { pullRequest: t ? node(Number(m[2]), t.title, t.state) : null };
    }
    data.merged = { issueCount: STUB_MERGED_TOTAL };
    data.open = { issueCount: 3 };
    data.list = {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: Object.entries(PR_TITLES).map(([n, t]) => node(Number(n), t.title, t.state)),
    };
    return Response.json({ data });
  });
  return { ...s, calls };
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

export const get = (site: Site, path: string, headers: Record<string, string> = {}) =>
  fetch(site.base + path, { headers, redirect: "manual" });

/** Repeats a replacement until nothing changes, so no tag can be re-formed from the leftovers. */
const untilStable = (s: string, re: RegExp) => {
  for (let prev = ""; prev !== s; ) [prev, s] = [s, s.replace(re, "")];
  return s;
};
/** Rendered markup only: drops <script> elements (the RSC payload repeats every UI string). */
export const markup = (html: string) => untilStable(html, /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi);
/** The text of an HTML fragment, with every tag removed. */
export const textOf = (html: string) => untilStable(html, /<[^>]*>/g);
