import type { GithubData } from "../../src/lib/github";

export interface ResumeFigures {
  generatedAt: string;
  duxMergedPrs: number;
  duxOpenPrs: number;
  duxRepos: number;
  duxShellStars: number;
  duxShellStarsShort: string;
}

/** Resume style count, floored to one decimal so it never overstates: 8980 -> "8.9k". */
export function shortCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(Math.floor(n / 100) / 10).toFixed(1)}k`;
}

/** Throws rather than returning partial figures. */
export function figuresFromGithub(data: GithubData): ResumeFigures {
  const shell = data.repos["duxlabs-dev/dux-shell"];
  if (!data.org || !shell) throw new Error("GitHub data is missing org stats or dux-shell");
  return {
    generatedAt: data.fetchedAt,
    duxMergedPrs: data.org.merged,
    duxOpenPrs: data.org.open,
    duxRepos: data.org.repoCount,
    duxShellStars: shell.stars,
    duxShellStarsShort: shortCount(shell.stars),
  };
}
