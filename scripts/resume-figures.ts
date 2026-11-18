// Usage: bun run resume:figures <path/to/resume.typ> [--no-compile]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fetchGithubData } from "../src/lib/github";
import { siteConfig } from "../src/lib/site-config";
import { figuresFromGithub } from "./lib/resume-figures-format";

const args = process.argv.slice(2);
const typ = args.find((a) => !a.startsWith("--"));
if (!typ) {
  console.error("Usage: bun run resume:figures <path/to/resume.typ> [--no-compile]");
  process.exit(1);
}

function token(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const r = Bun.spawnSync(["gh", "auth", "token"]);
  const t = r.exitCode === 0 ? r.stdout.toString().trim() : "";
  if (!t) {
    console.error("No token: set GITHUB_TOKEN or run `gh auth login`.");
    process.exit(1);
  }
  return t;
}

const out = join(dirname(typ), "github-figures.json");
let old: Record<string, unknown> | null = null;
try {
  old = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
} catch {
  console.warn(`Warning: ${out} is not valid JSON; ignoring the old values.`);
}

let data;
let figures;
try {
  data = await fetchGithubData(
    { repos: ["duxlabs-dev/dux-shell"], prs: [], org: siteConfig.duxOrg, author: siteConfig.githubLogin },
    token(),
  );
  figures = figuresFromGithub(data);
} catch (e) {
  console.error(`Fetch failed, ${out} left untouched: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
if (data.org?.truncated) console.warn("Warning: PR list truncated, duxRepos may be undercounted.");
writeFileSync(out, JSON.stringify(figures, null, 2) + "\n");

for (const k of ["duxMergedPrs", "duxOpenPrs", "duxRepos", "duxShellStarsShort"] as const) {
  console.log(`${k}: ${old?.[k] ?? "-"} -> ${figures[k]}`);
}

if (!args.includes("--no-compile")) {
  const r = Bun.spawnSync(["typst", "compile", typ], { stdout: "inherit", stderr: "inherit" });
  if (r.exitCode !== 0) process.exit(r.exitCode ?? 1);
}
