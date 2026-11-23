/**
 * Compares the /devline article data with a claude-devline checkout and lists what to update.
 *
 *   bun scripts/devline-check.ts <path to the claude-devline checkout>
 *
 * Reads agents/*.md (name and `model` frontmatter), the skills/<name>/ folders and the hook
 * scripts registered in hooks/hooks.json. Exit 0: in sync; 1: drift; 2: bad input.
 */
import fs from "node:fs";
import path from "node:path";
import type { DevlineArticle } from "../src/lib/types";
import { devlineDiff, hasDrift, type DevlineInventory } from "./lib/devline-diff";

const ARTICLE = path.join(import.meta.dir, "..", "content", "en", "data", "article-devline.json");

function readRepo(dir: string): DevlineInventory {
  const agentsDir = path.join(dir, "agents");
  const agents = fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const front = fs.readFileSync(path.join(agentsDir, f), "utf-8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
      return { id: f.slice(0, -3), model: front.match(/^model:\s*["']?([\w.-]+)/m)?.[1] };
    });

  const skillsDir = path.join(dir, "skills");
  const skills = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, "SKILL.md")))
    .map((d) => d.name);

  type HookFile = { hooks: Record<string, { hooks: { command?: string }[] }[]> };
  const config: HookFile = JSON.parse(fs.readFileSync(path.join(dir, "hooks", "hooks.json"), "utf-8"));
  const hooks = Object.entries(config.hooks).flatMap(([event, entries]) =>
    entries.flatMap((e) =>
      e.hooks.flatMap((h) => {
        const script = h.command?.match(/hooks\/scripts\/([\w.-]+)/)?.[1];
        return script ? [{ id: script, event }] : [];
      }),
    ),
  );
  return { agents, skills, hooks };
}

function main() {
  const dir = process.argv[2];
  const parts = ["agents", "skills", path.join("hooks", "hooks.json")];
  if (!dir || !parts.every((p) => fs.existsSync(path.join(dir, p)))) {
    console.error("usage: bun scripts/devline-check.ts <path to the claude-devline checkout> (needs agents/, skills/, hooks/hooks.json)");
    process.exit(2);
  }
  const data: DevlineArticle = JSON.parse(fs.readFileSync(ARTICLE, "utf-8"));
  const article: DevlineInventory = {
    agents: data.agents.map((a) => ({ id: a.id, model: a.model })),
    skills: data.skills.map((s) => s.id),
    hooks: data.hooks.map((h) => ({ id: h.id, event: h.event })),
  };
  const repo = readRepo(dir);
  const drift = devlineDiff(repo, article);

  console.log(`repo: ${repo.agents.length} agents, ${repo.skills.length} skills, ${repo.hooks.length} hooks`);
  const list = (title: string, items: string[]) =>
    console.log(`\n${title} (${items.length})${items.map((i) => `\n  ${i}`).join("")}`);
  list("Missing in the article", drift.missing);
  list("Gone from the repo", drift.gone);
  list("Model or event changed", drift.changed);

  if (hasDrift(drift)) {
    console.log("\nUpdate content/{en,de}/data/article-devline.json (both locales), then run this again.");
    process.exit(1);
  }
  console.log("\nThe article matches the checkout.");
}

main();
