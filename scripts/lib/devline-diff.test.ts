import { expect, test } from "bun:test";
import { devlineDiff, hasDrift, type DevlineInventory } from "./devline-diff";

const article: DevlineInventory = {
  agents: [
    { id: "planner", model: "Opus" },
    { id: "implementer", model: "Sonnet" },
  ],
  skills: ["devline", "writing"],
  hooks: [{ id: "validate-bash.sh", event: "PreToolUse" }],
};

test("identical input has no drift", () => {
  const d = devlineDiff(structuredClone(article), article);
  expect(d).toEqual({ missing: [], gone: [], changed: [] });
  expect(hasDrift(d)).toBe(false);
});

test("model names compare case-insensitively", () => {
  const repo = { ...article, agents: [{ id: "planner", model: "opus" }, { id: "implementer", model: "sonnet" }] };
  expect(hasDrift(devlineDiff(repo, article))).toBe(false);
});

test("finds an added agent, a removed skill and a changed model", () => {
  const repo: DevlineInventory = {
    agents: [
      { id: "planner", model: "sonnet" },
      { id: "implementer", model: "sonnet" },
      { id: "tester", model: "haiku" },
    ],
    skills: ["devline"],
    hooks: [{ id: "validate-bash.sh", event: "PreToolUse" }],
  };
  const d = devlineDiff(repo, article);
  expect(d.missing).toEqual(["agent tester"]);
  expect(d.gone).toEqual(["skill writing"]);
  expect(d.changed).toEqual(["agent planner: model Opus -> sonnet"]);
  expect(hasDrift(d)).toBe(true);
});

test("hooks: added, removed and moved to another event", () => {
  const repo: DevlineInventory = {
    ...article,
    hooks: [
      { id: "validate-bash.sh", event: "PostToolUse" },
      { id: "pre-compact.sh", event: "PreCompact" },
    ],
  };
  const d = devlineDiff(repo, { ...article, hooks: [...article.hooks, { id: "old.sh", event: "Stop" }] });
  expect(d.missing).toEqual(["hook pre-compact.sh"]);
  expect(d.gone).toEqual(["hook old.sh"]);
  expect(d.changed).toEqual(["hook validate-bash.sh: event PreToolUse -> PostToolUse"]);
});
