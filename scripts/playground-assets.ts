// Builds the BPMNscript browser worker (@bpmn-script/web) and Monaco's editor worker, and puts
// them, the presets, the Monarch grammar and the editor core's source (@bpmn-script/editor)
// where the playground loads them. Source: the
// checkout in BPMNSCRIPT_DIR, else a shallow clone of package.json "bpmnscript" (repo, ref),
// overridable with BPMNSCRIPT_REPO / BPMNSCRIPT_REF. Ref "latest" means the newest vX.Y.Z tag
// on the remote. All outputs are gitignored.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import pkg from "../package.json";
import { newestTag } from "./lib/newest-tag";

const root = join(import.meta.dir, "..");
const WEB_OUT = ["server-worker.js", "monarch.js", "language-configuration.json", "LICENSE", "operaton-moddle.LICENSE", "THIRD_PARTY_NOTICES.txt"];
// Built in a staging dir with the same layout, then each replaces its target whole,
// so a failed run never leaves half-written outputs.
const BPMNSCRIPT = "public/playground/bpmnscript";
const PRESETS_DIR = "public/playground/presets";
const EDITOR_WORKER = "public/playground/editor.worker.js";
const GENERATED = "src/generated/bpmnscript";
// Copied as source, so the playground compiles it against its own Monaco (one instance per page).
const EDITOR_SRC = "packages/editor/src";

class Fail extends Error {}

function run(cmd: string[], cwd: string): string {
  const p = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (p.exitCode !== 0) throw new Fail(`\`${cmd.join(" ")}\` failed in ${cwd}:\n${(p.stderr.toString() + p.stdout.toString()).trim()}`);
  return p.stdout.toString().trim();
}

function requireTools(names: string[]) {
  for (const n of names) if (!Bun.which(n)) throw new Fail(`\`${n}\` is not on PATH.`);
  const major = Number(run(["node", "--version"], root).replace(/^v/, "").split(".")[0]);
  if (!(major >= 22)) throw new Fail(`node "${major}" is unusable: the BPMNscript build needs Node 22 or newer.`);
}

type Source = { dir: string; source: "git" | "local"; ref: string; commit: string; dirty: boolean };

function local(dir: string): Source {
  requireTools(["git", "node", "npm"]);
  if (!existsSync(join(dir, "packages/web/package.json")) || !existsSync(join(dir, EDITOR_SRC)))
    throw new Fail(`BPMNSCRIPT_DIR=${dir} is not a BPMNscript checkout with packages/web and packages/editor.`);
  if (!existsSync(join(dir, "node_modules"))) throw new Fail(`${dir} has no node_modules: run \`npm install\` there first.`);
  run(["npm", "run", "build:web"], dir);
  return {
    dir,
    source: "local",
    ref: run(["git", "rev-parse", "--abbrev-ref", "HEAD"], dir),
    commit: run(["git", "rev-parse", "HEAD"], dir),
    dirty: run(["git", "status", "--porcelain"], dir) !== "",
  };
}

function git(repo: string, ref: string, fromEnv: boolean): Source {
  const fix = [
    "Fix: set BPMNSCRIPT_DIR to a local BPMNscript checkout (for example in .env.local),",
    `or push and tag ${ref} in ${repo}: git tag ${ref} && git push origin ${ref}`,
    'The pinned ref is "bpmnscript.ref" in package.json.',
  ].join("\n");
  try {
    requireTools(["git", "node", "npm"]);
  } catch (e) {
    throw new Fail(`${(e as Error).message}\n${fix}`);
  }
  if (!/^[\w.\-/]+$/.test(ref) || ref.split("/").some((p) => p === "." || p === ".."))
    throw new Fail(`Invalid BPMNscript ref "${ref}".\n${fix}`);
  const dir = join(root, ".cache/bpmnscript", ref.replaceAll("/", "_"));
  const stampFile = join(dir, ".portfolio-stamp.json");
  const isSha = /^[0-9a-f]{40}$/.test(ref);
  if (existsSync(stampFile)) {
    const s = JSON.parse(readFileSync(stampFile, "utf8"));
    // A branch moves, so only a tag or a SHA is reused.
    if (s.repo === repo && s.ref === ref && s.kind !== "branch") return { dir, source: "git", ref, commit: s.commit, dirty: false };
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  let kind: "sha" | "tag" | "branch";
  try {
    if (isSha) {
      mkdirSync(dir);
      run(["git", "init", "-q"], dir);
      run(["git", "remote", "add", "origin", repo], dir);
      run(["git", "fetch", "-q", "--depth", "1", "origin", ref], dir);
      run(["git", "checkout", "-q", "FETCH_HEAD"], dir);
      kind = "sha";
    } else {
      run(["git", "clone", "-q", "--depth", "1", "--branch", ref, "--", repo, dir], root);
      kind = run(["git", "tag", "--list", ref], dir) === ref ? "tag" : "branch";
    }
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw new Fail(`Cannot fetch BPMNscript ref "${ref}" from ${repo}.\n${(e as Error).message}\n${fix}`);
  }
  run(["npm", "ci", "--no-audit", "--no-fund"], dir);
  run(["npm", "run", "build:web"], dir);
  const commit = run(["git", "rev-parse", "HEAD"], dir);
  if (kind === "branch" && !fromEnv) console.warn(`playground:assets: "${ref}" is a branch, so it is rebuilt every run; pin a tag.`);
  writeFileSync(stampFile, JSON.stringify({ repo, ref, kind, commit }));
  return { dir, source: "git", ref, commit, dirty: false };
}

function resolveRef(repo: string, ref: string): string {
  if (ref !== "latest") return ref;
  requireTools(["git"]);
  const tag = newestTag(run(["git", "ls-remote", "--tags", "--refs", "--", repo], root));
  if (!tag) throw new Fail(`No vX.Y.Z release tag found in ${repo}.`);
  return tag;
}

async function main() {
  const envDir = process.env.BPMNSCRIPT_DIR?.trim();
  const repo = process.env.BPMNSCRIPT_REPO || pkg.bpmnscript.repo;
  const src = envDir
    ? local(envDir)
    : git(repo, resolveRef(repo, process.env.BPMNSCRIPT_REF || pkg.bpmnscript.ref), !!process.env.BPMNSCRIPT_REF);

  const stage = join(root, ".cache/playground-stage");
  rmSync(stage, { recursive: true, force: true });
  const out = (target: string, f = "") => join(stage, target, f);
  const webOut = join(src.dir, "packages/web/out");

  const editorSrc = join(src.dir, EDITOR_SRC);
  if (!existsSync(editorSrc))
    throw new Fail(`${src.ref} in ${src.dir} has no ${EDITOR_SRC} (@bpmn-script/editor); the playground needs a BPMNscript release that has it.`);
  for (const f of WEB_OUT) cpSync(join(webOut, f), out(BPMNSCRIPT, f));
  // tsc runs without outDir can leave .js and .d.ts beside the sources; only the .ts files are the package.
  for (const f of readdirSync(editorSrc)) if (f.endsWith(".ts") && !f.endsWith(".d.ts")) cpSync(join(editorSrc, f), out(GENERATED, `editor/${f}`));
  const { PRESETS }: { PRESETS: readonly { id: string; kind: "source" | "bpmn"; path: string }[] } = await import(join(editorSrc, "presets.ts"));
  for (const p of PRESETS) {
    const from = join(src.dir, p.path);
    if (!existsSync(from)) throw new Fail(`Preset "${p.id}": ${p.path} is missing in the BPMNscript checkout at ${src.dir}.`);
    cpSync(from, out(PRESETS_DIR, `${p.id}.${p.kind === "source" ? "bpmnscript" : "bpmn"}`));
  }

  // The worker monaco-languageclient's default classic-mode loader points at.
  const built = await Bun.build({
    entrypoints: [Bun.resolveSync("@codingame/monaco-vscode-editor-api/esm/vs/editor/editor.worker.js", root)],
    target: "browser",
    format: "esm",
    minify: true,
    outdir: dirname(out(EDITOR_WORKER)),
    naming: "editor.worker.js",
  });
  if (!built.success) throw new Fail(`Bun.build of the Monaco editor worker failed:\n${built.logs.join("\n")}`);

  const version: string = JSON.parse(readFileSync(join(src.dir, "packages/web/package.json"), "utf8")).version;
  cpSync(join(webOut, "monarch.js"), out(GENERATED, "monarch.js"));
  cpSync(join(webOut, "language-configuration.json"), out(GENERATED, "language-configuration.json"));
  writeFileSync(
    out(GENERATED, "monarch.d.ts"),
    'import type { languages } from "@codingame/monaco-vscode-editor-api";\ndeclare const monarch: languages.IMonarchLanguage;\nexport default monarch;\n',
  );
  const { dir: _, ...meta } = src;
  writeFileSync(out(GENERATED, "meta.json"), JSON.stringify({ version, ...meta, builtAt: new Date().toISOString() }, null, 2) + "\n");

  // All-or-nothing: move the old targets aside, move the new ones in, then drop the old; undo on failure.
  const targets = [BPMNSCRIPT, PRESETS_DIR, EDITOR_WORKER, GENERATED].map((t) => join(root, t));
  const staged = [BPMNSCRIPT, PRESETS_DIR, EDITOR_WORKER, GENERATED].map((t) => out(t));
  const aside: string[] = [];
  const placed: string[] = [];
  try {
    for (const dest of targets) {
      rmSync(`${dest}.old`, { recursive: true, force: true });
      if (existsSync(dest)) {
        renameSync(dest, `${dest}.old`);
        aside.push(dest);
      }
    }
    targets.forEach((dest, i) => {
      mkdirSync(dirname(dest), { recursive: true });
      renameSync(staged[i], dest);
      placed.push(dest);
    });
  } catch (e) {
    for (const dest of placed) rmSync(dest, { recursive: true, force: true });
    for (const dest of aside) renameSync(`${dest}.old`, dest);
    throw e;
  }
  for (const dest of aside) rmSync(`${dest}.old`, { recursive: true, force: true });
  rmSync(stage, { recursive: true, force: true });

  const dirty = src.dirty ? " (dirty)" : "";
  console.log(`playground:assets: ${src.source} ${src.ref} @ ${src.commit.slice(0, 12)}${dirty}, @bpmn-script/web ${version}`);
}

try {
  await main();
} catch (e) {
  rmSync(join(root, ".cache/playground-stage"), { recursive: true, force: true });
  if (!(e instanceof Fail)) throw e;
  console.error(`playground:assets failed.\n${e.message}`);
  process.exit(1);
}
