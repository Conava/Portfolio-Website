import { expect, test } from "bun:test";
import type { GithubData } from "../../src/lib/github";
import { figuresFromGithub, shortCount } from "./resume-figures-format";

test("shortCount floors to one decimal", () => {
  expect(shortCount(8980)).toBe("8.9k");
  expect(shortCount(999)).toBe("999");
  expect(shortCount(1000)).toBe("1.0k");
  expect(shortCount(12345)).toBe("12.3k");
});

const data = (org: GithubData["org"]): GithubData => ({
  fetchedAt: "2026-11-09T00:00:00Z",
  repos: {
    "duxlabs-dev/dux-shell": {
      nameWithOwner: "duxlabs-dev/dux-shell",
      url: "u",
      stars: 8980,
      pushedAt: "x",
      latestRelease: null,
      latestTag: null,
    },
  },
  featured: {},
  org,
});

test("figuresFromGithub maps totals", () => {
  const f = figuresFromGithub(
    data({ org: "duxlabs-dev", author: "Conava", merged: 66, open: 8, repoCount: 7, prs: [], truncated: false }),
  );
  expect(f).toMatchObject({ duxMergedPrs: 66, duxOpenPrs: 8, duxRepos: 7, duxShellStars: 8980, duxShellStarsShort: "8.9k" });
});

test("figuresFromGithub throws without org stats or repo", () => {
  expect(() => figuresFromGithub(data(null))).toThrow();
  const d = data({ org: "o", author: "a", merged: 1, open: 0, repoCount: 1, prs: [], truncated: false });
  d.repos = {};
  expect(() => figuresFromGithub(d)).toThrow();
});
