import { parsePrRef, type GithubData, type PullRequest } from "./github";

/** Live state for a PR ref: a featured hit first, else Marlon's org PR list (repo match is case-insensitive). */
export function lookupPr(github: GithubData | null, ref: string, defaultOwner: string): PullRequest | null {
  if (!github) return null;
  const p = parsePrRef(ref, defaultOwner);
  if (!p) return null;
  const featured = github.featured[ref];
  if (featured) return featured;
  const key = `${p.owner}/${p.name}`.toLowerCase();
  return github.org?.prs.find((pr) => pr.number === p.number && pr.repo.toLowerCase() === key) ?? null;
}
