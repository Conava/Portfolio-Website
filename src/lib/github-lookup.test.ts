import { describe, expect, test } from "bun:test";
import type { GithubData, PullRequest } from "./github";
import { lookupPr } from "./github-lookup";

const pr = (repo: string, number: number, title: string): PullRequest => ({
  repo, number, title, url: `https://github.com/${repo}/pull/${number}`, state: "MERGED",
  createdAt: "2026-01-01T00:00:00Z", mergedAt: null, additions: 1, deletions: 1, reviews: 0,
});
const data = (featured: GithubData["featured"], prs: PullRequest[]): GithubData => ({
  fetchedAt: "2026-01-01T00:00:00Z", repos: {}, featured,
  org: { org: "duxlabs-dev", author: "a", merged: 0, open: 0, repoCount: 0, prs, truncated: false },
});
const OWNER = "duxlabs-dev";

describe("lookupPr", () => {
  test("featured hit wins over the list", () => {
    const g = data({ "dux-shell#1": pr("duxlabs-dev/dux-shell", 1, "featured") }, [pr("duxlabs-dev/dux-shell", 1, "list")]);
    expect(lookupPr(g, "dux-shell#1", OWNER)?.title).toBe("featured");
  });
  test("a ref only in org.prs resolves, repo case-insensitive", () => {
    const g = data({}, [pr("duxlabs-dev/Dux-Shell", 4150, "x")]);
    expect(lookupPr(g, "dux-shell#4150", OWNER)?.title).toBe("x");
    expect(lookupPr(g, "DUXLABS-DEV/dux-shell#4150", OWNER)?.title).toBe("x");
  });
  test("unknown ref, invalid ref and null github give null", () => {
    const g = data({}, [pr("duxlabs-dev/dux-shell", 1, "x")]);
    expect(lookupPr(g, "dux-shell#2", OWNER)).toBeNull();
    expect(lookupPr(g, "nonsense", OWNER)).toBeNull();
    expect(lookupPr(null, "dux-shell#1", OWNER)).toBeNull();
  });
});
