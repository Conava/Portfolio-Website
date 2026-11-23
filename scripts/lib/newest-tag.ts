/** The highest release tag (vMAJOR.MINOR.PATCH, no pre-release) in `git ls-remote --tags --refs` output, or null. */
export function newestTag(lsRemote: string): string | null {
  const tags = lsRemote
    .split("\n")
    .map((l) => l.split("refs/tags/")[1]?.trim())
    .filter((t): t is string => !!t && /^v\d+\.\d+\.\d+$/.test(t));
  const key = (t: string) => t.slice(1).split(".").map(Number);
  tags.sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  return tags.at(-1) ?? null;
}
